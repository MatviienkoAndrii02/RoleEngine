"use client";

export function workspaceApiUrl(path: string) {
  if (!path.startsWith("/api/") || path.startsWith("/api/workspaces/")) return path;
  if (typeof document === "undefined") return path;
  const main = document.querySelector("main");
  const explicitContext = main?.querySelector<HTMLElement>("[data-workspace-context]")?.dataset.workspaceContext;
  const workspaceId = explicitContext ?? (main instanceof HTMLElement ? main.dataset.workspaceContext : undefined);
  if (!workspaceId) return path;
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/${path.slice("/api/".length)}`;
}
