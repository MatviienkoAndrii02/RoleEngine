"use client";

import { useI18n } from "@/i18n/client";

export function AdminMetricRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 text-sm">
      <span className="min-w-0 break-words text-muted-foreground">{label}</span>
      {value
        ? <span className="min-w-0 break-all text-right font-medium" title={value}>{value}</span>
        : <span className="min-w-0 break-words text-right text-muted-foreground">{t("admin.notAvailable")}</span>}
    </div>
  );
}
