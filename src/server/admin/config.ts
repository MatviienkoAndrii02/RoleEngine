import path from "node:path";
import { appError } from "@/server/errors";

const defaultBackupDirectoryName = "backups";
const defaultPgDumpExecutable = "pg_dump";
const defaultPgRestoreExecutable = "pg_restore";
const defaultIpHeader = "x-forwarded-for";

export function getAdminAccountIdentifiers(): string[] {
  return splitList(process.env.ADMIN_ACCOUNTS);
}

export function getAdminBackupDirectory(): string {
  const configured = process.env.ADMIN_BACKUP_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), defaultBackupDirectoryName));
}

export function getPgDumpExecutable(): string {
  return process.env.ADMIN_PG_DUMP_PATH?.trim() || defaultPgDumpExecutable;
}

// pg_restore ships in the same bin directory as pg_dump, so an explicit ADMIN_PG_RESTORE_PATH
// wins, then the sibling of the configured pg_dump, then PATH.
export function getPgRestoreExecutable(): string {
  const configured = process.env.ADMIN_PG_RESTORE_PATH?.trim();
  if (configured) return configured;

  const dumpPath = process.env.ADMIN_PG_DUMP_PATH?.trim();
  if (!dumpPath) return defaultPgRestoreExecutable;
  return path.join(path.dirname(dumpPath), `${defaultPgRestoreExecutable}${path.extname(dumpPath)}`);
}

export function getAdminAllowedNetworkRanges(): string[] {
  return splitList(process.env.ADMIN_ALLOWED_IP_RANGES);
}

export function getAdminIpHeaderName(): string {
  return (process.env.ADMIN_IP_HEADER?.trim() || defaultIpHeader).toLowerCase();
}

export function getAppVersion(): string | null {
  return optionalEnv("APP_VERSION");
}

export function getAppCommit(): string | null {
  return optionalEnv("APP_COMMIT");
}

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw appError("BACKUP_CONFIGURATION_INVALID", "DATABASE_URL is not configured", 503);
  return value;
}

export function getAdminLokiUrl(): string | null {
  return optionalEnv("ADMIN_LOKI_URL");
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
