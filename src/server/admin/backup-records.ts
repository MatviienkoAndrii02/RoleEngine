import type { AdminBackupRecord } from "@/domain/admin-console";
import { adminBackupManifestSchema } from "@/domain/validation";

// Marker stored in manifest.message when the dump file disappeared from storage while
// the manifest still claims success. The UI maps it to a localized explanation and
// renders any other message verbatim, because those come from pg_dump output.
export const storageFileMissingMessage = "STORAGE_FILE_MISSING";

export function parseBackupManifest(raw: unknown): AdminBackupRecord | null {
  const result = adminBackupManifestSchema.safeParse(raw);
  if (!result.success) return null;
  return { ...result.data, sizeBytes: result.data.sizeBytes ?? null };
}

export function sortBackupsNewestFirst(records: AdminBackupRecord[]): AdminBackupRecord[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function recordFromDumpFile(input: { id: string; fileName: string; sizeBytes: number; createdAt: Date }): AdminBackupRecord {
  return {
    id: input.id,
    fileName: input.fileName,
    createdAt: input.createdAt.toISOString(),
    sizeBytes: input.sizeBytes,
    status: "COMPLETED",
    appVersion: null,
    appCommit: null,
    schemaMigration: null,
    createdById: null,
    message: null,
  };
}

export function applyStoredFileFacts(record: AdminBackupRecord, file: { sizeBytes: number } | null): AdminBackupRecord {
  if (!file) {
    if (record.status === "FAILED") return record;
    return { ...record, status: "FAILED", sizeBytes: null, message: storageFileMissingMessage };
  }
  return { ...record, sizeBytes: file.sizeBytes };
}