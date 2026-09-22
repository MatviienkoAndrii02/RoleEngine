import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { AppError, appError } from "@/server/errors";
import { parseBackupManifest } from "@/server/admin/backup-records";
import {
  createBackup,
  deleteBackup,
  isRestoreInProgress,
  listBackups,
  openBackupDownload,
  restoreBackup,
  restoreBypassFlag,
  type BackupRuntime,
  type RestoreAuditEntry,
  type RestoreRuntime,
} from "@/server/admin/backups";
import { createLocalBackupStorage, type AdminBackupStorage } from "@/server/admin/backup-storage";

const actorId = "user_admin";
const dumpBytes = "custom-format-dump";
const safetyBackupId = "pre-restore-2026-09-22-14-30-00";
const temporaryDirectories: string[] = [];

type TestRuntime = {
  directory: string;
  storage: AdminBackupStorage;
  auditActions: string[];
  runtime: Partial<BackupRuntime>;
};

type RestoreHarness = {
  runtime: Partial<RestoreRuntime>;
  audit: RestoreAuditEntry[];
  runInputs: Array<{ executable: string; archivePath: string }>;
  maintenance: { begins: number; ends: number; active: boolean };
  verifyCalls: { count: number };
};

async function createTestRuntime(overrides: Partial<BackupRuntime> = {}): Promise<TestRuntime> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "role-engine-admin-backups-"));
  temporaryDirectories.push(directory);
  const storage = createLocalBackupStorage(directory);
  const auditActions: string[] = [];
  const runtime: Partial<BackupRuntime> = {
    storage,
    recordAudit: async (action: string) => {
      auditActions.push(action);
    },
    runDump: async (input) => {
      await fs.promises.writeFile(input.targetPath, dumpBytes, "utf8");
      return { sizeBytes: dumpBytes.length };
    },
    ...overrides,
  };
  return { directory, storage, auditActions, runtime };
}

// The restore runtime is injected in full, so the destructive parts (pg_restore, maintenance flag,
// database verification) are observed instead of executed.
function createRestoreHarness(context: TestRuntime, overrides: Partial<RestoreRuntime> = {}): RestoreHarness {
  const audit: RestoreAuditEntry[] = [];
  const runInputs: Array<{ executable: string; archivePath: string }> = [];
  const maintenance = { begins: 0, ends: 0, active: false };
  const verifyCalls = { count: 0 };

  const runtime: Partial<RestoreRuntime> = {
    storage: context.storage,
    createSafetyBackup: (input) => createBackup({ ...input, [restoreBypassFlag]: true } as Parameters<typeof createBackup>[0], context.runtime),
    verifyArchive: async () => ({ entries: 128 }),
    runRestore: async (input) => {
      runInputs.push({ executable: input.executable, archivePath: input.archivePath });
      return { durationMs: 42 };
    },
    verifyDatabase: async () => {
      verifyCalls.count += 1;
    },
    readSchemaMigration: async () => "20260101000000_init",
    resetConnections: async () => undefined,
    recordAudit: async (entry) => {
      audit.push(entry);
    },
    maintenance: {
      begin: () => {
        maintenance.begins += 1;
        maintenance.active = true;
      },
      end: () => {
        maintenance.ends += 1;
        maintenance.active = false;
      },
    },
    now: () => new Date("2026-09-22T14:30:00.000Z"),
    ...overrides,
  };

  return { runtime, audit, runInputs, maintenance, verifyCalls };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  const box: { resolve?: () => void } = {};
  const promise = new Promise<void>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: () => box.resolve?.() };
}

function rejectWithCode(code: string, status?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  };
}

