"use client";

import { RefreshCw } from "lucide-react";
import { isAdminHealthSnapshot } from "@/domain/admin-console";
import { AdminMetricRow } from "@/components/admin/admin-metric-row";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { useAdminResource } from "@/components/admin/use-admin-resource";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { formatBytes, formatDateTime, formatDuration, formatPercent } from "@/lib/admin-format";

export function AdminHealthPanel() {
  const { t, language } = useI18n();
  const { data, error, loading, reload } = useAdminResource("/health", "admin.error.generic", isAdminHealthSnapshot);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{loading ? t("admin.dashboard.loading") : ""}</span>
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

      {data && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("admin.health.application")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">{t("admin.health.application")}</span>
                <AdminStatusBadge state={data.application.status} />
              </div>
              <AdminMetricRow label={t("admin.health.version")} value={data.application.version} />
              <AdminMetricRow label={t("admin.health.commit")} value={data.application.commit} />
              <AdminMetricRow label={t("admin.health.node")} value={data.application.nodeVersion} />
              <AdminMetricRow label={t("admin.health.startedAt")} value={formatDateTime(data.application.startedAt, language)} />
              <AdminMetricRow label={t("admin.health.uptime")} value={formatDuration(data.application.uptimeSeconds, language)} />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("admin.health.database")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">{t("admin.health.database")}</span>
                <AdminStatusBadge state={data.database.status} />
              </div>
              <AdminMetricRow
                label={t("admin.health.latency")}
                value={data.database.latencyMs === null ? null : `${data.database.latencyMs} ms`}
              />
              {data.database.message && <p className="break-words text-xs text-destructive">{data.database.message}</p>}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("admin.health.cpu")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AdminMetricRow label={t("admin.health.cpu")} value={formatPercent(data.cpu.usagePercent)} />
              <AdminMetricRow label={t("admin.health.cores")} value={String(data.cpu.cores)} />
              <AdminMetricRow
                label={t("admin.health.loadAverage")}
                value={data.cpu.loadAverage ? data.cpu.loadAverage.map((value) => value.toFixed(2)).join(" / ") : null}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {data && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("admin.health.memory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AdminMetricRow label={t("admin.health.memory")} value={formatPercent(data.memory.usagePercent)} />
              <AdminMetricRow
                label={t("admin.health.memoryUsed")}
                value={`${formatBytes(data.memory.usedBytes) ?? ""} / ${formatBytes(data.memory.totalBytes) ?? ""}`}
              />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("admin.health.disk")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.disk
                ? (
                  <>
                    <AdminMetricRow label={t("admin.health.disk")} value={formatPercent(data.disk.usagePercent)} />
                    <AdminMetricRow
                      label={t("admin.health.diskFree")}
                      value={`${formatBytes(data.disk.freeBytes) ?? ""} / ${formatBytes(data.disk.totalBytes) ?? ""}`}
                    />
                    <p className="min-w-0 max-w-full break-all text-xs text-muted-foreground">{data.disk.path}</p>
                  </>
                )
                : <p className="text-sm text-muted-foreground">{t("admin.notAvailable")}</p>}
            </CardContent>
          </Card>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("admin.health.backupTool")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">{t("admin.health.backupTool")}</span>
                <span className="min-w-0 break-words text-right font-medium">
                  {data.backupTool.available ? t("admin.health.available") : t("admin.health.unavailable")}
                </span>
              </div>
              <AdminMetricRow label={t("admin.health.path")} value={data.backupTool.path} />
              <AdminMetricRow label={t("admin.health.version")} value={data.backupTool.version} />
              {data.backupTool.message && <p className="break-words text-xs text-destructive">{data.backupTool.message}</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
