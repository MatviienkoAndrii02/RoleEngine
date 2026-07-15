"use client";

import { useI18n } from "@/i18n/client";

export function EffectPreview({
  condition,
  actions,
  lines,
  warnings = [],
}: {
  condition?: string;
  actions?: string[];
  lines?: string[];
  warnings?: string[];
}) {
  const { t } = useI18n();
  const visibleLines = (lines ?? []).filter(Boolean);
  const visibleActions = (actions ?? []).filter(Boolean);
  const visibleWarnings = warnings.filter(Boolean);
  if (!condition && !visibleActions.length && !visibleLines.length && !visibleWarnings.length) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="mb-2 font-medium">{t("effect.preview")}</div>
      {condition && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase text-muted-foreground">{t("effect.previewIf")}</div>
          <div className="whitespace-pre-wrap break-words text-muted-foreground">{condition}</div>
        </div>
      )}
      {visibleActions.length > 0 && (
        <div className={condition ? "mt-3 space-y-1" : "space-y-1"}>
          <div className="text-xs font-medium uppercase text-muted-foreground">{t("effect.previewDo")}</div>
          <ul className="space-y-1 text-muted-foreground">
            {visibleActions.map((line, index) => <li key={`${line}-${index}`} className="whitespace-pre-wrap break-words">{line}</li>)}
          </ul>
        </div>
      )}
      {visibleLines.length > 0 && (
        <ul className={(condition || visibleActions.length) ? "mt-3 space-y-1 text-muted-foreground" : "space-y-1 text-muted-foreground"}>
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
