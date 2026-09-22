// Operational messages may echo tool output or driver errors that contain the
// database password, so every message that can reach the admin UI or a log
// passes through this redaction step first.
export function redactSecrets(text: string, secrets: Array<string | null | undefined>, maxLength = 300): string {
  let sanitized = text;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value || value.length < 3) continue;
    sanitized = sanitized.split(value).join("***");
  }
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, maxLength)}...`;
}