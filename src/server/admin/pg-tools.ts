import { spawn } from "node:child_process";
import fs from "node:fs";
import type { AdminBackupToolHealth } from "@/domain/admin-console";
import { appError, type ApiErrorCode } from "@/server/errors";
import { redactSecrets } from "@/server/admin/redact";

const backupCommandTimeoutMs = 15 * 60 * 1000;
const restoreCommandTimeoutMs = 30 * 60 * 1000;
const archiveListingTimeoutMs = 2 * 60 * 1000;
const versionProbeTimeoutMs = 5_000;
const versionProbeTtlMs = 60_000;
const capturedOutputLimit = 4_000;
// `pg_restore --list` output grows with the object count, so archive inspection captures far more
// than the stderr diagnostics that only need a redacted excerpt.
const capturedListingLimit = 4 * 1024 * 1024;
const safeSchemaNamePattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export type DatabaseConnection = {
  host: string;
  port: string;
  username: string | null;
  password: string | null;
  database: string;
  schema: string | null;
  sslMode: string | null;
};

export type PgCommand = {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  password: string | null;
};

// Every postgres tool wrapper maps its exit conditions onto api error codes, so the service layer
// never has to translate child process failures itself.
type CommandFailure = { code: ApiErrorCode; message: string; status: number };

type CommandFailurePolicy = {
  unavailable: CommandFailure;
  failed: CommandFailure;
  timeout: CommandFailure;
};

const backupFailurePolicy: CommandFailurePolicy = {
  unavailable: { code: "BACKUP_TOOL_UNAVAILABLE", message: "Backup tool executable was not found; configure ADMIN_PG_DUMP_PATH", status: 503 },
  failed: { code: "BACKUP_CREATE_FAILED", message: "Backup command failed", status: 500 },
  timeout: { code: "BACKUP_CREATE_FAILED", message: "Backup command timed out", status: 500 },
};

const restoreFailurePolicy: CommandFailurePolicy = {
  unavailable: { code: "RESTORE_TOOL_UNAVAILABLE", message: "Restore tool executable was not found; configure ADMIN_PG_RESTORE_PATH", status: 503 },
  failed: { code: "RESTORE_FAILED", message: "Restore command failed", status: 500 },
  timeout: { code: "RESTORE_TIMEOUT", message: "Restore command timed out", status: 504 },
};

const archiveListingFailurePolicy: CommandFailurePolicy = {
  unavailable: restoreFailurePolicy.unavailable,
  failed: { code: "RESTORE_INVALID_ARCHIVE", message: "Backup file is not a valid restorable archive", status: 422 },
  timeout: { code: "RESTORE_TIMEOUT", message: "Backup file could not be inspected in time", status: 504 },
};


let cachedVersionProbe: { executable: string; expiresAt: number; health: AdminBackupToolHealth } | null = null;

