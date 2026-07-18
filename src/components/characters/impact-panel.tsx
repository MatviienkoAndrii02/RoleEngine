"use client";

import { useEffect } from "react";
import { GitCompareArrows, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { useCharacterUiStore } from "@/store/character-ui-store";

export function ImpactPanel() {
  const { t } = useI18n();
  const report = useCharacterUiStore((state) => state.impactReport);
  const error = useCharacterUiStore((state) => state.impactError);
  const clear = useCharacterUiStore((state) => state.clearImpactReport);

  useEffect(() => {
    if (!report && !error) return;
    const timeout = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timeout);
  }, [clear, error, report]);

  if (!report && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-h-[70vh] w-[min(calc(100vw-2rem),380px)] overflow-y-auto rounded-md border bg-card p-3 text-sm shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-medium">{t("impact.title")}</h3>
            {report && <p className="text-xs text-muted-foreground">{report.label}</p>}
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={clear} title={t("common.close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">{t("impact.loadFailed")}</p>}

      {report && (
        <div className="mt-3 space-y-3">
          {isEmptyReport(report) ? (
            <p className="rounded-md border border-dashed p-2 text-muted-foreground">{t("impact.noChanges")}</p>
          ) : (
            <>
              {report.valueChanges.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">{t("impact.values")}</div>
                  {report.valueChanges.slice(0, 6).map((change) => (
                    <div key={`${change.nodeId}-${change.field}`} className="rounded-md bg-muted/50 p-2">
                      <div className="font-medium">{change.nodeName}.{fieldLabel(change.field, t)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(change.before)} {"->"} {formatNumber(change.after)}
                      </div>
                    </div>
                  ))}
                  {report.valueChanges.length > 6 && <p className="text-xs text-muted-foreground">{t("impact.moreItems", { count: report.valueChanges.length - 6 })}</p>}
                </div>
              )}

              {(report.addedNodes.length > 0 || report.removedNodes.length > 0) && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">{t("impact.nodes")}</div>
                  {report.addedNodes.slice(0, 4).map((node) => (
                    <NodeLine key={`added-${node.id}`} label={t("impact.added")} name={node.name} type={node.type} generated={node.generated} />
                  ))}
                  {report.removedNodes.slice(0, 4).map((node) => (
                    <NodeLine key={`removed-${node.id}`} label={t("impact.removed")} name={node.name} type={node.type} generated={node.generated} />
                  ))}
                </div>
              )}

              {(report.addedEdges > 0 || report.removedEdges > 0) && (
                <div className="flex flex-wrap gap-2">
                  {report.addedEdges > 0 && <Badge>{t("impact.addedEdges", { count: report.addedEdges })}</Badge>}
                  {report.removedEdges > 0 && <Badge>{t("impact.removedEdges", { count: report.removedEdges })}</Badge>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NodeLine({ label, name, type, generated }: { label: string; name: string; type: string; generated: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2">
      <div className="min-w-0">
        <div className="truncate font-medium">{label}: {name}</div>
        <div className="text-xs text-muted-foreground">{type}</div>
      </div>
      {generated && <Badge>{t("impact.generated")}</Badge>}
    </div>
  );
}

function isEmptyReport(report: NonNullable<ReturnType<typeof useCharacterUiStore.getState>["impactReport"]>) {
  return report.valueChanges.length === 0 && report.addedNodes.length === 0 && report.removedNodes.length === 0 && report.addedEdges === 0 && report.removedEdges === 0;
}

function fieldLabel(field: string, t: ReturnType<typeof useI18n>["t"]) {
  if (field === "value" || field === "current") return t("common.value");
  if (field === "min") return t("node.minimum");
  if (field === "max") return t("node.maximum");
  return field;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
