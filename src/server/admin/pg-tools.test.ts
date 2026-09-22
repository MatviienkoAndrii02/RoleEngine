import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/server/errors";
import {
  assertArchiveListing,
  buildPgDumpCommand,
  buildPgRestoreCommand,
  buildPgRestoreListCommand,
  parseDatabaseConnection,
  probePgDump,
  runPgDump,
  runPgRestore,
  verifyPgRestoreArchive,
} from "@/server/admin/pg-tools";

const missingExecutable = "role-engine-missing-pg-dump";

function isConfigurationError(error: unknown) {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, "BACKUP_CONFIGURATION_INVALID");
  assert.equal(error.status, 503);
  return true;
}

describe("pg dump command builder", () => {
  it("maps the Prisma url to explicit arguments and keeps the password out of argv", () => {
    const command = buildPgDumpCommand({
      databaseUrl: "postgresql://postgres:sup3r-secret@127.0.0.1:5433/role_engine?schema=public&sslmode=require",
      targetPath: "C:\\backups\\backup-20260921t020000z-abcd1234.dump.part",
      executable: "pg_dump",
    });

    assert.equal(command.args.some((arg) => arg.includes("sup3r-secret")), false);
    assert.equal(command.env.PGPASSWORD, "sup3r-secret");
    assert.equal(command.env.PGSSLMODE, "require");
    assert.equal(command.executable, "pg_dump");
    for (const expected of [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file=C:\\backups\\backup-20260921t020000z-abcd1234.dump.part",
      "--host=127.0.0.1",
      "--port=5433",
      "--username=postgres",
      "--schema=public",
      "--dbname=role_engine",
    ]) {
      assert.equal(command.args.includes(expected), true, `missing ${expected}`);
    }
  });

  it("never forwards a schema parameter that is not a plain identifier", () => {
    const command = buildPgDumpCommand({
      databaseUrl: "postgresql://postgres:secret@127.0.0.1:5432/db?schema=public%3B%20--command%3Ddrop",
      targetPath: "/tmp/dump.part",
      executable: "pg_dump",
    });
    assert.equal(command.args.some((arg) => arg.startsWith("--schema=")), false);
  });

  it("rejects database urls the backup tool cannot use", () => {
    // Unix-socket URLs are not supported by the backup wrapper yet, so they must fail
    // loudly instead of producing an incomplete dump.
    assert.throws(() => parseDatabaseConnection("postgresql://postgres@/role_engine?host=/var/run/postgresql"), isConfigurationError);
    assert.throws(() => parseDatabaseConnection("mysql://user:pass@127.0.0.1/db"), isConfigurationError);
    assert.throws(() => parseDatabaseConnection("postgresql://user:pass@127.0.0.1"), isConfigurationError);
    assert.throws(() => parseDatabaseConnection("not a url"), isConfigurationError);
  });

  it("reports a missing tool instead of throwing when probing", async () => {
    const health = await probePgDump(missingExecutable);
    assert.equal(health.available, false);
    assert.equal(health.version, null);
    assert.equal(health.path, missingExecutable);
    assert.equal(health.message?.includes("ADMIN_PG_DUMP_PATH"), true);
  });

  it("fails with BACKUP_TOOL_UNAVAILABLE when the dump executable is absent", async () => {
    await assert.rejects(
      () => runPgDump({
        databaseUrl: "postgresql://postgres:secret@127.0.0.1:5432/role_engine",
        executable: missingExecutable,
        targetPath: "/tmp/role-engine-missing.dump",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BACKUP_TOOL_UNAVAILABLE");
        assert.equal(error.status, 503);
        return true;
      },
    );
  });
});

describe("pg restore command builder", () => {
  it("replaces the database content and keeps credentials out of argv", () => {
    const command = buildPgRestoreCommand({
      databaseUrl: "postgresql://postgres:sup3r-secret@127.0.0.1:5433/role_engine?schema=public&sslmode=require",
      archivePath: "C:\\backups\\backup-20260921t020000z-abcd1234.dump",
      executable: "pg_restore",
    });

    assert.equal(command.args.some((arg) => arg.includes("sup3r-secret")), false);
    assert.equal(command.env.PGPASSWORD, "sup3r-secret");
    assert.equal(command.env.PGSSLMODE, "require");
    for (const expected of [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--single-transaction",
      "--exit-on-error",
      "--host=127.0.0.1",
      "--port=5433",
      "--username=postgres",
      "--schema=public",
      "--dbname=role_engine",
    ]) {
      assert.equal(command.args.includes(expected), true, `missing ${expected}`);
    }

    // The archive is the only positional argument and always comes last.
    assert.equal(command.args[command.args.length - 1], "C:\\backups\\backup-20260921t020000z-abcd1234.dump");
    assert.equal(command.args.filter((arg) => !arg.startsWith("--")).length, 1);
  });

  it("never forwards a schema parameter that is not a plain identifier", () => {
    const command = buildPgRestoreCommand({
      databaseUrl: "postgresql://postgres:secret@127.0.0.1:5432/db?schema=public%3B%20--command%3Ddrop",
      archivePath: "/tmp/dump",
      executable: "pg_restore",
    });
    assert.equal(command.args.some((arg) => arg.startsWith("--schema=")), false);
  });

  it("lists the archive without a database connection", () => {
    const command = buildPgRestoreListCommand({ executable: "pg_restore", archivePath: "/tmp/dump.dump" });
    assert.deepEqual(command.args, ["--list", "/tmp/dump.dump"]);
    assert.equal(command.password, null);
  });

  it("treats a listing without entries as an invalid archive", () => {
    const listing = [";", "; Archive created at 2026-09-21 02:00:00 UTC", ";", ""].join("\n");
    assert.throws(() => assertArchiveListing(listing), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "RESTORE_INVALID_ARCHIVE");
      assert.equal(error.status, 422);
      return true;
    });

    const entries = [";", "; Archive created at 2026-09-21 02:00:00 UTC", "5; 1259 16388 TABLE public \"User\" postgres", "6; 0 0 ACL - postgres"].join("\n");
    assert.deepEqual(assertArchiveListing(entries), { entries: 2 });
  });

  it("reports a missing restore tool instead of throwing a driver error", async () => {
    await assert.rejects(
      () => runPgRestore({
        databaseUrl: "postgresql://postgres:secret@127.0.0.1:5432/role_engine",
        executable: missingExecutable,
        archivePath: "/tmp/role-engine-missing.dump",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "RESTORE_TOOL_UNAVAILABLE");
        assert.equal(error.status, 503);
        return true;
      },
    );

    await assert.rejects(
      () => verifyPgRestoreArchive({ executable: missingExecutable, archivePath: "/tmp/role-engine-missing.dump" }),
      (error: unknown) => error instanceof AppError && error.code === "RESTORE_TOOL_UNAVAILABLE",
    );
  });
});