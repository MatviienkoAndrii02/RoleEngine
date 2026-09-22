import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/server/errors";
import { assertSafeBackupId, createBackupId, createSafetyBackupId, isSafeBackupId, isSafetyBackupId } from "@/server/admin/backup-id";

describe("admin backup identifiers", () => {
  it("generates ids that are safe storage file names", () => {
    const id = createBackupId(new Date("2026-09-21T02:00:00.000Z"), "ABCD1234");
    assert.equal(id, "backup-20260921t020000z-abcd1234");
    assert.equal(isSafeBackupId(id), true);
    assert.equal(assertSafeBackupId(id), id);
  });

  it("names the pre-restore safety backup after the restore moment", () => {
    const id = createSafetyBackupId(new Date("2026-09-22T14:30:00.000Z"));
    assert.equal(id, "pre-restore-2026-09-22-14-30-00");
    assert.equal(isSafeBackupId(id), true);
    assert.equal(isSafetyBackupId(id), true);
    assert.equal(isSafetyBackupId("backup-20260921t020000z-abcd1234"), false);
  });

  it("never overwrites an existing safety backup of the same second", () => {
    const now = new Date("2026-09-22T14:30:00.000Z");
    const taken = ["pre-restore-2026-09-22-14-30-00", "pre-restore-2026-09-22-14-30-00-2"];
    const id = createSafetyBackupId(now, taken);
    assert.equal(id, "pre-restore-2026-09-22-14-30-00-3");
    assert.equal(isSafeBackupId(id), true);
  });

  it("rejects traversal, absolute paths and other unsafe identifiers", () => {
    const unsafe = ["../../etc/passwd", "..\\..\\windows\\system32", "/etc/passwd", "C:\\backup.dump", "backup 1", ".hidden", "a"];
    for (const value of unsafe) {
      assert.equal(isSafeBackupId(value), false, `${value} must be rejected`);
      assert.throws(() => assertSafeBackupId(value), (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BAD_REQUEST");
        assert.equal(error.status, 400);
        return true;
      });
    }
  });
});