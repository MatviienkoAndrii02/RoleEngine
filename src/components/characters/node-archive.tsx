"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export type ArchivedNodeItem = {
  id: string;
  name: string;
  path: string;
  type: string;
  subtreeCount: number;
};

export function NodeArchive({ characterId, items }: { characterId: string; items: ArchivedNodeItem[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(item: ArchivedNodeItem) {
    if (!window.confirm(t("nodeArchive.restoreConfirm", { name: item.name }))) return;
    setPendingId(item.id);
    setError(null);
    const response = await fetch(`/api/characters/${characterId}/nodes/${item.id}/restore`, { method: "POST" });
    setPendingId(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "common.restoreFailed"));
      return;
    }
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("nodeArchive.empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.type}</span>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  {t("nodeArchive.path", { path: item.path })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("nodeArchive.subtreeCount", { count: item.subtreeCount })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={pendingId === item.id}
                onClick={() => restore(item)}
              >
                <RotateCcw className="h-4 w-4" />
                {pendingId === item.id ? t("common.loading") : t("common.restore")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
