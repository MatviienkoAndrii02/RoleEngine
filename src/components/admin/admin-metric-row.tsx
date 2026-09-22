"use client";

import { useI18n } from "@/i18n/client";

export function AdminMetricRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value
        ? <span className="truncate font-medium">{value}</span>
        : <span className="text-muted-foreground">{t("admin.notAvailable")}</span>}
    </div>
  );
}