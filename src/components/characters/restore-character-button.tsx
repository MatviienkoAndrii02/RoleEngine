"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function RestoreCharacterButton({ characterId, name }: { characterId: string; name: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!window.confirm(t("common.restore") + ` "${name}"?`)) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/characters/${characterId}/restore`, { method: "POST" });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "common.restoreFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={restore}>
        <RotateCcw className="h-4 w-4" />
        {pending ? t("common.loading") : t("common.restore")}
      </Button>
      {error && <p className="max-w-48 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
