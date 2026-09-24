"use client";

import { useState } from "react";
import { AlertTriangle, Download, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { AdminBackupRecord, AdminBackupRestoreResult } from "@/domain/admin-console";
import { isAdminBackupListResponse, isAdminBackupRestoreResult, isSafetyBackupRecord } from "@/domain/admin-console";
import { AdminBackupRestoreDialog, restoreConfirmationToken } from "@/components/admin/admin-backup-restore-dialog";
import { useAdminResource } from "@/components/admin/use-admin-resource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { adminApiUrl } from "@/lib/admin-api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/admin-format";

const storageFileMissingMessage = "STORAGE_FILE_MISSING";

export function AdminBackupsManager() {
  const { t, language } = useI18n();
  const { data, error, loading, reload } = useAdminResource("/backups", "admin.error.generic", isAdminBackupListResponse);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AdminBackupRecord | null>(null);
  const [restorePending, setRestorePending] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<AdminBackupRestoreResult | null>(null);

  async function createBackup() {
    setPending("create");
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(adminApiUrl("/backups"), { method: "POST" });
      if (!response.ok) {
        setActionError(await localizedApiError(response, t, "admin.backups.createFailed"));
        return;
      }
      setNotice(t("admin.backups.created"));
      await reload();
    } catch {
      setActionError(t("admin.backups.createFailed"));
    } finally {
      setPending(null);
    }
  }

  async function deleteBackup(backup: AdminBackupRecord) {
    if (!window.confirm(t("admin.backups.deleteConfirm", { name: backup.fileName }))) return;
    setPending(backup.id);
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch(adminApiUrl(`/backups/${backup.id}`), { method: "DELETE" });
      if (!response.ok) {
        setActionError(await localizedApiError(response, t, "admin.error.generic"));
        return;
      }
      setNotice(t("admin.backups.deleted"));
      await reload();
    } catch {
      setActionError(t("admin.error.generic"));
    } finally {
      setPending(null);
    }
  }

  function openRestore(backup: AdminBackupRecord) {
    setRestoreTarget(backup);
    setRestoreError(null);
    setActionError(null);
    setNotice(null);
  }

  async function restoreBackup() {
    if (!restoreTarget) return;
    setRestorePending(true);
    setRestoreError(null);
    try {
      const response = await fetch(adminApiUrl(`/backups/${restoreTarget.id}/restore`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: restoreConfirmationToken }),
      });
      if (!response.ok) {
        setRestoreError(await localizedApiError(response, t, "admin.backups.restoreFailed"));
        return;
      }
      const payload: unknown = await response.json();
      setRestoreResult(isAdminBackupRestoreResult(payload) ? payload : null);
      setRestoreTarget(null);
      await reload();
    } catch {
      setRestoreError(t("admin.backups.restoreFailed"));
    } finally {
      setRestorePending(false);
    }
  }

  const backups = data?.backups ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="break-all text-xs text-muted-foreground">
          {data ? t("admin.backups.storage", { directory: data.storage.directory }) : ""}
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()} disabled={loading || pending !== null}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("admin.dashboard.refresh")}
          </Button>
          <Button type="button" size="sm" onClick={() => void createBackup()} disabled={pending !== null}>
            <Plus className="h-4 w-4" />
            {pending === "create" ? t("admin.backups.creating") : t("admin.backups.create")}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
      {actionError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{actionError}</CardContent>
        </Card>
      )}
      {notice && (
        <Card className="border-emerald-300 bg-emerald-50/70">
          <CardContent className="p-4 text-sm text-emerald-900">{notice}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.backups.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !data && <p className="text-sm text-muted-foreground">{t("admin.dashboard.loading")}</p>}
          {!loading && backups.length === 0 && <p className="text-sm text-muted-foreground">{t("admin.backups.empty")}</p>}
          {backups.map((backup) => (
            <div key={backup.id} className="flex flex-col gap-3 rounded-md border border-border p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={backup.status === "COMPLETED" ? "bg-emerald-100 text-emerald-900" : "bg-destructive/10 text-destructive"}>
                    {t(`admin.backups.status.${backup.status}`)}
                  </Badge>
                  {isSafetyBackupRecord(backup) && (
                    <Badge className="bg-amber-100 text-amber-900">{t("admin.backups.safetyBadge")}</Badge>
                  )}
                  <span className="truncate text-sm font-medium">{backup.fileName}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDateTime(backup.createdAt, language)}</span>
                  {formatBytes(backup.sizeBytes) && <span>{formatBytes(backup.sizeBytes)}</span>}
                  {backup.schemaMigration && <span>{t("admin.backups.migration", { name: backup.schemaMigration })}</span>}
                  {backup.appVersion && <span>{backup.appVersion}</span>}
                  {backup.appCommit && <span>{backup.appCommit}</span>}
                </div>
                {backup.message && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {backup.message === storageFileMissingMessage ? t("admin.backups.storageFileMissing") : backup.message}
                  </p>
                )}
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                {backup.status === "COMPLETED" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full whitespace-normal px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto sm:px-3 sm:text-sm"
                    onClick={() => openRestore(backup)}
                    disabled={pending !== null || restorePending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("admin.backups.restore")}
                  </Button>
                )}
                {backup.status === "COMPLETED" && (
                  <Button asChild size="sm" variant="outline" className="w-full whitespace-normal px-2 text-xs sm:w-auto sm:px-3 sm:text-sm">
                    <a href={adminApiUrl(`/backups/${backup.id}/download`)}>
                      <Download className="h-4 w-4" />
                      {t("admin.backups.download")}
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full whitespace-normal px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto sm:px-3 sm:text-sm"
                  onClick={() => void deleteBackup(backup)}
                  disabled={pending !== null || restorePending}
                >
                  <Trash2 className="h-4 w-4" />
                  {pending === backup.id ? t("admin.backups.deleting") : t("admin.backups.delete")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {restoreResult && (
        <Card className="border-emerald-300 bg-emerald-50/70">
          <CardContent className="space-y-1 p-4 text-sm text-emerald-900">
            <p className="font-medium">{t("admin.backups.restoreSuccess")}</p>
            <p className="break-all">
              {t("admin.backups.restoreSuccessTarget", { name: restoreResult.backupFileName })}
            </p>
            <p>
              {t("admin.backups.restoreSuccessTiming", {
                date: formatDateTime(restoreResult.restoredAt, language) ?? restoreResult.restoredAt,
                duration: formatDuration(Math.max(1, Math.round(restoreResult.durationMs / 1_000)), language),
              })}
            </p>
            <p className="break-all">
              {t("admin.backups.restoreSafetyBackup", { name: restoreResult.safetyBackup.fileName })}
            </p>
            {restoreResult.schemaChanged && (
              <p className="text-amber-900">
                {t("admin.backups.restoreSchemaChanged", {
                  restored: restoreResult.restoredSchemaMigration ?? t("common.unknown"),
                  expected: restoreResult.previousSchemaMigration ?? t("common.unknown"),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {restoreTarget && (
        <AdminBackupRestoreDialog
          backup={restoreTarget}
          pending={restorePending}
          error={restoreError}
          onCancel={() => {
            setRestoreTarget(null);
            setRestoreError(null);
          }}
          onConfirm={() => void restoreBackup()}
        />
      )}
    </div>
  );
}
