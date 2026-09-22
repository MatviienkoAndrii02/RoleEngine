import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AdminApplicationHealth,
  AdminCpuHealth,
  AdminDatabaseHealth,
  AdminDiskHealth,
  AdminHealthSnapshot,
  AdminMemoryHealth,
} from "@/domain/admin-console";
import { prisma } from "@/lib/prisma";
import { getAdminBackupDirectory, getAppCommit, getAppVersion, getDatabaseUrl, getPgDumpExecutable } from "@/server/admin/config";
import { parseDatabaseConnection, probePgDump } from "@/server/admin/pg-tools";
import { redactSecrets } from "@/server/admin/redact";

const cpuSampleWindowMs = 200;

export async function getAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
  const [database, backupTool, disk, cpu] = await Promise.all([
    checkDatabase(),
    probePgDump(getPgDumpExecutable()),
    readDiskUsage(),
    sampleCpuHealth(),
  ]);

  return {
    application: readApplicationHealth(),
    database,
    cpu,
    memory: readMemoryHealth(),
    disk,
    backupTool,
  };
}

// The application reports UP because this process answered the request; the database and
// backup tool checks carry the deeper readiness information.
function readApplicationHealth(): AdminApplicationHealth {
  const uptimeSeconds = Math.round(process.uptime());
  return {
    status: "UP",
    startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
    uptimeSeconds,
    nodeVersion: process.version,
    version: getAppVersion(),
    commit: getAppCommit(),
  };
}

async function checkDatabase(): Promise<AdminDatabaseHealth> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "UP", latencyMs: Date.now() - startedAt, message: null };
  } catch (error) {
    return {
      status: "DOWN",
      latencyMs: null,
      message: redactSecrets(error instanceof Error ? error.message : String(error), [databasePassword()]),
    };
  }
}

async function sampleCpuHealth(): Promise<AdminCpuHealth> {
  return {
    usagePercent: await sampleCpuUsagePercent(),
    cores: os.cpus().length,
    // Windows has no load average; reporting zeros would look like a real measurement.
    loadAverage: process.platform === "win32" ? null : os.loadavg(),
  };
}

export async function sampleCpuUsagePercent(windowMs = cpuSampleWindowMs): Promise<number | null> {
  const start = readCpuTimes();
  if (!start) return null;
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const end = readCpuTimes();
  if (!end) return null;

  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return null;
  return roundPercent((1 - idleDelta / totalDelta) * 100);
}

function readCpuTimes(): { idle: number; total: number } | null {
  const cpus = os.cpus();
  if (!cpus.length) return null;

  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

function readMemoryHealth(): AdminMemoryHealth {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(totalBytes - freeBytes, 0);
  return {
    totalBytes,
    usedBytes,
    usagePercent: totalBytes > 0 ? roundPercent((usedBytes / totalBytes) * 100) : 0,
  };
}

async function readDiskUsage(): Promise<AdminDiskHealth | null> {
  const candidates = [getAdminBackupDirectory(), path.parse(process.cwd()).root];
  for (const candidate of candidates) {
    try {
      const stats = await fs.promises.statfs(candidate);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      if (totalBytes <= 0) continue;
      return {
        path: candidate,
        totalBytes,
        freeBytes,
        usagePercent: roundPercent(((totalBytes - freeBytes) / totalBytes) * 100),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function databasePassword(): string | null {
  try {
    return parseDatabaseConnection(getDatabaseUrl()).password;
  } catch {
    return null;
  }
}

function roundPercent(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10;
}