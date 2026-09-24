type LogLevel = "info" | "warn" | "error";

const sensitiveField = /password|secret|token|authorization|cookie|database_url|connection_string/i;

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.LOG_SERVICE_NAME?.trim() || "role-engine",
    event,
    ...sanitizeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    sensitiveField.test(key) ? "[REDACTED]" : sanitizeValue(value),
  ]));
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object" && value !== null) {
    return sanitizeFields(Object.fromEntries(Object.entries(value)));
  }
  return value;
}
