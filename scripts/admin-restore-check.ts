import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listBackups } from "@/server/admin/backups";
import { createLocalBackupStorage } from "@/server/admin/backup-storage";
import { getAdminBackupDirectory, getDatabaseUrl, getPgRestoreExecutable } from "@/server/admin/config";
import { runPgRestore, verifyPgRestoreArchive } from "@/server/admin/pg-tools";

// Manual integration check for the restore pipeline. By default it only inspects a real dump with
// `pg_restore --list`, which is completely read-only. To also prove that the dump can actually be
// applied, point ADMIN_RESTORE_CHECK_DATABASE_URL at a THROWAWAY database:
//
//   createdb -h 127.0.0.1 -p 5433 -U postgres role_engine_restore_check
//   $env:ADMIN_RESTORE_CHECK_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/role_engine_restore_check?schema=public'
//   npx tsx scripts/admin-restore-check.ts
//
// The scratch database is replaced by the dump, so never pass the live DATABASE_URL here.

async function main() {
  const storage = createLocalBackupStorage(getAdminBackupDirectory());
  const requestedId = process.argv[2]?.trim();
  const backups = (await listBackups({ storage })).filter((entry) => entry.status === "COMPLETED");
  const record = requestedId ? backups.find((entry) => entry.id === requestedId) : backups[0];
  if (!record) {
    throw new Error(requestedId
      ? `Backup ${requestedId} was not found or did not complete`
      : "No completed backup exists; create one in the Admin Console first");
  }

  const archivePath = storage.resolvePath(record.fileName);
  console.log(`backup:      ${record.fileName} (${record.sizeBytes ?? 0} bytes, migration ${record.schemaMigration ?? "unknown"})`);
  console.log(`archive:     ${archivePath}`);
  console.log(`pg_restore:  ${getPgRestoreExecutable()}`);

  const archive = await verifyPgRestoreArchive({ executable: getPgRestoreExecutable(), archivePath });
  console.log(`listing:     ${archive.entries} restorable entr(ies) in the archive`);

  const scratchUrl = process.env.ADMIN_RESTORE_CHECK_DATABASE_URL?.trim();
  if (!scratchUrl) {
    console.log("restore:     skipped (set ADMIN_RESTORE_CHECK_DATABASE_URL to a throwaway database to apply the dump)");
    return;
  }

  if (scratchUrl === getDatabaseUrl()) {
    throw new Error("ADMIN_RESTORE_CHECK_DATABASE_URL must point at a throwaway database, never at DATABASE_URL");
  }

  const { durationMs } = await runPgRestore({ databaseUrl: scratchUrl, executable: getPgRestoreExecutable(), archivePath });
  console.log(`restore:     applied to the scratch database in ${durationMs} ms`);

  const scratch = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
  try {
    const [tables] = await scratch.$queryRaw<Array<{ tables: bigint }>>`
      SELECT count(*)::bigint AS tables FROM information_schema.tables WHERE table_schema = current_schema()
    `;
    assert.ok(Number(tables?.tables ?? 0) > 0, "restored database must expose tables");

    const [migrationTable] = await scratch.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present
    `;
    assert.equal(migrationTable?.present, true, "restored database must contain the Role Engine schema");
    console.log(`verify:      ${tables?.tables ?? 0} tables and the Role Engine schema are present`);
  } finally {
    await scratch.$disconnect();
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => console.log("admin restore pipeline OK"))
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
