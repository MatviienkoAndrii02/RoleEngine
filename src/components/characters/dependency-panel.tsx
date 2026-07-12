"use client";

import type { NodeCalculation } from "@/engine/dependency-engine";
import type { DependencyEdgeModel } from "@/engine/dependency-engine";
import type { CharacterNodeModel } from "@/domain/nodes";
import { useI18n } from "@/i18n/client";

export function DependencyPanel({ calculations, nodes, edges = [] }: { calculations: NodeCalculation[]; nodes: CharacterNodeModel[]; edges?: DependencyEdgeModel[] }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
        {edges.length > 0 && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{t("dependencies.graph", { count: edges.length })}</summary><div className="mt-3 space-y-2">{edges.map((edge, index) => <div key={`${edge.sourceNodeId}-${edge.targetNodeId}-${index}`} className="flex items-center gap-2 text-xs text-muted-foreground"><span>{nodes.find((node) => node.id === edge.sourceNodeId)?.name ?? t("common.unknown")}</span><span>-&gt;</span><span>{nodes.find((node) => node.id === edge.targetNodeId)?.name ?? t("common.unknown")}</span><span className="ml-auto">{edge.reason}</span></div>)}</div></details>}
        {calculations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dependencies.empty")}</p>
        ) : (
          calculations.map((calculation) => (
            <div key={`${calculation.nodeId}:${calculation.field}`} className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">{nodes.find((node) => node.id === calculation.nodeId)?.name ?? t("dependencies.nodeFallback", { id: calculation.nodeId.slice(0, 8) })}</div>
              <div className="space-y-1 text-sm">
                {calculation.lines.map((line, index) => (
                  <div key={`${line.label}-${index}`} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className="tabular-nums">{Number.isInteger(line.value) ? line.value : line.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
    </div>
  );
}
