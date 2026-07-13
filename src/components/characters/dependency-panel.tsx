"use client";

import type { NodeCalculation } from "@/engine/dependency-engine";
import type { DependencyEdgeModel } from "@/engine/dependency-engine";
import type { CharacterNodeModel } from "@/domain/nodes";
import { useI18n } from "@/i18n/client";

export function DependencyPanel({ calculations, nodes, edges = [] }: { calculations: NodeCalculation[]; nodes: CharacterNodeModel[]; edges?: DependencyEdgeModel[] }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
        {edges.length > 0 && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{t("dependencies.graph", { count: edges.length })}</summary><div className="mt-3 space-y-2">{edges.map((edge, index) => <div key={`${edge.sourceNodeId}-${edge.targetNodeId}-${index}`} className="flex items-center gap-2 text-xs text-muted-foreground"><span>{nodeName(edge.sourceNodeId, nodes, t)}</span><span>-&gt;</span><span>{nodeName(edge.targetNodeId, nodes, t)}</span><span className="ml-auto">{edge.reason}</span></div>)}</div></details>}
        {calculations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dependencies.empty")}</p>
        ) : (
          calculations.map((calculation) => (
            <div key={`${calculation.nodeId}:${calculation.field}`} className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                <span>{nodes.find((node) => node.id === calculation.nodeId)?.name ?? t("dependencies.nodeFallback", { id: calculation.nodeId.slice(0, 8) })}</span>
                {calculation.field !== "value" && calculation.field !== "current" && <span className="rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{calculation.field}</span>}
              </div>
              <div className="space-y-2 text-sm">
                {calculation.lines.map((line, index) => (
                  <div key={`${line.label}-${index}`} className="grid gap-1 rounded-sm border border-transparent py-1 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{lineLabel(line, t)}</span>
                        {line.operation && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{operationDisplay(line)}</span>}
                      </div>
                      {line.referencedNodeIds && line.referencedNodeIds.length > 0 && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t("dependencies.references", { refs: line.referencedNodeIds.map((nodeId) => nodeName(nodeId, nodes, t)).join(", ") })}
                        </div>
                      )}
                    </div>
                    <span className="text-right tabular-nums">{formatNumber(line.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
    </div>
  );
}

function lineLabel(line: NodeCalculation["lines"][number], t: ReturnType<typeof useI18n>["t"]) {
  if (line.kind === "base") return t("dependencies.base");
  if (line.kind === "result") return t("dependencies.result");
  return line.label;
}

function operationDisplay(line: NodeCalculation["lines"][number]) {
  const amount = line.amount ?? line.value;
  if (line.operation === "SET_BAR_MAX") return `= ${formatNumber(amount)}`;
  if (line.operation === "ADD") return `+ ${formatNumber(amount)}`;
  if (line.operation === "SUBTRACT") return `- ${formatNumber(amount)}`;
  if (line.operation === "MULTIPLY") return `× ${formatNumber(amount)}`;
  if (line.operation === "PERCENT_BONUS") return `+${formatNumber(amount)}% (× ${formatNumber(line.value)})`;
  return formatNumber(line.value);
}

function nodeName(nodeId: string, nodes: CharacterNodeModel[], t: ReturnType<typeof useI18n>["t"]) {
  return nodes.find((node) => node.id === nodeId)?.name ?? t("dependencies.hiddenNode");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
