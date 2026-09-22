"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import type { AdminBackupRecord } from "@/domain/admin-console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { formatBytes, formatDateTime } from "@/lib/admin-format";

// Restoring overwrites the whole database, so the operator has to type the token instead of
// clicking a single button; the dialog cannot be dismissed while the request is in flight.
export const restoreConfirmationToken = "RESTORE";

export type AdminBackupRestoreDialogProps = {
  backup: AdminBackupRecord;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminBackupRestoreDialog({ backup, pending, error, onCancel, onConfirm }: AdminBackupRestoreDialogProps) {
  const { t, language } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim() === restoreConfirmationToken;
  const size = formatBytes(backup.sizeBytes);
  const createdAt = formatDateTime(backup.createdAt, language);

  useEffect(() => {
    if (pending) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-restore-title"
        className="w-full max-w-lg space-y-3 rounded-lg border border-destructive/40 bg-background p-4 shadow-lg"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <h2 id="admin-restore-title" className="text-base font-semibold">
            {t("admin.backups.restoreTitle")}
          </h2>
        </div>

        <p className="text-sm text-destructive">{t("admin.backups.restoreWarning")}</p>

        <div className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground">
          <p className="break-all">{t("admin.backups.restoreTarget", { name: backup.fileName })}</p>
          {createdAt && <p>{t("admin.backups.restoreCreatedAt", { date: createdAt })}</p>}
          {size && <p>{t("admin.backups.restoreSize", { size })}</p>}
        </div>

        <p className="text-xs text-muted-foreground">{t("admin.backups.restoreSafetyNote")}</p>

        {pending ? (
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("admin.backups.restoring")}
          </p>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="admin-restore-confirmation">
              {t("admin.backups.restoreConfirmLabel")}
            </label>
            <Input
              id="admin-restore-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={restoreConfirmationToken}
              autoComplete="off"
              autoFocus
              disabled={pending}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
            {t("admin.backups.restoreCancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
            disabled={pending || !confirmed}
          >
            <RotateCcw className="h-4 w-4" />
            {pending ? t("admin.backups.restoring") : t("admin.backups.restore")}
          </Button>
        </div>
      </div>
    </div>
  );
}
