import fs from "node:fs";
import type { AdminBackupOverview, AdminBackupRecord, AdminBackupRestoreResult, AdminBackupStorageInfo } from "@/domain/admin-console";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/server/audit";
import { appError, AppError, normalizeApiError } from "@/server/errors";
import { assertSafeBackupId, createBackupId, createSafetyBackupId, isSafeBackupId } from "@/server/admin/backup-id";
import {
  applyStoredFileFacts,
  parseBackupManifest,
  recordFromDumpFile,
  sortBackupsNewestFirst,
  storageFileMissingMessage,
} from "@/server/admin/backup-records";
import { getBackupStorage, type AdminBackupStorage } from "@/server/admin/backup-storage";
import { getAppCommit, getAppVersion, getDatabaseUrl, getPgDumpExecutable, getPgRestoreExecutable } from "@/server/admin/config";
import { beginDatabaseMaintenance, endDatabaseMaintenance } from "@/server/admin/database-maintenance";
import { parseDatabaseConnection, runPgDump, runPgRestore, verifyPgRestoreArchive } from "@/server/admin/pg-tools";
import { redactSecrets } from "@/server/admin/redact";

export const adminBackupEntityType = "AdminBackup";
export const adminRestoreEntityType = "AdminBackupRestore";

const dumpExtension = ".dump";
const manifestExtension = ".json";
const partialExtension = ".dump.part";

export type BackupRuntime = {
  storage: AdminBackupStorage;
  runDump: (input: { databaseUrl: string; executable: string; targetPath: string }) => Promise<{ sizeBytes: number }>;
  recordAudit: (action: "CREATE" | "DELETE", record: AdminBackupRecord, actorId: string | null) => Promise<void>;
};

export type BackupDownload = {
  backupId: string;
  fileName: string;
  sizeBytes: number;
  stream: ReadableStream<Uint8Array>;
};

export async function listBackups(runtime: Partial<BackupRuntime> = {}): Promise<AdminBackupRecord[]> {
  const { storage } = resolveRuntime(runtime);
  const files = await storage.listFiles();
  const dumpFiles = new Map(
    files.filter((file) => file.fileName.endsWith(dumpExtension)).map((file) => [file.fileName, file] as const),
  );
  const manifestIds = files
    .filter((file) => file.fileName.endsWith(manifestExtension))
    .map((file) => file.fileName.slice(0, -manifestExtension.length));

  const ids = new Set<string>([...manifestIds, ...[...dumpFiles.keys()].map((fileName) => fileName.slice(0, -dumpExtension.length))]);
  const records: AdminBackupRecord[] = [];
  for (const id of ids) {
    if (!isSafeBackupId(id)) continue;
    const dumpFile = dumpFiles.get(`${id}${dumpExtension}`) ?? null;
    const manifest = parseBackupManifest(await storage.readJson(`${id}${manifestExtension}`));
    if (!manifest && !dumpFile) continue;
    const base = manifest ?? recordFromDumpFile({
      id,
      fileName: `${id}${dumpExtension}`,
      sizeBytes: dumpFile?.sizeBytes ?? 0,
      createdAt: dumpFile?.createdAt ?? new Date(),
    });
    records.push(applyStoredFileFacts(base, dumpFile));
  }
  return sortBackupsNewestFirst(records);
}

export async function getBackupOverview(runtime: Partial<BackupRuntime> = {}): Promise<AdminBackupOverview> {
  const { storage } = resolveRuntime(runtime);
  const backups = await listBackups({ storage });
  return {
    storage: describeBackupStorage(storage),
    totalCount: backups.length,
    lastBackup: backups[0] ?? null,
  };
}

export function describeBackupStorage(storage: AdminBackupStorage = getBackupStorage()): AdminBackupStorageInfo {
  return { kind: storage.kind, directory: storage.directory };
}

// Internal marker that marks a dump as part of the restore procedure (the safety backup), so it is
// not rejected by the restore-in-flight guard in createBackup. Not part of the public input type.
export const restoreBypassFlag = "__restoreSafetyBypass__";
type BackupCreateInput = { actorId: string | null; backupId?: string; [restoreBypassFlag]?: boolean };

