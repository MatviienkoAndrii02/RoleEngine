"use client";

import { useState } from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function CharacterViewMode({
  gmView,
  playerView,
}: {
  gmView: React.ReactNode;
  playerView: React.ReactNode;
}) {
  const { t } = useI18n();
  const [asPlayer, setAsPlayer] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            {asPlayer ? <Eye className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {asPlayer ? t("playerPreview.activeTitle") : t("playerPreview.gmTitle")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {asPlayer ? t("playerPreview.activeDescription") : t("playerPreview.gmDescription")}
          </p>
        </div>
        <Button type="button" variant={asPlayer ? "default" : "outline"} onClick={() => setAsPlayer((value) => !value)}>
          {asPlayer ? t("playerPreview.exit") : t("playerPreview.enter")}
        </Button>
      </div>
      {asPlayer ? playerView : gmView}
    </div>
  );
}
