import type { AdminLogEntry, AdminLogsSource } from "@/domain/admin-console";
import { getAdminLokiUrl } from "@/server/admin/config";
import { appError } from "@/server/errors";
import { logEvent } from "@/server/logger";

const allowedRanges = ["15m", "1h", "6h", "24h"] as const;
const maxEntries = 200;
const sensitiveField = /password|secret|token|authorization|cookie|database_url|connection_string/i;
type AdminLogRange = (typeof allowedRanges)[number];

export async function getAdminLogs(input: { range: string; source: string }): Promise<{
  generatedAt: string;
  range: (typeof allowedRanges)[number];
  source: AdminLogsSource;
  logs: AdminLogEntry[];
}> {
  if (!isLogRange(input.range)) {
    throw appError("BAD_REQUEST", "Unsupported log time range", 400);
  }
  if (!isLogsSource(input.source)) {
    throw appError("BAD_REQUEST", "Unsupported log source", 400);
  }

  const baseUrl = getAdminLokiUrl();
  if (!baseUrl) throw appError("ADMIN_LOGS_UNAVAILABLE", "Log storage is not configured", 503);

  let endpoint: URL;
  try {
    endpoint = new URL("/loki/api/v1/query_range", baseUrl);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("Unsupported protocol");
  } catch {
    throw appError("ADMIN_LOGS_UNAVAILABLE", "Log storage configuration is invalid", 503);
  }

  const selector = sourceSelector(input.source);
  const endNs = BigInt(Date.now()) * 1_000_000n;
  const rangeMs = rangeMilliseconds(input.range);
  const startNs = endNs - BigInt(rangeMs) * 1_000_000n;
  endpoint.searchParams.set("query", selector);
  endpoint.searchParams.set("start", startNs.toString());
  endpoint.searchParams.set("end", endNs.toString());
  endpoint.searchParams.set("limit", String(maxEntries));
  endpoint.searchParams.set("direction", "backward");

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const logs = parseLokiEntries(payload);
    return {
      generatedAt: new Date().toISOString(),
      range: input.range,
      source: input.source,
      logs: logs.slice(0, maxEntries),
    };
  } catch (error) {
    logEvent("error", "admin.logs_query_failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    throw appError("ADMIN_LOGS_UNAVAILABLE", "Log storage could not be queried", 503);
  }
}

function sourceSelector(source: AdminLogsSource): string {
  if (source === "app") return '{service_name="role-engine"}';
  if (source === "worker") return '{service_name="role-engine-backup"}';
  return '{service_name=~"role-engine|role-engine-backup"}';
}

function rangeMilliseconds(range: AdminLogRange): number {
  switch (range) {
    case "15m": return 15 * 60_000;
    case "1h": return 60 * 60_000;
    case "6h": return 6 * 60 * 60_000;
    case "24h": return 24 * 60 * 60_000;
  }
}

function isLogRange(value: string): value is AdminLogRange {
  return allowedRanges.some((range) => range === value);
}

function isLogsSource(value: string): value is AdminLogsSource {
  return value === "app" || value === "worker" || value === "all";
}

function parseLokiEntries(value: unknown): AdminLogEntry[] {
  if (!isRecord(value) || value.status !== "success" || !isRecord(value.data) || !Array.isArray(value.data.result)) {
    throw new Error("Invalid log response");
  }

  const entries: AdminLogEntry[] = [];
  for (const stream of value.data.result) {
    if (!isRecord(stream) || !isRecord(stream.stream) || !Array.isArray(stream.values)) continue;
    const service = typeof stream.stream.service_name === "string" ? stream.stream.service_name : "unknown";
    for (const item of stream.values) {
      if (!Array.isArray(item) || typeof item[0] !== "string" || typeof item[1] !== "string") continue;
      const timestampMs = Number(item[0].slice(0, 13));
      if (!Number.isFinite(timestampMs)) continue;
      entries.push(parseLogLine(item[1], service, new Date(timestampMs).toISOString()));
    }
  }
  return entries.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function parseLogLine(line: string, service: string, timestamp: string): AdminLogEntry {
  try {
    const value: unknown = JSON.parse(line);
    if (isRecord(value)) {
      const fullLog = JSON.stringify(redactLogFields(value), null, 2);
      return {
        timestamp: typeof value.timestamp === "string" ? value.timestamp : timestamp,
        service: typeof value.service === "string" ? value.service : service,
        level: normalizeLevel(value.level),
        event: typeof value.event === "string" ? value.event : null,
        message: typeof value.message === "string" ? value.message : typeof value.event === "string" ? value.event : fullLog,
        fullLog,
      };
    }
  } catch {
    // Framework and runtime logs are often plain text rather than JSON.
  }
  const fullLog = line.slice(0, 12_000);
  return { timestamp, service, level: "info", event: null, message: fullLog, fullLog };
}

function redactLogFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogFields);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [
    key,
    sensitiveField.test(key) ? "[REDACTED]" : redactLogFields(fieldValue),
  ]));
}

function normalizeLevel(value: unknown): AdminLogEntry["level"] {
  return value === "error" || value === "warn" || value === "debug" ? value : "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
