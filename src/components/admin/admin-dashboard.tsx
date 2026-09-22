"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { isAdminOverviewResponse } from "@/domain/admin-console";
import { AdminMetricRow } from "@/components/admin/admin-metric-row";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { useAdminResource } from "@/components/admin/use-admin-resource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { formatBytes, formatDateTime, formatDuration, formatPercent } from "@/lib/admin-format";

export function AdminDashboard() {
  const { t, language } = useI18n();
  const { data, error, loading, reload } = useAdminResource("/overview", "admin.error.generic", isAdminOverviewResponse);
  const lastBackup = data?.backup.lastBackup ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {data ? t("admin.dashboard.generatedAt", { date: formatDateTime(data.generatedAt, language) ?? "" }) : ""}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("admin.dashboard.loading") : t("admin.dashboard.refresh")}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && !data && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{t("admin.dashboard.loading")}</CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.dashboard.system")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t("admin.health.application")}</span>
                <AdminStatusBadge state={data.health.application.status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t("admin.health.database")}</span>
                <AdminStatusBadge state={data.health.database.status} />
              </div>
              <AdminMetricRow label={t("admin.health.cpu")} value={formatPercent(data.health.cpu.usagePercent)} />
              <AdminMetricRow label={t("admin.health.memory")} value={formatPercent(data.health.memory.usagePercent)} />
              <AdminMetricRow label={t("admin.health.disk")} value={data.health.disk ? formatPercent(data.health.disk.usagePercent) : null} />
              <AdminMetricRow label={t("admin.health.uptime")} value={formatDuration(data.health.application.uptimeSeconds, language)} />
              <Link className="inline-block text-sm underline-offset-4 hover:underline" href="/admin/health">
                {t("admin.dashboard.openHealth")}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.dashboard.backups")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AdminMetricRow
                label={t("admin.dashboard.lastBackup")}
                value={lastBackup ? formatDateTime(lastBackup.createdAt, language) : null}
              />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t("admin.backups.column.status")}</span>
                {lastBackup
                  ? (
                    <Badge className={lastBackup.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900" : "bg-destructive/10 text-destructive"}>
                      {t(`admin.backups.status.${lastBackup.status}`)}
                    </Badge>
                  )
                  : <span className="text-muted-foreground">{t("admin.none")}</span>}
              </div>
              <AdminMetricRow label={t("admin.backups.column.size")} value={formatBytes(lastBackup?.sizeBytes)} />
              <AdminMetricRow label={t("admin.dashboard.backupCount")} value={String(data.backup.totalCount)} />
              <AdminMetricRow
                label={t("admin.health.backupTool")}
                value={data.health.backupTool.available ? t("admin.health.available") : t("admin.health.unavailable")}
              />
              {!data.health.backupTool.available && data.health.backupTool.message && (
                <p className="text-xs text-destructive">{t("admin.backups.toolUnavailable", { message: data.health.backupTool.message })}</p>
              )}
              {data.backup.totalCount === 0 && <p className="text-xs text-muted-foreground">{t("admin.backups.empty")}</p>}
              <Link className="inline-block text-sm underline-offset-4 hover:underline" href="/admin/backups">
                {t("admin.dashboard.manageBackups")}
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}