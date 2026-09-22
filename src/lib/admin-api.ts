// Client-safe helper for the admin API namespace. The base is configurable so the
// Admin Console can later be served from a different origin without touching UI code.
const defaultAdminApiBase = "/admin-api";

export function adminApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_ADMIN_API_BASE?.trim();
  if (!configured) return defaultAdminApiBase;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

export function adminApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${adminApiBase()}${normalized}`;
}