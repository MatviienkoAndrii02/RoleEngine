import type { Language } from "@/i18n/translations";

const dateLocales: Record<Language, string> = { uk: "uk-UA", en: "en-GB" };

export function formatDateTime(value: string | null | undefined, language: Language): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(dateLocales[language]);
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatPercent(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `${value}%`;
}

export function formatDuration(seconds: number, language: Language): string {
  const labels = language === "uk"
    ? { day: "д", hour: "год", minute: "хв", second: "с" }
    : { day: "d", hour: "h", minute: "m", second: "s" };

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}${labels.day}`);
  if (hours) parts.push(`${hours}${labels.hour}`);
  if (minutes) parts.push(`${minutes}${labels.minute}`);
  if (!parts.length) parts.push(`${seconds % 60}${labels.second}`);
  return parts.join(" ");
}