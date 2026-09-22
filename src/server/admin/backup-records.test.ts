import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminBackupRecord } from "@/domain/admin-console";
import {
  applyStoredFileFacts,
  parseBackupManifest,
  recordFromDumpFile,
  sortBackupsNewestFirst,
  storageFileMissingMessage,
} from "@/server/admin/backup-records";

const manifest = {
  id: "backup-20260921t020000z-abcd1234",
  fileName: "backup-20260921t020000z-abcd1234.dump",
  createdAt: "2026-09-21T02:00:00.000Z",
  sizeBytes: 4096,
  status: "COMPLETED",
  appVersion: "0.1.0",
  appCommit: null,
  schemaMigration: "20260101000000_init",
  createdById: "user_1",
  message: null,
} satisfies AdminBackupRecord;

describe("admin backup records", () => {
  it("parses a persisted manifest", () => {
    const parsed = parseBackupManifest(manifest);
    assert.deepEqual(parsed, manifest);
  });

  it("rejects malformed manifests instead of trusting them", () => {
    assert.equal(parseBackupManifest(null), null);
    assert.equal(parseBackupManifest({ ...manifest, status: "WEIRD" }), null);
    assert.equal(parseBackupManifest({ ...manifest, sizeBytes: -1 }), null);
    assert.equal(parseBackupManifest({ ...manifest, createdAt: "yesterday" }), null);
    assert.equal(parseBackupManifest({ ...manifest, unexpected: true }), null);
  });

  it("derives a record for a dump file without metadata", () => {
    const record = recordFromDumpFile({
      id: manifest.id,
      fileName: manifest.fileName,
      sizeBytes: 128,
      createdAt: new Date("2026-09-21T03:00:00.000Z"),
    });
    assert.equal(record.status, "COMPLETED");
    assert.equal(record.sizeBytes, 128);
    assert.equal(record.createdAt, "2026-09-21T03:00:00.000Z");
  });

  it("marks a manifest whose dump file disappeared as failed", () => {
    const record = applyStoredFileFacts(manifest, null);
    assert.equal(record.status, "FAILED");
    assert.equal(record.sizeBytes, null);
    assert.equal(record.message, storageFileMissingMessage);
  });

  it("keeps failed records failed and trusts the stored file size otherwise", () => {
    const failed: AdminBackupRecord = { ...manifest, status: "FAILED", sizeBytes: null, message: "BACKUP_CREATE_FAILED: boom" };
    assert.deepEqual(applyStoredFileFacts(failed, null), failed);
    assert.equal(applyStoredFileFacts(manifest, { sizeBytes: 8192 }).sizeBytes, 8192);
  });

  it("sorts backups newest first", () => {
    const older: AdminBackupRecord = { ...manifest, id: "backup-20260920t020000z-abcd1234", createdAt: "2026-09-20T02:00:00.000Z" };
    const sorted = sortBackupsNewestFirst([older, manifest]);
    assert.deepEqual(sorted.map((record) => record.id), [manifest.id, older.id]);
  });
});