// Admin Console contracts shared by the admin API adapters and the admin UI.
// Values are nullable when the backend cannot measure them safely; the UI must
// render "not available" instead of inventing a number.

export type AdminHealthState = "UP" | "DOWN" | "UNKNOWN";

export type AdminApplicationHealth = {
  status: AdminHealthState;
  startedAt: string;
  uptimeSeconds: number;
  nodeVersion: string;
  version: string | null;
  commit: string | null;
};

export type AdminDatabaseHealth = {
  status: AdminHealthState;
  latencyMs: number | null;
  message: string | null;
};

export type AdminCpuHealth = {
  usagePercent: number | null;
  cores: number;
  loadAverage: number[] | null;
};

export type AdminMemoryHealth = {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
};

export type AdminDiskHealth = {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usagePercent: number;
};

export type AdminBackupToolHealth = {
  available: boolean;
  version: string | null;
  path: string;
  message: string | null;
};

export type AdminHealthSnapshot = {
  application: AdminApplicationHealth;
  database: AdminDatabaseHealth;
  cpu: AdminCpuHealth;
  memory: AdminMemoryHealth;
  disk: AdminDiskHealth | null;
  backupTool: AdminBackupToolHealth;
};

export type AdminBackupStatus = "COMPLETED" | "FAILED";

export type AdminBackupRecord = {
  id: string;
  fileName: string;
  createdAt: string;
  sizeBytes: number | null;
  status: AdminBackupStatus;
  appVersion: string | null;
  appCommit: string | null;
  schemaMigration: string | null;
  createdById: string | null;
  message: string | null;
};

export type AdminBackupStorageInfo = {
  kind: "local";
  directory: string;
};

export type AdminBackupOverview = {
  storage: AdminBackupStorageInfo;
  totalCount: number;
  lastBackup: AdminBackupRecord | null;
};

export type AdminOverviewResponse = {
  generatedAt: string;
  health: AdminHealthSnapshot;
  backup: AdminBackupOverview;
};

export type AdminHealthResponse = AdminHealthSnapshot;

export type AdminLogsSource = "app" | "worker" | "all";

export type AdminLogEntry = {
  timestamp: string;
  service: string;
  level: "debug" | "info" | "warn" | "error";
  event: string | null;
  message: string;
  fullLog: string;
};

export type AdminLogsResponse = {
  generatedAt: string;
  range: "15m" | "1h" | "6h" | "24h";
  source: AdminLogsSource;
  logs: AdminLogEntry[];
};

export type AdminBackupListResponse = {
  storage: AdminBackupStorageInfo;
  backups: AdminBackupRecord[];
};

export type AdminUserSummary = {
  id: string;
  name: string | null;
  email: string;
  username: string;
  createdAt: string;
  lastSeenAt: string | null;
  online: boolean;
  createdWorkspaceCount: number;
  memberWorkspaceCount: number;
  characterCount: number;
  templateCount: number;
};

export type AdminUsersResponse = {
  generatedAt: string;
  onlineWindowSeconds: number;
  users: AdminUserSummary[];
};

// Restoring is destructive, so the operator receives the full outcome: which snapshot was
// applied, how long it took, where the automatic pre-restore safety backup lives and whether the
// restored snapshot left the schema behind the running application.
export type AdminBackupRestoreResult = {
  backupId: string;
  backupFileName: string;
  restoredAt: string;
  durationMs: number;
  archiveEntries: number;
  safetyBackup: AdminBackupRecord;
  previousSchemaMigration: string | null;
  restoredSchemaMigration: string | null;
  schemaChanged: boolean;
};

// Safety backups are produced automatically right before a restore and are recognisable by their
// identifier prefix, which is why the prefix lives in the shared contract and not in the service.
export const safetyBackupIdPrefix = "pre-restore-";

export function isSafetyBackupRecord(record: Pick<AdminBackupRecord, "id">): boolean {
  return record.id.startsWith(safetyBackupIdPrefix);
}

// Payload guards keep the admin UI from trusting an unexpected response shape; they run
// on the client side of the admin API contract only.
export function isAdminBackupRecord(value: unknown): value is AdminBackupRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.fileName === "string"
    && typeof value.createdAt === "string"
    && (value.status === "COMPLETED" || value.status === "FAILED");
}

export function isAdminHealthSnapshot(value: unknown): value is AdminHealthSnapshot {
  if (!isRecord(value)) return false;
  return isRecord(value.application)
    && isRecord(value.database)
    && isRecord(value.cpu)
    && isRecord(value.memory)
    && isRecord(value.backupTool);
}

export function isAdminLogsResponse(value: unknown): value is AdminLogsResponse {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || !Array.isArray(value.logs)) return false;
  if (value.source !== "app" && value.source !== "worker" && value.source !== "all") return false;
  if (value.range !== "15m" && value.range !== "1h" && value.range !== "6h" && value.range !== "24h") return false;
  return value.logs.every((entry: unknown) => isRecord(entry)
    && typeof entry.timestamp === "string"
    && typeof entry.service === "string"
    && (entry.level === "debug" || entry.level === "info" || entry.level === "warn" || entry.level === "error")
    && (entry.event === null || typeof entry.event === "string")
    && typeof entry.message === "string"
    && typeof entry.fullLog === "string");
}

export function isAdminOverviewResponse(value: unknown): value is AdminOverviewResponse {
  if (!isRecord(value)) return false;
  if (typeof value.generatedAt !== "string" || !isAdminHealthSnapshot(value.health) || !isRecord(value.backup)) return false;
  const backup = value.backup;
  if (typeof backup.totalCount !== "number" || !isRecord(backup.storage)) return false;
  return backup.lastBackup === null || backup.lastBackup === undefined || isAdminBackupRecord(backup.lastBackup);
}

export function isAdminBackupListResponse(value: unknown): value is AdminBackupListResponse {
  if (!isRecord(value)) return false;
  return isRecord(value.storage) && Array.isArray(value.backups) && value.backups.every(isAdminBackupRecord);
}

export function isAdminUsersResponse(value: unknown): value is AdminUsersResponse {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || typeof value.onlineWindowSeconds !== "number") return false;
  return Array.isArray(value.users) && value.users.every((user: unknown) => isRecord(user)
    && typeof user.id === "string"
    && (user.name === null || typeof user.name === "string")
    && typeof user.email === "string"
    && typeof user.username === "string"
    && typeof user.createdAt === "string"
    && (user.lastSeenAt === null || typeof user.lastSeenAt === "string")
    && typeof user.online === "boolean"
    && isNonNegativeInteger(user.createdWorkspaceCount)
    && isNonNegativeInteger(user.memberWorkspaceCount)
    && isNonNegativeInteger(user.characterCount)
    && isNonNegativeInteger(user.templateCount));
}

export function isAdminBackupRestoreResult(value: unknown): value is AdminBackupRestoreResult {
  if (!isRecord(value)) return false;
  return typeof value.backupId === "string"
    && typeof value.backupFileName === "string"
    && typeof value.restoredAt === "string"
    && typeof value.durationMs === "number"
    && isAdminBackupRecord(value.safetyBackup);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