export function parseDatabaseConnection(databaseUrl: string): DatabaseConnection {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw appError("BACKUP_CONFIGURATION_INVALID", "DATABASE_URL must be a postgresql:// URL that includes a host", 503);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw appError("BACKUP_CONFIGURATION_INVALID", "DATABASE_URL must use the postgresql:// scheme", 503);
  }

  const database = safeDecode(parsed.pathname.replace(/^\//, ""));
  if (!database) {
    throw appError("BACKUP_CONFIGURATION_INVALID", "DATABASE_URL does not contain a database name", 503);
  }

  const host = parsed.searchParams.get("host")?.trim() || parsed.hostname;
  if (!host) {
    throw appError("BACKUP_CONFIGURATION_INVALID", "DATABASE_URL does not contain a host", 503);
  }

  const schemaParam = parsed.searchParams.get("schema")?.trim() ?? "";
  return {
    host,
    port: parsed.searchParams.get("port")?.trim() || parsed.port || "5432",
    username: parsed.username ? safeDecode(parsed.username) : null,
    password: parsed.password ? safeDecode(parsed.password) : null,
    database,
    // Only a plain identifier is forwarded to the tool; anything else is ignored so a
    // crafted URL can never inject additional pg_dump arguments.
    schema: safeSchemaNamePattern.test(schemaParam) ? schemaParam : null,
    sslMode: parsed.searchParams.get("sslmode")?.trim() || null,
  };
}

export function buildPgDumpCommand(input: { databaseUrl: string; targetPath: string; executable: string }): PgCommand {
  const connection = parseDatabaseConnection(input.databaseUrl);
  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${input.targetPath}`,
    ...connectionArguments(connection),
    `--dbname=${connection.database}`,
  ];

  return { executable: input.executable, args, env: buildConnectionEnvironment(connection), password: connection.password };
}

// Restore replaces the database content with the snapshot: objects from the snapshot are dropped
// first (--clean, --if-exists) and the whole run happens inside one transaction
// (--single-transaction) so that a failure rolls back instead of leaving a half-restored database.
// If the target still holds objects that depend on snapshot objects, the drop fails, the
// transaction rolls back and the operator gets a failed restore with the data untouched — which is
// why the pre-restore safety backup is created before this command ever runs. The archive path is
// a server-resolved path inside the backup storage directory; nothing from the request reaches the
// argument list.
export function buildPgRestoreCommand(input: { databaseUrl: string; archivePath: string; executable: string }): PgCommand {
  const connection = parseDatabaseConnection(input.databaseUrl);
  const args = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--single-transaction",
    "--exit-on-error",
    ...connectionArguments(connection),
    `--dbname=${connection.database}`,
    input.archivePath,
  ];

  return { executable: input.executable, args, env: buildConnectionEnvironment(connection), password: connection.password };
}

// `pg_restore --list` parses the archive header without touching the database, which is how a
// corrupted or non-archive file is rejected before anything destructive happens.
export function buildPgRestoreListCommand(input: { executable: string; archivePath: string }): PgCommand {
  return { executable: input.executable, args: ["--list", input.archivePath], env: { ...process.env }, password: null };
}

export function assertArchiveListing(stdout: string): { entries: number } {
  const entries = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith(";"))
    .length;
  if (entries === 0) {
    throw appError("RESTORE_INVALID_ARCHIVE", "Backup archive does not contain restorable entries", 422);
  }
  return { entries };
}


export async function runPgDump(input: { databaseUrl: string; executable: string; targetPath: string }): Promise<{ sizeBytes: number }> {
  const command = buildPgDumpCommand(input);
  await runCommand(command, backupCommandTimeoutMs, backupFailurePolicy);

  const stats = await fs.promises.stat(input.targetPath).catch(() => null);
  if (!stats) {
    throw appError("BACKUP_CREATE_FAILED", "Backup tool finished without producing a dump file", 500);
  }
  return { sizeBytes: stats.size };
}

export async function verifyPgRestoreArchive(input: { executable: string; archivePath: string }): Promise<{ entries: number }> {
  const stdout = await runCommand(buildPgRestoreListCommand(input), archiveListingTimeoutMs, archiveListingFailurePolicy, capturedListingLimit);
  return assertArchiveListing(stdout);
}

export async function runPgRestore(input: { databaseUrl: string; executable: string; archivePath: string }): Promise<{ durationMs: number }> {
  const command = buildPgRestoreCommand(input);
  const startedAt = Date.now();
  await runCommand(command, restoreCommandTimeoutMs, restoreFailurePolicy);
  return { durationMs: Date.now() - startedAt };
}

export async function probePgDump(executable: string): Promise<AdminBackupToolHealth> {
  const cached = cachedVersionProbe;
  if (cached && cached.executable === executable && cached.expiresAt > Date.now()) return cached.health;

  const health = await readToolVersion(executable);
  cachedVersionProbe = { executable, expiresAt: Date.now() + versionProbeTtlMs, health };
  return health;
}

async function readToolVersion(executable: string): Promise<AdminBackupToolHealth> {
  return new Promise<AdminBackupToolHealth>((resolve) => {
    const child = spawn(executable, ["--version"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (health: AdminBackupToolHealth) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(health);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ available: false, version: null, path: executable, message: "Backup tool did not respond to --version" });
    }, versionProbeTimeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        available: false,
        version: null,
        path: executable,
        message: error.code === "ENOENT"
          ? "Backup tool executable was not found; configure ADMIN_PG_DUMP_PATH"
          : redactSecrets(error.message, []),
      });
    });
    child.on("close", (code) => {
      const version = stdout.trim();
      if (code === 0 && version) {
        finish({ available: true, version, path: executable, message: null });
        return;
      }
      finish({ available: false, version: null, path: executable, message: redactSecrets(stderr.trim() || `Exit code ${code}`, []) });
    });
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A literal "%" in a URL component is not valid percent-encoding; keep it as-is.
    return value;
  }
}

function connectionArguments(connection: DatabaseConnection): string[] {
  return [
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    ...(connection.username ? [`--username=${connection.username}`] : []),
    ...(connection.schema ? [`--schema=${connection.schema}`] : []),
  ];
}

// Credentials travel through the child process environment, never through argv,
// so they stay out of process listings and shell history.
function buildConnectionEnvironment(connection: DatabaseConnection): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (connection.password) env.PGPASSWORD = connection.password;
  if (connection.sslMode) env.PGSSLMODE = connection.sslMode;
  return env;
}

function runCommand(command: PgCommand, timeoutMs: number, policy: CommandFailurePolicy, stdoutLimit = capturedOutputLimit): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      env: command.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: unknown, output = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(output);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish(appError(policy.timeout.code, policy.timeout.message, policy.timeout.status));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < stdoutLimit) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < capturedOutputLimit) stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(appError(policy.unavailable.code, policy.unavailable.message, policy.unavailable.status, { executable: command.executable }));
        return;
      }
      finish(appError(policy.failed.code, "Command could not be started", policy.failed.status, { reason: redactSecrets(error.message, [command.password]) }));
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish(null, stdout);
        return;
      }
      finish(appError(policy.failed.code, policy.failed.message, policy.failed.status, {
        exitCode: code,
        stderr: redactSecrets(stderr, [command.password], 1_000),
      }));
    });
  });
}