describe("admin backup service", () => {
  after(async () => {
    for (const directory of temporaryDirectories) {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it("creates a dump with metadata and audits the attempt", async () => {
    const context = await createTestRuntime();
    const record = await createBackup({ actorId }, context.runtime);

    assert.equal(record.status, "COMPLETED");
    assert.equal(record.sizeBytes, dumpBytes.length);
    assert.equal(record.createdById, actorId);
    assert.deepEqual(context.auditActions, ["CREATE"]);

    const listed = await listBackups(context.runtime);
    assert.deepEqual(listed.map((entry) => entry.id), [record.id]);

    const manifest = parseBackupManifest(await context.storage.readJson(`${record.id}.json`));
    assert.equal(manifest?.fileName, `${record.id}.dump`);
    assert.equal(manifest?.status, "COMPLETED");

    const storageFiles = await context.storage.listFiles();
    assert.deepEqual(storageFiles.map((file) => file.fileName).sort(), [`${record.id}.dump`, `${record.id}.json`].sort());
  });

  it("records a failed attempt without leaving a partial dump behind", async () => {
    const context = await createTestRuntime({
      runDump: async (input) => {
        await fs.promises.writeFile(input.targetPath, "partial", "utf8");
        throw new AppError("BACKUP_CREATE_FAILED", "Backup command failed", 500, { stderr: "pg_dump: error: boom" });
      },
    });

    await assert.rejects(() => createBackup({ actorId }, context.runtime), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "BACKUP_CREATE_FAILED");
      return true;
    });

    assert.deepEqual(context.auditActions, []);
    const backups = await listBackups(context.runtime);
    assert.equal(backups.length, 1);
    assert.equal(backups[0].status, "FAILED");
    assert.equal(backups[0].message?.includes("BACKUP_CREATE_FAILED"), true);
    assert.equal(backups[0].message?.includes("pg_dump: error: boom"), true);

    const storageFiles = await context.storage.listFiles();
    assert.equal(storageFiles.some((file) => file.fileName.endsWith(".dump") || file.fileName.endsWith(".part")), false);
  });

  it("reports a manifest whose dump file disappeared as failed and lists unmanaged dumps", async () => {
    const context = await createTestRuntime();
    const created = await createBackup({ actorId }, context.runtime);
    await fs.promises.rm(path.join(context.directory, `${created.id}.dump`));

    const unmanagedId = "backup-20260920t020000z-deadbeef";
    await fs.promises.writeFile(path.join(context.directory, `${unmanagedId}.dump`), dumpBytes, "utf8");

    const backups = await listBackups(context.runtime);
    const broken = backups.find((entry) => entry.id === created.id);
    assert.equal(broken?.status, "FAILED");
    assert.equal(broken?.sizeBytes, null);

    const unmanaged = backups.find((entry) => entry.id === unmanagedId);
    assert.equal(unmanaged?.status, "COMPLETED");
    assert.equal(unmanaged?.sizeBytes, dumpBytes.length);
  });

  it("streams a download for an existing dump only", async () => {
    const context = await createTestRuntime();
    const created = await createBackup({ actorId }, context.runtime);

    const download = await openBackupDownload({ backupId: created.id }, context.runtime);
    assert.equal(download.fileName, `${created.id}.dump`);
    assert.equal(await new Response(download.stream).text(), dumpBytes);

    await assert.rejects(
      () => openBackupDownload({ backupId: "backup-20260919t020000z-deadbeef" }, context.runtime),
      (error: unknown) => error instanceof AppError && error.code === "BACKUP_NOT_FOUND",
    );
  });

  it("refuses arbitrary paths through the backup id", async () => {
    const context = await createTestRuntime();
    for (const backupId of ["../../etc/passwd", "..\\windows\\system32", "/etc/passwd"]) {
      await assert.rejects(
        () => deleteBackup({ backupId, actorId }, context.runtime),
        (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
      );
      await assert.rejects(
        () => openBackupDownload({ backupId }, context.runtime),
        (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
      );
    }
  });

  it("deletes dump and metadata together and audits the deletion", async () => {
    const context = await createTestRuntime();
    const created = await createBackup({ actorId }, context.runtime);

    const deleted = await deleteBackup({ backupId: created.id, actorId }, context.runtime);
    assert.equal(deleted.id, created.id);
    assert.deepEqual(context.auditActions, ["CREATE", "DELETE"]);
    assert.deepEqual(await listBackups(context.runtime), []);

    await assert.rejects(
      () => deleteBackup({ backupId: created.id, actorId }, context.runtime),
      (error: unknown) => error instanceof AppError && error.code === "BACKUP_NOT_FOUND",
    );
  });

  it("restores a completed backup, keeps a safety backup and audits every phase", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const harness = createRestoreHarness(context);

    const result = await restoreBackup({ backupId: target.id, actorId }, harness.runtime);

    assert.equal(result.backupId, target.id);
    assert.equal(result.backupFileName, target.fileName);
    assert.equal(result.archiveEntries, 128);
    assert.equal(result.durationMs, 42);
    assert.equal(result.schemaChanged, false);
    assert.equal(result.restoredSchemaMigration, "20260101000000_init");

    // The safety backup is named after the restore moment and is a real backup record.
    assert.equal(result.safetyBackup.id, safetyBackupId);
    assert.equal(result.safetyBackup.status, "COMPLETED");
    assert.equal(result.safetyBackup.createdById, actorId);
    const listed = await listBackups(context.runtime);
    assert.equal(listed.some((entry) => entry.id === safetyBackupId && entry.status === "COMPLETED"), true);

    // Only a server-resolved path inside the backup directory reaches the restore command.
    assert.equal(harness.runInputs.length, 1);
    assert.equal(harness.runInputs[0].archivePath, path.join(context.directory, target.fileName));
    assert.equal(path.dirname(harness.runInputs[0].archivePath), context.directory);

    assert.deepEqual(harness.audit.map((entry) => entry.operation), ["database_restore_started", "database_restore_completed"]);
    assert.equal(harness.audit[1].safetyBackupId, safetyBackupId);
    assert.equal(harness.maintenance.begins, 1);
    assert.equal(harness.maintenance.ends, 1);
    assert.equal(harness.maintenance.active, false);
    assert.equal(harness.verifyCalls.count, 1);
    assert.equal(isRestoreInProgress(), false);
  });

  it("refuses a missing backup, a failed backup and a dump that disappeared", async () => {
    const context = await createTestRuntime();
    const harness = createRestoreHarness(context);
    await assert.rejects(
      () => restoreBackup({ backupId: "backup-20260919t020000z-deadbeef", actorId }, harness.runtime),
      rejectWithCode("BACKUP_NOT_FOUND", 404),
    );

    const failed = await createTestRuntime({
      runDump: async () => {
        throw new AppError("BACKUP_CREATE_FAILED", "Backup command failed", 500);
      },
    });
    await assert.rejects(() => createBackup({ actorId }, failed.runtime), (error: unknown) => error instanceof AppError);
    const failedRecord = (await listBackups(failed.runtime))[0];
    if (!failedRecord) throw new Error("the failed backup attempt was not recorded");
    assert.equal(failedRecord.status, "FAILED");

    const failedHarness = createRestoreHarness(failed);
    await assert.rejects(
      () => restoreBackup({ backupId: failedRecord.id, actorId }, failedHarness.runtime),
      rejectWithCode("RESTORE_BACKUP_UNUSABLE", 409),
    );
    assert.equal(failedHarness.maintenance.begins, 0);

    const created = await createBackup({ actorId }, context.runtime);
    await fs.promises.rm(path.join(context.directory, `${created.id}.dump`));
    await assert.rejects(
      () => restoreBackup({ backupId: created.id, actorId }, harness.runtime),
      rejectWithCode("RESTORE_BACKUP_FILE_MISSING", 404),
    );
    assert.equal(harness.runInputs.length, 0);
  });

  it("refuses identifiers that are not backup ids", async () => {
    const context = await createTestRuntime();
    const harness = createRestoreHarness(context);

    for (const backupId of ["../../etc/passwd", "C:\\backup.dump", "/etc/passwd", "pre-restore-2026-09-22-14-30-00/../x"]) {
      await assert.rejects(
        () => restoreBackup({ backupId, actorId }, harness.runtime),
        rejectWithCode("BAD_REQUEST", 400),
      );
    }
    assert.equal(harness.maintenance.begins, 0);
  });

  it("rejects a concurrent restore and releases the lock afterwards", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const gate = deferred();
    const harness = createRestoreHarness(context, {
      runRestore: async () => {
        await gate.promise;
        return { durationMs: 7 };
      },
    });

    const first = restoreBackup({ backupId: target.id, actorId }, harness.runtime);
    assert.equal(isRestoreInProgress(), true);
    await assert.rejects(
      () => restoreBackup({ backupId: target.id, actorId }, harness.runtime),
      rejectWithCode("RESTORE_IN_PROGRESS", 409),
    );

    gate.resolve();
    const result = await first;
    assert.equal(result.durationMs, 7);
    assert.equal(isRestoreInProgress(), false);

    const second = await restoreBackup({ backupId: target.id, actorId }, createRestoreHarness(context).runtime);
    assert.equal(second.backupId, target.id);
  });

  it("rejects a user-triggered backup during restore while the safety backup still succeeds", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const gate = deferred();
    const harness = createRestoreHarness(context, {
      runRestore: async () => {
        await gate.promise;
        return { durationMs: 7 };
      },
    });

    const first = restoreBackup({ backupId: target.id, actorId }, harness.runtime);
    await assert.rejects(
      () => createBackup({ actorId }, context.runtime),
      rejectWithCode("RESTORE_IN_PROGRESS", 409),
    );

    gate.resolve();
    await first;
    const after = await createBackup({ actorId }, context.runtime);
    assert.equal(after.status, "COMPLETED");
  });

  it("reports a failed restore, releases maintenance and keeps the safety backup", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const failure = new AppError("RESTORE_FAILED", "Restore command failed", 500, { exitCode: 1 });
    const harness = createRestoreHarness(context, {
      runRestore: async () => {
        throw failure;
      },
    });

    await assert.rejects(() => restoreBackup({ backupId: target.id, actorId }, harness.runtime), (error: unknown) => error === failure);

    assert.equal(harness.maintenance.begins, 1);
    assert.equal(harness.maintenance.ends, 1);
    assert.equal(harness.maintenance.active, false);
    assert.equal(harness.verifyCalls.count, 0);
    assert.deepEqual(harness.audit.map((entry) => entry.operation), ["database_restore_started", "database_restore_failed"]);
    assert.equal(harness.audit[1].errorCode, "RESTORE_FAILED");
    assert.equal(harness.audit[1].errorDetail?.includes("RESTORE_FAILED"), true);
    // The redacted detail must never carry the connection password.
    assert.equal(harness.audit[1].errorDetail?.includes("sup3r-secret") ?? false, false);

    const listed = await listBackups(context.runtime);
    assert.equal(listed.some((entry) => entry.id === safetyBackupId), true);
  });

  it("reports schema drift when the snapshot predates the running application", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    let reads = 0;
    const harness = createRestoreHarness(context, {
      readSchemaMigration: async () => {
        reads += 1;
        return reads === 1 ? "20260101000000_init" : "20260202000000_nodes";
      },
    });

    const result = await restoreBackup({ backupId: target.id, actorId }, harness.runtime);
    assert.equal(result.schemaChanged, true);
    assert.equal(result.previousSchemaMigration, "20260101000000_init");
    assert.equal(result.restoredSchemaMigration, "20260202000000_nodes");
  });

  it("does not touch the database when the archive is not restorable", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const harness = createRestoreHarness(context, {
      verifyArchive: async () => {
        throw appError("RESTORE_INVALID_ARCHIVE", "Backup file is not a valid restorable archive", 422);
      },
    });

    await assert.rejects(
      () => restoreBackup({ backupId: target.id, actorId }, harness.runtime),
      rejectWithCode("RESTORE_INVALID_ARCHIVE", 422),
    );

    assert.equal(harness.runInputs.length, 0);
    assert.equal(harness.maintenance.begins, 0);
    assert.deepEqual(context.auditActions, ["CREATE"]);
    assert.deepEqual(harness.audit.map((entry) => entry.operation), ["database_restore_started", "database_restore_failed"]);
  });

  it("cancels the restore when the safety backup cannot be created", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const harness = createRestoreHarness(context, {
      createSafetyBackup: async () => {
        throw appError("RESTORE_SAFETY_BACKUP_FAILED", "Safety backup failed", 500);
      },
    });

    await assert.rejects(
      () => restoreBackup({ backupId: target.id, actorId }, harness.runtime),
      rejectWithCode("RESTORE_SAFETY_BACKUP_FAILED", 500),
    );
    assert.equal(harness.runInputs.length, 0);
    assert.equal(harness.maintenance.begins, 0);
  });

  it("reports a failed verification and releases maintenance", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const harness = createRestoreHarness(context, {
      verifyDatabase: async () => {
        throw appError("RESTORE_VERIFICATION_FAILED", "Restored database is missing the Role Engine schema", 500);
      },
    });

    await assert.rejects(
      () => restoreBackup({ backupId: target.id, actorId }, harness.runtime),
      rejectWithCode("RESTORE_VERIFICATION_FAILED", 500),
    );
    assert.equal(harness.maintenance.ends, 1);
    assert.equal(harness.maintenance.active, false);
    assert.equal(isRestoreInProgress(), false);
    assert.equal(harness.audit[1].errorCode, "RESTORE_VERIFICATION_FAILED");
  });

  it("writes the safety backup before the restore and keeps the dump usable", async () => {
    const context = await createTestRuntime();
    const target = await createBackup({ actorId }, context.runtime);
    const harness = createRestoreHarness(context);

    const result = await restoreBackup({ backupId: target.id, actorId }, harness.runtime);
    const safetyManifest = parseBackupManifest(await context.storage.readJson(`${result.safetyBackup.id}.json`));
    assert.equal(safetyManifest?.status, "COMPLETED");
    assert.equal(safetyManifest?.createdById, actorId);

    // The restored snapshot and the safety backup both remain downloadable.
    const download = await openBackupDownload({ backupId: target.id }, context.runtime);
    assert.equal(await new Response(download.stream).text(), dumpBytes);
  });
});