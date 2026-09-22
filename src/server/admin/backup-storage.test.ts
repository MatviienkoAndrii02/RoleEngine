import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { AppError } from "@/server/errors";
import { createLocalBackupStorage } from "@/server/admin/backup-storage";

const backupId = "backup-20260921t020000z-abcd1234";
const temporaryDirectories: string[] = [];

async function temporaryStorage() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "role-engine-backups-"));
  temporaryDirectories.push(directory);
  return { directory, storage: createLocalBackupStorage(directory) };
}

describe("local admin backup storage", () => {
  after(async () => {
    for (const directory of temporaryDirectories) {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it("creates the storage directory and round-trips metadata", async () => {
    const { directory, storage } = await temporaryStorage();
    await storage.ensureReady();
    assert.equal(fs.existsSync(directory), true);

    const fileName = `${backupId}.json`;
    await storage.writeJson(fileName, { id: backupId });
    assert.deepEqual(await storage.readJson(fileName), { id: backupId });
    assert.equal(await storage.readJson(`${backupId}.dump.json`), null);
  });

  it("rejects unsafe file names instead of resolving outside the storage directory", async () => {
    const { storage } = await temporaryStorage();
    const unsafe = ["../../etc/passwd", "..\\..\\windows", "/etc/passwd", "sub/dir.dump", ".hidden", "C:\\dump"];
    for (const fileName of unsafe) {
      assert.throws(() => storage.resolvePath(fileName), (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BAD_REQUEST");
        return true;
      });
    }
    assert.equal(storage.resolvePath(`${backupId}.dump`).startsWith(storage.directory), true);
  });

  it("lists, streams and removes dump files idempotently", async () => {
    const { directory, storage } = await temporaryStorage();
    await storage.ensureReady();
    const fileName = `${backupId}.dump`;
    await fs.promises.writeFile(path.join(directory, fileName), "dump-bytes", "utf8");

    const listed = await storage.listFiles();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].fileName, fileName);
    assert.equal(listed[0].sizeBytes, 10);

    const download = await storage.openReadStream(fileName);
    assert.equal(download.sizeBytes, 10);
    assert.equal(await new Response(download.stream).text(), "dump-bytes");

    await storage.removeFile(fileName);
    assert.deepEqual(await storage.listFiles(), []);
    await storage.removeFile(fileName);
    assert.equal(await storage.statFile(fileName), null);
  });

  it("reports a missing dump file as a not-found error", async () => {
    const { storage } = await temporaryStorage();
    await assert.rejects(() => storage.openReadStream(`${backupId}.dump`), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "BACKUP_NOT_FOUND");
      assert.equal(error.status, 404);
      return true;
    });
    await assert.rejects(() => storage.removeFile("../escape.dump"), (error: unknown) => error instanceof AppError);
  });

  it("returns an empty listing for a directory that does not exist yet", async () => {
    const storage = createLocalBackupStorage(path.join(os.tmpdir(), `role-engine-backups-missing-${Date.now().toString(36)}`));
    assert.deepEqual(await storage.listFiles(), []);
  });
});