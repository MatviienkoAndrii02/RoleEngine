"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AdminLogsResponse, AdminLogsSource } from "@/domain/admin-console";
import { isAdminLogsResponse } from "@/domain/admin-console";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { adminApiUrl } from "@/lib/admin-api";

type LogRange = AdminLogsResponse["range"];

export function AdminLogsPanel() {
  const { t, language } = useI18n();
  const [range, setRange] = useState<LogRange>("1h");
  const [source, setSource] = useState<AdminLogsSource>("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdminLogsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range, source });
      const response = await fetch(adminApiUrl(`/logs?${params.toString()}`), { cache: "no-store" });
      if (!response.ok) {
        setError(await localizedApiError(response, t, "admin.logs.loadFailed"));
        setData(null);
        return;
      }
      const payload: unknown = await response.json();
      if (!isAdminLogsResponse(payload)) {
        setError(t("admin.logs.loadFailed"));
        setData(null);
        return;
      }
      setData(payload);
      setError(null);
    } catch {
      setError(t("admin.logs.loadFailed"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range, source, t]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const visibleLogs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return data?.logs ?? [];
    return (data?.logs ?? []).filter((entry) =>
      `${entry.service} ${entry.level} ${entry.event ?? ""} ${entry.message}`.toLocaleLowerCase().includes(query),
    );
  }, [data, search]);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language === "uk" ? "uk-UA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }), [language]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("admin.logs.timeRange")}
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={range} onChange={(event) => {
              if (isLogRange(event.target.value)) setRange(event.target.value);
            }}>
              <option value="15m">15 {t("admin.logs.minutes")}</option>
              <option value="1h">1 {t("admin.logs.hour")}</option>
              <option value="6h">6 {t("admin.logs.hours")}</option>
              <option value="24h">24 {t("admin.logs.hours")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("admin.logs.source")}
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={source} onChange={(event) => {
              if (isLogsSource(event.target.value)) setSource(event.target.value);
            }}>
              <option value="all">{t("admin.logs.allSources")}</option>
              <option value="app">{t("admin.logs.application")}</option>
              <option value="worker">{t("admin.logs.backupWorker")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("admin.logs.search")}
            <input
              className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground sm:min-w-56 sm:w-auto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("admin.logs.searchPlaceholder")}
            />
          </label>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("admin.dashboard.refresh")}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t("admin.logs.title")}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {loading ? t("admin.dashboard.loading") : t("admin.logs.entryCount", { count: visibleLogs.length })}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {!loading && !error && visibleLogs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("admin.logs.empty")}</p>
          )}
          {visibleLogs.map((entry, index) => (
            <article key={`${entry.timestamp}-${entry.service}-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[190px_70px_150px_minmax(0,1fr)] md:items-start">
              <time className="text-xs text-muted-foreground" dateTime={entry.timestamp}>
                {dateFormatter.format(new Date(entry.timestamp))}
              </time>
              <span className={`text-xs font-semibold uppercase ${entry.level === "error" ? "text-destructive" : entry.level === "warn" ? "text-amber-600" : "text-muted-foreground"}`}>
                {entry.level}
              </span>
              <span className="break-all text-xs text-muted-foreground">{entry.service}{entry.event ? ` · ${entry.event}` : ""}</span>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">{entry.message}</pre>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function isLogRange(value: string): value is LogRange {
  return value === "15m" || value === "1h" || value === "6h" || value === "24h";
}

function isLogsSource(value: string): value is AdminLogsSource {
  return value === "app" || value === "worker" || value === "all";
}