export async function createBackup(input: BackupCreateInput, runtime: Partial<BackupRuntime> = {}): Promise<AdminBackupRecord> {
  // A user-triggered dump must not start while a restore is rebuilding the schema: pg_dump would
  // read half-dropped objects and its manifest would describe a database that no longer exists.
  // The safety backup taken by the restore itself opts out via the internal flag, because it runs
  // before the maintenance barrier is raised and is part of the restore procedure.
  if (restoreInFlight && !input[restoreBypassFlag]) {
    throw appError("RESTORE_IN_PROGRESS", "Another database restore is already running", 409);
  }
  const { storage, runDump, recordAudit } = resolveRuntime(runtime);
  await storage.ensureReady();

  // An explicit identifier is only used for the pre-restore safety backup, whose name has to be
  // recognisable; it is validated by the same rules as any other backup id.
  const id = input.backupId === undefined ? createBackupId() : assertSafeBackupId(input.backupId);
  const fileName = `${id}${dumpExtension}`;
  const manifestFileName = `${id}${manifestExtension}`;
  const partialFileName = `${id}${partialExtension}`;
  const createdAt = new Date();

  const base = {
    id,
    fileName,
    createdAt: createdAt.toISOString(),
    appVersion: getAppVersion(),
    appCommit: getAppCommit(),
    schemaMigration: await readSchemaMigration(),
    createdById: input.actorId,
  };

  try {
    const { sizeBytes } = await runDump({
      databaseUrl: getDatabaseUrl(),
      executable: getPgDumpExecutable(),
      targetPath: storage.resolvePath(partialFileName),
    });
    // The dump is renamed only after a successful exit, so a partial file can never be
    // listed or downloaded as a valid backup.
    await fs.promises.rename(storage.resolvePath(partialFileName), storage.resolvePath(fileName));

    const record: AdminBackupRecord = { ...base, sizeBytes, status: "COMPLETED", message: null };
    await storage.writeJson(manifestFileName, record);
    await recordAudit("CREATE", record, input.actorId);
    return record;
  } catch (error) {
    try {
      await storage.removeFile(partialFileName);
    } catch {
      // Partial cleanup is best effort; the failed manifest still records the attempt.
    }
    const failed: AdminBackupRecord = { ...base, sizeBytes: null, status: "FAILED", message: describeBackupFailure(error) };
    try {
      await storage.writeJson(manifestFileName, failed);
    } catch {
      // The original failure is the actionable error; a lost failure manifest must not mask it.
    }
    throw error;
  }
}

export async function deleteBackup(input: { backupId: string; actorId: string | null }, runtime: Partial<BackupRuntime> = {}): Promise<AdminBackupRecord> {
  const { storage, recordAudit } = resolveRuntime(runtime);
  const backupId = assertSafeBackupId(input.backupId);
  const record = (await listBackups({ storage })).find((entry) => entry.id === backupId);
  if (!record) throw appError("BACKUP_NOT_FOUND", "Backup was not found", 404, { backupId });

  await storage.removeFile(record.fileName);
  await storage.removeFile(`${backupId}${manifestExtension}`);
  await recordAudit("DELETE", record, input.actorId);
  return record;
}

export async function openBackupDownload(input: { backupId: string }, runtime: Partial<BackupRuntime> = {}): Promise<BackupDownload> {
  const { storage } = resolveRuntime(runtime);
  const backupId = assertSafeBackupId(input.backupId);
  const fileName = `${backupId}${dumpExtension}`;
  const { sizeBytes, stream } = await storage.openReadStream(fileName);
  return { backupId, fileName, sizeBytes, stream };
}

export type RestoreOperation = "database_restore_started" | "database_restore_completed" | "database_restore_failed";

export type RestoreAuditEntry = {
  operation: RestoreOperation;
  backupId: string;
  actorId: string;
  durationMs: number | null;
  errorCode: string | null;
  errorDetail: string | null;
  safetyBackupId: string | null;
};

export type RestoreRuntime = {
  storage: AdminBackupStorage;
  createSafetyBackup: (input: { actorId: string; backupId: string }) => Promise<AdminBackupRecord>;
  verifyArchive: (input: { executable: string; archivePath: string }) => Promise<{ entries: number }>;
  runRestore: (input: { databaseUrl: string; executable: string; archivePath: string }) => Promise<{ durationMs: number }>;
  verifyDatabase: () => Promise<void>;
  readSchemaMigration: () => Promise<string | null>;
  resetConnections: () => Promise<void>;
  recordAudit: (entry: RestoreAuditEntry) => Promise<void>;
  maintenance: { begin: () => void; end: () => void };
  now: () => Date;
};

// Application-level lock: two restores in the same process would fight over the same schema and
// the same safety backup naming, so the second one is rejected instead of queued. The lock is
// released in a finally block and therefore also after a failure.
let restoreInFlight = false;

export function isRestoreInProgress(): boolean {
  return restoreInFlight;
}

