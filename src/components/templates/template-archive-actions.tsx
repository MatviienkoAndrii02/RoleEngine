"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function TemplateArchiveActions({ templateId, name }: { templateId: string; name: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<"restore" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setPending("restore");
    setError(null);
    const response = await fetch(`/api/templates/${templateId}/restore`, { method: "POST" });
    setPending(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "template.restoreFailed"));
      return;
    }
    router.refresh();
  }

  async function removePermanently() {
    if (!window.confirm(t("template.permanentDeleteConfirm", { name }))) return;
    setPending("delete");
    setError(null);
    const response = await fetch(`/api/templates/${templateId}?permanent=1`, { method: "DELETE" });
    setPending(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "template.permanentDeleteFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending !== null} onClick={restore}>
          <RotateCcw className="h-4 w-4" />
          {pending === "restore" ? t("common.saving") : t("common.restore")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending !== null} onClick={removePermanently}>
          <Trash2 className="h-4 w-4" />
          {t("template.permanentDelete")}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
