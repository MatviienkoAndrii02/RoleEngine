"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import type { JsonIntegrityEntry, JsonIntegrityQuarantineView } from "@/domain/json-integrity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { useCharacterUiStore } from "@/store/character-ui-store";

const VISIBLE_ENTRIES = 10;

export function JsonIntegrityPanel({
  scopeKind,
  scopeId,
  entries,
  quarantine,
}: {
  scopeKind: "character" | "template";
  scopeId: string;
  entries: JsonIntegrityEntry[];
  quarantine: JsonIntegrityQuarantineView[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const trackImpact = useCharacterUiStore((state) => state.trackImpact);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  if (!entries.length && !quarantine.length) return null;

  const endpoint = scopeKind === "character"
    ? `/api/characters/${scopeId}/json-integrity`
    : `/api/templates/${scopeId}/json-integrity`;
  const repairableCount = entries.filter((entry) => entry.repairable).length;
  const activeQuarantine = quarantine.filter((row) => row.status === "ACTIVE");

  async function post(body: Record<string, unknown>, pendingKey: string) {
    setPending(pendingKey);
    setError(null);
    setSummary(null);
    const send = () => fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await trackImpact(scopeKind === "character" ? scopeId : undefined, t("jsonIntegrity.title"), send);
    setPending(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "jsonIntegrity.failed"));
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (isApplyResult(payload)) {
      setSummary(t("jsonIntegrity.summary", { repaired: payload.repaired, quarantined: payload.quarantined }));
    }
    router.refresh();
  }

  return (
    <Card className="border-amber-300 bg-amber-50/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-950">
            <ShieldAlert className="h-5 w-5" />
            {t("jsonIntegrity.title")}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pending !== null || repairableCount === 0} onClick={() => post({ action: "repair" }, "repair")}>
              {pending === "repair" ? t("jsonIntegrity.pending") : t("jsonIntegrity.repairAll")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending !== null || entries.length === 0} onClick={() => post({ action: "quarantine" }, "quarantine")}>
              {pending === "quarantine" ? t("jsonIntegrity.pending") : t("jsonIntegrity.quarantineAll")}
            </Button>
          </div>
        </div>
        <p className="text-sm text-amber-900">{t("jsonIntegrity.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
        {summary && <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">{summary}</p>}

        {entries.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="bg-amber-100 text-amber-950">{t("jsonIntegrity.invalidCount", { count: entries.length })}</Badge>
            <Badge className="bg-amber-100 text-amber-950">{t("jsonIntegrity.repairableCount", { count: repairableCount })}</Badge>
            <Badge className="bg-amber-100 text-amber-950">{t("jsonIntegrity.manualCount", { count: entries.length - repairableCount })}</Badge>
          </div>
        )}

        {entries.length > 0 && (
          <ul className="space-y-2">
            {entries.slice(0, VISIBLE_ENTRIES).map((entry) => (
              <li key={`${entry.entityType}-${entry.entityId}-${entry.field}`} className="rounded-md border border-amber-200 bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words font-medium">{entry.entityName}</span>
                  <Badge className="bg-amber-100 text-amber-950">{t(`problems.entity.${entry.entityType}`)}</Badge>
                  <Badge className={entry.repairable ? "bg-emerald-100 text-emerald-900" : "bg-destructive/10 text-destructive"}>
                    {entry.repairable ? t("jsonIntegrity.strategy.repair") : t("jsonIntegrity.strategy.quarantine")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("jsonIntegrity.entry", { name: entry.entityName, field: entry.field })}</p>
                {entry.issues.length > 0 && (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {entry.issues.slice(0, 3).map((issue, index) => <li key={`${entry.entityId}-${index}`}>{issue}</li>)}
                  </ul>
                )}
              </li>
            ))}
            {entries.length > VISIBLE_ENTRIES && (
              <li className="text-xs text-muted-foreground">{t("diagnostics.moreInvalid", { count: entries.length - VISIBLE_ENTRIES })}</li>
            )}
          </ul>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-amber-950">{t("jsonIntegrity.quarantineTitle")}</span>
            <Badge className="bg-amber-100 text-amber-950">{t("jsonIntegrity.quarantineCount", { count: activeQuarantine.length })}</Badge>
          </div>
          {quarantine.length === 0
            ? <p className="text-xs text-muted-foreground">{t("jsonIntegrity.quarantineEmpty")}</p>
            : (
              <ul className="space-y-2">
                {quarantine.slice(0, VISIBLE_ENTRIES).map((row) => (
                  <li key={row.id} className="rounded-md border border-amber-200 bg-background p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium">{row.entityName}</span>
                      <Badge className="bg-amber-100 text-amber-950">{t(`problems.entity.${row.entityType}`)}</Badge>
                      <Badge className={row.status === "ACTIVE" ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-900"}>
                        {t(`jsonIntegrity.status.${row.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("jsonIntegrity.entry", { name: row.entityName, field: row.field })}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("jsonIntegrity.detectedAt", { date: formatTimestamp(row.detectedAt) })}
                      {row.repairs.length > 0 ? ` · ${t("jsonIntegrity.repairsApplied", { count: row.repairs.length })}` : ""}
                    </p>
                    {row.status === "ACTIVE" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={pending !== null || !row.repairable} onClick={() => post({ action: "resolve", entryId: row.id, resolution: "repair" }, row.id)}>
                          {pending === row.id ? t("jsonIntegrity.pending") : t("jsonIntegrity.resolveRepair")}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={pending !== null} onClick={() => post({ action: "resolve", entryId: row.id, resolution: "release" }, row.id)}>
                          {t("jsonIntegrity.resolveRelease")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>

      </CardContent>
    </Card>
  );
}

function isApplyResult(payload: unknown): payload is { repaired: number; quarantined: number } {
  return typeof payload === "object"
    && payload !== null
    && typeof (payload as { repaired?: unknown }).repaired === "number"
    && typeof (payload as { quarantined?: unknown }).quarantined === "number";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