export async function restoreBackup(
  input: { backupId: string; actorId: string },
  runtime: Partial<RestoreRuntime> = {},
): Promise<AdminBackupRestoreResult> {
  const resolved = resolveRestoreRuntime(runtime);
  const backupId = assertSafeBackupId(input.backupId);

  if (restoreInFlight) {
    throw appError("RESTORE_IN_PROGRESS", "Another database restore is already running", 409, { backupId });
  }

  restoreInFlight = true;
  try {
    return await performRestore({ backupId, actorId: input.actorId }, resolved);
  } finally {
    restoreInFlight = false;
  }
}
async function performRestore(
  input: { backupId: string; actorId: string },
  runtime: RestoreRuntime,
): Promise<AdminBackupRestoreResult> {
  const startedAt = Date.now();
  const backups = await listBackups({ storage: runtime.storage });
  const record = backups.find((entry) => entry.id === input.backupId);
  if (!record) throw appError("BACKUP_NOT_FOUND", "Backup was not found", 404, { backupId: input.backupId });
  const dumpFile = await runtime.storage.statFile(record.fileName);
  if (!dumpFile) {
    // A vanished dump is listed as a FAILED record with a marker, so the operator is told which of
    // the two problems caused the refusal: the file is gone, or the dump never completed.
    const vanished = record.status === "COMPLETED" || record.message === storageFileMissingMessage;
    throw vanished
      ? appError("RESTORE_BACKUP_FILE_MISSING", "Backup file is missing from the backup directory", 404, { backupId: input.backupId })
      : appError("RESTORE_BACKUP_UNUSABLE", "Backup did not complete and cannot be restored", 409, {
        backupId: input.backupId,
        status: record.status,
      });
  }

  if (record.status !== "COMPLETED") {
    throw appError("RESTORE_BACKUP_UNUSABLE", "Backup did not complete and cannot be restored", 409, {
      backupId: input.backupId,
      status: record.status,
    });
  }

  // Configuration and the archive path are resolved before anything is written: the request only
  // ever carried an id, and resolvePath re-checks the file name and keeps the file inside the
  // backup storage root.
  const databaseUrl = getDatabaseUrl();
  const restoreExecutable = getPgRestoreExecutable();
  const archivePath = runtime.storage.resolvePath(record.fileName);

  await recordRestoreAudit(runtime, {
    operation: "database_restore_started",
    backupId: record.id,
    actorId: input.actorId,
    durationMs: null,
    errorCode: null,
    errorDetail: null,
    safetyBackupId: null,
  });

  let safetyBackupId: string | null = null;
  let maintenanceActive = false;

  try {
    const archive = await runtime.verifyArchive({ executable: restoreExecutable, archivePath });
    const previousSchemaMigration = await runtime.readSchemaMigration();

    safetyBackupId = createSafetyBackupId(runtime.now(), backups.map((entry) => entry.id));
    const safetyBackup = await runtime.createSafetyBackup({ actorId: input.actorId, backupId: safetyBackupId });

    runtime.maintenance.begin();
    maintenanceActive = true;
    // Pooled connections keep prepared statements that point at objects the restore is about to
    // drop, so the pool is closed first and re-established lazily by the verification queries.
    await runtime.resetConnections();
    const { durationMs } = await runtime.runRestore({ databaseUrl, executable: restoreExecutable, archivePath });
    await runtime.verifyDatabase();
    runtime.maintenance.end();
    maintenanceActive = false;

    const restoredSchemaMigration = await runtime.readSchemaMigration();
    await recordRestoreAudit(runtime, {
      operation: "database_restore_completed",
      backupId: record.id,
      actorId: input.actorId,
      durationMs: Date.now() - startedAt,
      errorCode: null,
      errorDetail: null,
      safetyBackupId,
    });

    return {
      backupId: record.id,
      backupFileName: record.fileName,
      restoredAt: new Date().toISOString(),
      durationMs,
      archiveEntries: archive.entries,
      safetyBackup,
      previousSchemaMigration,
      restoredSchemaMigration,
      schemaChanged: previousSchemaMigration !== restoredSchemaMigration,
    };
  } catch (error) {
    const normalized = normalizeApiError(error);
    await recordRestoreAudit(runtime, {
      operation: "database_restore_failed",
      backupId: record.id,
      actorId: input.actorId,
      durationMs: Date.now() - startedAt,
      errorCode: normalized.code,
      errorDetail: describeRestoreFailure(error),
      safetyBackupId,
    });
    throw error;
  } finally {
    if (maintenanceActive) runtime.maintenance.end();
  }
}



function resolveRestoreRuntime(runtime: Partial<RestoreRuntime>): RestoreRuntime {
  const storage = runtime.storage ?? getBackupStorage();
  return {
    storage,
    createSafetyBackup: runtime.createSafetyBackup ?? ((input) => createBackup({ ...input, [restoreBypassFlag]: true }, { storage })),
    verifyArchive: runtime.verifyArchive ?? verifyPgRestoreArchive,
    runRestore: runtime.runRestore ?? runPgRestore,
    verifyDatabase: runtime.verifyDatabase ?? verifyRestoredDatabase,
    readSchemaMigration: runtime.readSchemaMigration ?? readSchemaMigration,
    resetConnections: runtime.resetConnections ?? (() => prisma.$disconnect()),
    recordAudit: runtime.recordAudit ?? writeRestoreAudit,
    maintenance: runtime.maintenance ?? { begin: beginDatabaseMaintenance, end: endDatabaseMaintenance },
    now: runtime.now ?? (() => new Date()),
  };
}

