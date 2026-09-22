import { randomBytes } from "node:crypto";
import { safetyBackupIdPrefix } from "@/domain/admin-console";
import { appError } from "@/server/errors";

// Backup identifiers become file names inside the backup storage directory, so the
// alphabet is deliberately narrow: no separators, no dots, no traversal syntax.
const backupIdPattern = /^[a-z0-9][a-z0-9-]{7,79}$/;
const maxSafetyBackupAttempts = 20;

export function createBackupId(now: Date = new Date(), randomSuffix: string = randomBytes(4).toString("hex")): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").toLowerCase();
  return `backup-${stamp}-${randomSuffix.toLowerCase()}`;
}

// The pre-restore safety backup is named after the UTC moment of the restore so an operator can
// recognise it in the backup list. Identifiers stay collision-free by counting up instead of
// overwriting an earlier safety backup of the same second.
export function createSafetyBackupId(now: Date = new Date(), existingIds: Iterable<string> = []): string {
  const taken = new Set(existingIds);
  const base = `${safetyBackupIdPrefix}${formatSafetyStamp(now)}`;
  if (!taken.has(base) && isSafeBackupId(base)) return base;

  for (let attempt = 2; attempt <= maxSafetyBackupAttempts; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!taken.has(candidate) && isSafeBackupId(candidate)) return candidate;
  }

  throw appError("RESTORE_SAFETY_BACKUP_FAILED", "A unique safety backup identifier could not be generated", 500);
}

export function isSafetyBackupId(value: string): boolean {
  return value.startsWith(safetyBackupIdPrefix);
}

export function isSafeBackupId(value: string): boolean {
  return backupIdPattern.test(value);
}

export function assertSafeBackupId(value: string): string {
  if (!isSafeBackupId(value)) {
    throw appError("BAD_REQUEST", "Backup identifier is invalid", 400);
  }
  return value;
}

function formatSafetyStamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
}
