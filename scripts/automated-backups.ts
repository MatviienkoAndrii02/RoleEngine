import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { createBackup, listBackups, deleteBackup } from "../src/server/admin/backups";
import { getAdminBackupDirectory } from "../src/server/admin/config";
import { logEvent } from "../src/server/logger";

process.env.LOG_SERVICE_NAME = process.env.LOG_SERVICE_NAME?.trim() || "role-engine-backup";

const pollMs = positiveInteger(process.env.BACKUP_POLL_SECONDS, 60) * 1_000;
const activeMinutes = positiveInteger(process.env.BACKUP_ACTIVE_WINDOW_MINUTES, 10);
const frequentMinutes = positiveInteger(process.env.BACKUP_ACTIVE_INTERVAL_MINUTES, 5);
const retentionDays = positiveInteger(process.env.BACKUP_RETENTION_DAYS, 7);
const dailyHour = boundedInteger(process.env.BACKUP_DAILY_HOUR, 6, 0, 23);
const dailyMinute = boundedInteger(process.env.BACKUP_DAILY_MINUTE, 0, 0, 59);
const statePath = path.join(getAdminBackupDirectory(), ".automation-state.json");
const relevantEntities = ["Character", "CharacterNode", "EntityTemplate", "TemplateNode", "Effect", "TemplateSlot", "TemplateTag", "CharacterAssignment", "Workspace", "WorkspaceMembership"];
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

type State = { lastBackupAt: string | null; lastDailyDate: string | null };

async function main() {
  await fs.mkdir(getAdminBackupDirectory(), { recursive: true });
  let state = await readState();
  logEvent("info", "backup_worker.started", { activeMinutes, frequentMinutes, retentionDays, dailyHour, dailyMinute });
  while (!stopping) {
    try {
      state = await runCycle(state, new Date());
      await writeState(state);
    } catch (error) {
      logEvent("error", "backup_worker.cycle_failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    }
    await delay(pollMs);
  }
  await prisma.$disconnect();
}

async function runCycle(state: State, now: Date): Promise<State> {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const atDailyTime = now.getHours() === dailyHour && now.getMinutes() >= dailyMinute;
  if (atDailyTime && state.lastDailyDate !== today) {
    await createBackup({ actorId: null });
    state = { ...state, lastBackupAt: now.toISOString(), lastDailyDate: today };
    await writeState(state);
    logEvent("info", "backup_worker.daily_backup_completed", { at: now.toISOString() });
  }

  const latestMutation = await getLatestRelevantMutation();
  if (latestMutation && now.getTime() - latestMutation.getTime() <= activeMinutes * 60_000) {
    const lastBackup = state.lastBackupAt ? new Date(state.lastBackupAt) : null;
    if (!lastBackup || now.getTime() - lastBackup.getTime() >= frequentMinutes * 60_000) {
      await createBackup({ actorId: null });
      state = { ...state, lastBackupAt: now.toISOString() };
      await writeState(state);
      logEvent("info", "backup_worker.activity_backup_completed", { at: now.toISOString() });
    }
  }

  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60_000;
  const oldBackups = (await listBackups()).filter((backup) =>
    backup.status === "COMPLETED" && !backup.id.startsWith("backup-safety-") && new Date(backup.createdAt).getTime() < cutoff,
  );
  for (const backup of oldBackups) await deleteBackup({ backupId: backup.id, actorId: null });
  if (oldBackups.length) logEvent("info", "backup_worker.retention_applied", { count: oldBackups.length, retentionDays });
  return state;
}

async function getLatestRelevantMutation(): Promise<Date | null> {
  const latest = await prisma.auditLog.findFirst({
    where: { entityType: { in: relevantEntities } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? null;
}

async function readState(): Promise<State> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(statePath, "utf8"));
    if (typeof parsed === "object" && parsed !== null && "lastBackupAt" in parsed && "lastDailyDate" in parsed) {
      const value = parsed as { lastBackupAt: unknown; lastDailyDate: unknown };
      return {
        lastBackupAt: typeof value.lastBackupAt === "string" ? value.lastBackupAt : null,
        lastDailyDate: typeof value.lastDailyDate === "string" ? value.lastDailyDate : null,
      };
    }
  } catch {
    // A first start or missing state begins with an empty schedule state.
  }
  return { lastBackupAt: null, lastDailyDate: null };
}

async function writeState(state: State) {
  const temporary = `${statePath}.part`;
  await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(temporary, statePath);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  logEvent("error", "backup_worker.stopped", { errorType: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}).finally(async () => {
  if (stopping) await prisma.$disconnect();
});
