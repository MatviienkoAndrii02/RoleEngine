"use client";

import { useI18n } from "@/i18n/client";

export function EffectPreview({ lines, warnings = [] }: { lines: string[]; warnings?: string[] }) {
  const { t } = useI18n();
  const visibleLines = lines.filter(Boolean);
  const visibleWarnings = warnings.filter(Boolean);
  if (!visibleLines.length && !visibleWarnings.length) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="mb-2 font-medium">{t("effect.preview")}</div>
      {visibleLines.length > 0 && (
        <ul className="space-y-1 text-muted-foreground">
          {visibleLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
        </ul>
      )}
      {visibleWarnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-destructive">
          {visibleWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
        </ul>
      )}
    </div>
  );
}
