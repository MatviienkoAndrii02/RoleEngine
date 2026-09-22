import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createBackup, deleteBackup, listBackups, openBackupDownload } from "@/server/admin/backups";
import { createLocalBackupStorage } from "@/server/admin/backup-storage";
import { getDatabaseUrl, getPgDumpExecutable } from "@/server/admin/config";
import { AppError } from "@/server/errors";

// Manual integration check for the admin backup pipeline. It runs the real pg_dump against
// the configured DATABASE_URL, so it needs the same env as the app:
//   ADMIN_PG_DUMP_PATH, ADMIN_BACKUP_DIR (optional).
// Usage: npx tsx scripts/admin-backup-check.ts

async function main() {
  const directory = process.env.ADMIN_BACKUP_DIR?.trim()
    ? path.resolve(process.env.ADMIN_BACKUP_DIR.trim())
    : await fs.promises.mkdtemp(path.join(os.tmpdir(), "role-engine-admin-backup-check-"));
  const storage = createLocalBackupStorage(directory);
  const runtime = { storage };

  const actor = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!actor) throw new Error("No user account exists; run npm run prisma:seed first");

  console.log(`database:    ${redactUrl(getDatabaseUrl())}`);
  console.log(`backup dir:  ${directory}`);
  console.log(`pg_dump:     ${getPgDumpExecutable()}`);
  console.log(`actor:       ${actor.email ?? actor.id}`);

  const createdIds: string[] = [];
  try {
    const backup = await createBackup({ actorId: actor.id }, runtime);
    createdIds.push(backup.id);
    assert.equal(backup.status, "COMPLETED");
    assert.ok((backup.sizeBytes ?? 0) > 0);
    console.log(`created:     ${backup.fileName} (${backup.sizeBytes} bytes, migration ${backup.schemaMigration ?? "unknown"})`);

    const listed = await listBackups(runtime);
    assert.equal(listed.some((entry) => entry.id === backup.id && entry.status === "COMPLETED"), true);
    console.log(`listed:      ${listed.length} record(s)`);

    const download = await openBackupDownload({ backupId: backup.id }, runtime);
    const bytes = new Uint8Array(await new Response(download.stream).arrayBuffer());
    assert.equal(bytes.byteLength, backup.sizeBytes);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "PGDMP");
    console.log(`download:    ${bytes.byteLength} bytes streamed, custom-format header verified`);

    await assert.rejects(
      () => openBackupDownload({ backupId: "../../etc/passwd" }, runtime),
      (error: unknown) => error instanceof AppError && error.code === "BAD_REQUEST",
    );
    console.log("traversal:   unsafe identifier rejected");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityType: "AdminBackup", entityId: backup.id, action: "CREATE" },
      select: { id: true },
    });
    assert.ok(auditEntry, "backup creation must be audited");
    console.log("audit:       CREATE entry present");

    await deleteBackup({ backupId: backup.id, actorId: actor.id }, runtime);
    assert.deepEqual(await listBackups(runtime), []);
    console.log("deleted:     dump and metadata removed");
  } finally {
    for (const id of createdIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: "AdminBackup", entityId: id } });
    }
    await prisma.$disconnect();
  }

  console.log("admin backup pipeline OK");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

function redactUrl(value: string) {
  return value.replace(/:\/\/([^:@/]+):[^@/]+@/, "://$1:***@");
}