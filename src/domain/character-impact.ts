import type { DependencyEdgeModel, NodeCalculation } from "@/engine/dependency-engine";
import type { CharacterNodeModel } from "@/domain/nodes";

export type CharacterImpactSnapshot = {
  nodes: Array<{
    id: string;
    name: string;
    type: CharacterNodeModel["type"];
    parentId: string | null;
    generatedByEffectId?: string;
    values: Array<{ field: string; value: number }>;
  }>;
  edges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    effectId?: string;
    reason: string;
  }>;
};

export type CharacterImpactReport = {
  label: string;
  valueChanges: Array<{
    nodeId: string;
    nodeName: string;
    field: string;
    before: number;
    after: number;
  }>;
  addedNodes: Array<{ id: string; name: string; type: CharacterNodeModel["type"]; generated: boolean }>;
  removedNodes: Array<{ id: string; name: string; type: CharacterNodeModel["type"]; generated: boolean }>;
  addedEdges: number;
  removedEdges: number;
};

export function buildImpactSnapshot(
  nodes: CharacterNodeModel[],
  calculations: NodeCalculation[],
  edges: DependencyEdgeModel[],
): CharacterImpactSnapshot {
  const calculationValues = new Map<string, number>();
  for (const calculation of calculations) {
    calculationValues.set(valueKey(calculation.nodeId, calculation.field), calculation.final);
  }

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
      generatedByEffectId: readGeneratedByEffectId(node),
      values: numericFields(node).map((field) => ({
        field,
        value: calculationValues.get(valueKey(node.id, normalizeField(node, field))) ?? readNumericField(node, field) ?? 0,
      })),
    })),
    edges: edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      effectId: edge.effectId,
      reason: edge.reason,
    })),
  };
}

export function compareImpactSnapshots(label: string, before: CharacterImpactSnapshot, after: CharacterImpactSnapshot): CharacterImpactReport {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const valueChanges: CharacterImpactReport["valueChanges"] = [];

  for (const afterNode of after.nodes) {
    const beforeNode = beforeNodes.get(afterNode.id);
    if (!beforeNode) continue;
    const beforeValues = new Map(beforeNode.values.map((item) => [item.field, item.value]));
    for (const afterValue of afterNode.values) {
      const beforeValue = beforeValues.get(afterValue.field);
      if (beforeValue == null || sameNumber(beforeValue, afterValue.value)) continue;
      valueChanges.push({
        nodeId: afterNode.id,
        nodeName: afterNode.name,
        field: afterValue.field,
        before: beforeValue,
        after: afterValue.value,
      });
    }
  }

  const addedNodes = after.nodes
    .filter((node) => !beforeNodes.has(node.id))
    .map((node) => ({ id: node.id, name: node.name, type: node.type, generated: Boolean(node.generatedByEffectId) }));
  const removedNodes = before.nodes
    .filter((node) => !afterNodes.has(node.id))
    .map((node) => ({ id: node.id, name: node.name, type: node.type, generated: Boolean(node.generatedByEffectId) }));

  const beforeEdges = new Set(before.edges.map(edgeKey));
  const afterEdges = new Set(after.edges.map(edgeKey));

  return {
    label,
    valueChanges,
    addedNodes,
    removedNodes,
    addedEdges: after.edges.filter((edge) => !beforeEdges.has(edgeKey(edge))).length,
    removedEdges: before.edges.filter((edge) => !afterEdges.has(edgeKey(edge))).length,
  };
}

export function hasImpact(report: CharacterImpactReport) {
  return report.valueChanges.length > 0 || report.addedNodes.length > 0 || report.removedNodes.length > 0 || report.addedEdges > 0 || report.removedEdges > 0;
}

function numericFields(node: CharacterNodeModel) {
  if (node.type === "NUMBER") return ["value"];
  if (node.type === "BAR") return ["current", "min", "max"];
  return [];
}

function normalizeField(node: CharacterNodeModel, field: string) {
  return node.type === "BAR" && field === "current" ? "value" : field;
}

function readNumericField(node: CharacterNodeModel, field: string) {
  const value = (node.data as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

function readGeneratedByEffectId(node: CharacterNodeModel) {
  const value = node.computed?.generatedByEffectId;
  return typeof value === "string" ? value : undefined;
}

function valueKey(nodeId: string, field: string) {
  return `${nodeId}:${field}`;
}

function edgeKey(edge: CharacterImpactSnapshot["edges"][number]) {
  return [edge.sourceNodeId, edge.targetNodeId, edge.effectId ?? "", edge.reason].join(":");
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 0.000001;
}