// A restore is verified from the database itself: the snapshot has to expose the Role Engine
// schema, not just any tables.
async function verifyRestoredDatabase(): Promise<void> {
  try {
    const [tables] = await prisma.$queryRaw<Array<{ tables: bigint }>>`
      SELECT count(*)::bigint AS tables FROM information_schema.tables WHERE table_schema = current_schema()
    `;
    if (Number(tables?.tables ?? 0) <= 0) {
      throw appError("RESTORE_VERIFICATION_FAILED", "Restored database does not contain any tables", 500);
    }

    const [migrationTable] = await prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present
    `;
    if (!migrationTable?.present) {
      throw appError("RESTORE_VERIFICATION_FAILED", "Restored database is missing the Role Engine schema", 500);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const normalized = normalizeApiError(error);
    throw appError("RESTORE_VERIFICATION_FAILED", "Restored database could not be verified", 500, {
      reason: redactSecrets(`${normalized.code}: ${normalized.message}`, [databasePassword()]),
    });
  }
}

// The restore itself is either invisible or table-wide in the database it replaces, so the audit
// trail also goes to the process log. Audit rows are best effort: a snapshot may predate the
// current AuditLog shape, and a late audit failure must never mask the actual restore outcome.
async function writeRestoreAudit(entry: RestoreAuditEntry): Promise<void> {
  logRestoreEvent(entry);
  try {
    await writeAudit({
      actorId: entry.actorId,
      entityType: adminRestoreEntityType,
      entityId: entry.backupId,
      action: "UPDATE",
      newValue: {
        operation: entry.operation,
        backupId: entry.backupId,
        safetyBackupId: entry.safetyBackupId,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
        errorDetail: entry.errorDetail,
      },
      metadata: { operation: entry.operation, errorCode: entry.errorCode, errorDetail: entry.errorDetail },
    });
  } catch (error) {
    console.error("admin restore audit entry could not be persisted", redactSecrets(normalizeApiError(error).code, []));
  }
}

async function recordRestoreAudit(runtime: RestoreRuntime, entry: RestoreAuditEntry): Promise<void> {
  try {
    await runtime.recordAudit(entry);
  } catch (error) {
    console.error("admin restore audit callback failed", redactSecrets(normalizeApiError(error).code, []));
  }
}

// Single-line operational record: no pid, no host, no credentials, no shell command. Tool output is
// redacted and truncated before it reaches the log or the audit row.
function logRestoreEvent(entry: RestoreAuditEntry): void {
  console.info(JSON.stringify({
    event: entry.operation,
    backupId: entry.backupId,
    actorId: entry.actorId,
    safetyBackupId: entry.safetyBackupId,
    durationMs: entry.durationMs,
    errorCode: entry.errorCode,
    errorDetail: entry.errorDetail,
    at: new Date().toISOString(),
  }));
}

function describeRestoreFailure(error: unknown): string {
  const normalized = normalizeApiError(error);
  const details = normalized.details;
  const stderr = isRecord(details) && typeof details.stderr === "string" ? details.stderr : "";
  return redactSecrets(`${normalized.code}: ${normalized.message}${stderr ? ` ${stderr}` : ""}`, [databasePassword()], 500);
}

function resolveRuntime(runtime: Partial<BackupRuntime>): BackupRuntime {
  return {
    storage: runtime.storage ?? getBackupStorage(),
    runDump: runtime.runDump ?? runPgDump,
    recordAudit: runtime.recordAudit ?? writeBackupAudit,
  };
}

async function readSchemaMigration(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 1
    `;
    return rows[0]?.migration_name ?? null;
  } catch {
    // Best effort metadata: an unmigrated or partially provisioned database must not block backups.
    return null;
  }
}

function describeBackupFailure(error: unknown): string {
  const normalized = normalizeApiError(error);
  const details = normalized.details;
  const stderr = isRecord(details) && typeof details.stderr === "string" ? details.stderr : "";
  return redactSecrets(`${normalized.code}: ${normalized.message}${stderr ? ` ${stderr}` : ""}`, [databasePassword()], 1_000);
}

function databasePassword(): string | null {
  try {
    return parseDatabaseConnection(getDatabaseUrl()).password;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function writeBackupAudit(action: "CREATE" | "DELETE", record: AdminBackupRecord, actorId: string | null) {
  await writeAudit({
    actorId,
    entityType: adminBackupEntityType,
    entityId: record.id,
    action,
    newValue: {
      fileName: record.fileName,
      status: record.status,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt,
    },
    metadata: { sizeBytes: record.sizeBytes, status: record.status },
  });
}
