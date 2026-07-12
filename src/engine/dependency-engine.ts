import type { EffectCondition, EffectContribution, EffectDefinition, EffectSource, FormulaExpression } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import { readNumericValue } from "@/domain/nodes";

export type DependencyEdgeModel = {
  sourceNodeId: string;
  targetNodeId: string;
  effectId?: string;
  reason: string;
};

export type CalculationLine = {
  label: string;
  value: number;
  kind: "base" | "flat" | "multiplier" | "result";
};

export type NodeCalculation = {
  nodeId: string;
  field: string;
  base: number;
  flatTotal: number;
  multiplier: number;
  final: number;
  lines: CalculationLine[];
};

export type EngineResult = {
  calculations: Map<string, NodeCalculation>;
  edges: DependencyEdgeModel[];
  cycles: string[][];
  createdNodeRequests: Array<{
    parentNodeId: string | null;
    effectId: string;
    name: string;
    payload: unknown;
  }>;
  patchRequests: Array<{
    targetNodeId: string;
    effectId: string;
    effectName: string;
    patch: Record<string, unknown>;
  }>;
};

type EngineContext = {
  nodes: Map<string, CharacterNodeModel>;
};

export class DependencyEngine {
  private readonly nodes: Map<string, CharacterNodeModel>;
  private readonly effects: EffectDefinition[];

  constructor(nodes: CharacterNodeModel[], effects: EffectDefinition[]) {
    this.nodes = new Map(nodes.map((node) => [node.id, node]));
    this.effects = effects.filter((effect) => effect.enabled).sort((a, b) => a.priority - b.priority);
  }

  evaluate(changedNodeIds?: string[]): EngineResult {
    const edges = this.buildEdges();
    const cycles = detectCycles(edges);
    if (cycles.length > 0) {
      return { calculations: new Map(), edges, cycles, createdNodeRequests: [], patchRequests: [] };
    }

    const affected = changedNodeIds?.length ? collectAffected(changedNodeIds, edges) : new Set(this.nodes.keys());
    const contributions = this.collectContributions(edges, affected);
    const calculations = this.calculateNumbers(contributions, affected);
    const createdNodeRequests = this.collectCreateRequests(affected);
    const patchRequests = this.collectPatchRequests(affected);

    return { calculations, edges, cycles, createdNodeRequests, patchRequests };
  }

  private buildEdges(): DependencyEdgeModel[] {
    const edges: DependencyEdgeModel[] = [];

    for (const effect of this.effects) {
      const targetId = this.resolveTargetId(effect.target);
      if (!targetId) continue;

      for (const sourceNodeId of collectSourceNodeIds(effect.source)) {
        edges.push({
          sourceNodeId,
          targetNodeId: targetId,
          effectId: effect.id,
          reason: `source:${effect.name}`
        });
      }

      for (const sourceNodeId of collectConditionNodeIds(effect.condition)) {
        edges.push({
          sourceNodeId,
          targetNodeId: targetId,
          effectId: effect.id,
          reason: `condition:${effect.name}`
        });
      }

      if (effect.sourceNodeId) {
        edges.push({
          sourceNodeId: effect.sourceNodeId,
          targetNodeId: targetId,
          effectId: effect.id,
          reason: `owner:${effect.name}`
        });
      }
    }

    return uniqueEdges(edges);
  }

  private collectContributions(edges: DependencyEdgeModel[], affected: Set<string>): EffectContribution[] {
    const ctx = { nodes: this.nodes };
    const contributions: EffectContribution[] = [];

    for (const effect of this.effects) {
      const targetNodeId = this.resolveTargetId(effect.target);
      if (!targetNodeId || !affected.has(targetNodeId) || !evaluateCondition(effect.condition, ctx)) continue;

      if (!["ADD", "SUBTRACT", "MULTIPLY", "PERCENT_BONUS", "SET_BAR_MAX"].includes(effect.operation)) continue;

      const amount = evaluateSource(effect.source, ctx);
      if (amount == null) continue;

      contributions.push({
        effectId: effect.id,
        effectName: effect.name,
        sourceNodeId: effect.sourceNodeId,
        targetNodeId,
        operation: effect.operation,
        priority: effect.priority,
        amount,
        field: numericTargetField(effect),
      });
    }

    for (const edge of edges) affected.add(edge.targetNodeId);
    return contributions;
  }

  private calculateNumbers(contributions: EffectContribution[], affected: Set<string>): Map<string, NodeCalculation> {
    const byTarget = new Map<string, EffectContribution[]>();
    const result = new Map<string, NodeCalculation>();

    for (const contribution of contributions) {
      const key = calculationKey(contribution.targetNodeId, contribution.field ?? "value");
      const list = byTarget.get(key) ?? [];
      list.push(contribution);
      byTarget.set(key, list);
    }

    const targetKeys = new Set<string>();
    for (const nodeId of affected) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      targetKeys.add(calculationKey(nodeId, defaultNumericField(node)));
    }
    for (const key of byTarget.keys()) targetKeys.add(key);

    for (const key of targetKeys) {
      const parsed = parseCalculationKey(key);
      const nodeId = parsed.nodeId;
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      const field = parsed.field ?? defaultNumericField(node);

      const base = readNodeField(node, field as NumericField);
      if (base == null) continue;

      const lines: CalculationLine[] = [{ label: "Base", value: base, kind: "base" }];
      let current = base;
      let multiplier = 1;
      const orderedContributions = [...(byTarget.get(key) ?? [])].sort(compareContributions);

      for (const contribution of orderedContributions) {
        if (contribution.operation === "SET_BAR_MAX") {
          current = contribution.amount;
          lines.push({ label: contribution.effectName, value: contribution.amount, kind: "flat" });
        }
        if (contribution.operation === "ADD") {
          current += contribution.amount;
          lines.push({ label: contribution.effectName, value: contribution.amount, kind: "flat" });
        }
        if (contribution.operation === "SUBTRACT") {
          current -= contribution.amount;
          lines.push({ label: contribution.effectName, value: -contribution.amount, kind: "flat" });
        }
        if (contribution.operation === "MULTIPLY") {
          current *= contribution.amount;
          multiplier *= contribution.amount;
          lines.push({ label: contribution.effectName, value: contribution.amount, kind: "multiplier" });
        }
        if (contribution.operation === "PERCENT_BONUS") {
          const percentMultiplier = 1 + contribution.amount / 100;
          current *= percentMultiplier;
          multiplier *= percentMultiplier;
          lines.push({ label: contribution.effectName, value: percentMultiplier, kind: "multiplier" });
        }
      }

      const final = current;
      const flatTotal = final - base;
      lines.push({ label: "Result", value: final, kind: "result" });
      result.set(key, { nodeId, field, base, flatTotal, multiplier, final, lines });
    }

    return result;
  }

  private collectCreateRequests(affected: Set<string>) {
    const requests: EngineResult["createdNodeRequests"] = [];
    const ctx = { nodes: this.nodes };

    for (const effect of this.effects) {
      if (!["CREATE_NODE", "CREATE_GROUP"].includes(effect.operation) || !evaluateCondition(effect.condition, ctx)) continue;
      const targetNodeId = effect.target.kind === "root" ? null : this.resolveTargetId(effect.target);
      if (effect.target.kind !== "root" && (!targetNodeId || !affected.has(targetNodeId))) continue;
      const createNode = effect.payload?.createNode;
      if (!createNode) continue;
      requests.push({
        parentNodeId: targetNodeId,
        effectId: effect.id,
        name: createNode.name,
        payload: createNode
      });
    }

    return requests;
  }

  private collectPatchRequests(affected: Set<string>): EngineResult["patchRequests"] {
    const requests: EngineResult["patchRequests"] = [];
    const ctx = { nodes: this.nodes };
    for (const effect of this.effects) {
      if (effect.operation !== "PATCH_NODE_PROPS" || !evaluateCondition(effect.condition, ctx)) continue;
      const targetNodeId = this.resolveTargetId(effect.target);
      if (!targetNodeId || !affected.has(targetNodeId) || !effect.payload?.patch) continue;
      const patch = { ...effect.payload.patch };
      if (effect.payload.patchFromSource?.field) {
        const amount = evaluateSource(effect.source, ctx);
        if (amount == null) continue;
        patch[effect.payload.patchFromSource.field] = amount;
      }
      requests.push({ targetNodeId, effectId: effect.id, effectName: effect.name, patch });
    }
    return requests;
  }

  private resolveTargetId(target: EffectDefinition["target"]): string | null {
    if (target.kind === "node") return this.nodes.has(target.nodeId) ? target.nodeId : null;
    if (target.kind === "path") {
      for (const node of this.nodes.values()) {
        if (node.path === target.path) return node.id;
      }
    }
    if (target.kind === "parent") return this.nodes.has(target.parentNodeId) ? target.parentNodeId : null;
    if (target.kind === "root") return null;
    return null;
  }
}

function evaluateCondition(condition: EffectCondition, ctx: EngineContext): boolean {
  if (condition.kind === "always") return true;
  if (condition.kind === "fieldExists") return ctx.nodes.has(condition.nodeId);
  if (condition.kind === "and") return condition.conditions.every((child) => evaluateCondition(child, ctx));
  if (condition.kind === "or") return condition.conditions.some((child) => evaluateCondition(child, ctx));
  if (condition.kind === "not") return !evaluateCondition(condition.condition, ctx);
  if (condition.kind === "compare") {
    const nodeValue = readNumericValue(ctx.nodes.get(condition.nodeId));
    const compareValue = evaluateSource(condition.value, ctx);
    if (nodeValue == null || compareValue == null) return false;
    if (condition.operator === "gt") return nodeValue > compareValue;
    if (condition.operator === "lt") return nodeValue < compareValue;
    return nodeValue === compareValue;
  }
  return false;
}

function evaluateSource(source: EffectSource, ctx: EngineContext): number | null {
  if (source.kind === "number") return source.value;
  if (source.kind === "node") return readNodeField(ctx.nodes.get(source.nodeId), source.field);
  return evaluateFormula(source.expression, ctx);
}

function evaluateFormula(expression: FormulaExpression, ctx: EngineContext): number | null {
  if (expression.kind === "const") return expression.value;
  if (expression.kind === "ref") return readNodeField(ctx.nodes.get(expression.nodeId), expression.field);

  const left = evaluateFormula(expression.left, ctx);
  const right = evaluateFormula(expression.right, ctx);
  if (left == null || right == null) return null;
  if (expression.kind === "add") return left + right;
  if (expression.kind === "subtract") return left - right;
  if (expression.kind === "multiply") return left * right;
  return right === 0 ? null : left / right;
}

type NumericField = "value" | "current" | "min" | "max";

function readNodeField(node: CharacterNodeModel | undefined, field?: NumericField): number | null {
  if (!node) return null;
  if (!field || field === "value") return readNumericValue(node);
  if (node.type === "NUMBER" && "min" in node.data && field === "min") return node.data.min ?? null;
  if (node.type === "NUMBER" && "max" in node.data && field === "max") return node.data.max ?? null;
  if (node.type === "BAR" && "current" in node.data && field === "current") return node.data.current ?? null;
  if (node.type === "BAR" && "min" in node.data && field === "min") return node.data.min ?? null;
  if (node.type === "BAR" && "max" in node.data && field === "max") return node.data.max ?? null;
  return null;
}

function defaultNumericField(node: CharacterNodeModel): NumericField {
  if (node.type === "BAR") return "current";
  return "value";
}

function numericTargetField(effect: EffectDefinition): NumericField {
  const field = effect.payload?.numericField;
  if (field === "value" || field === "current" || field === "min" || field === "max") return field;
  if (effect.operation === "SET_BAR_MAX") return "max";
  return "value";
}

function compareContributions(a: EffectContribution, b: EffectContribution) {
  const priority = a.priority - b.priority;
  if (priority !== 0) return priority;
  return operationPriority(a.operation) - operationPriority(b.operation);
}

function operationPriority(operation: EffectDefinition["operation"]) {
  if (operation === "SET_BAR_MAX") return 0;
  if (operation === "ADD" || operation === "SUBTRACT") return 1;
  if (operation === "MULTIPLY" || operation === "PERCENT_BONUS") return 2;
  return 3;
}

function calculationKey(nodeId: string, field: string) {
  return field === "value" || field === "current" ? nodeId : `${nodeId}:${field}`;
}

function parseCalculationKey(key: string): { nodeId: string; field: string | null } {
  const separator = key.lastIndexOf(":");
  if (separator === -1) return { nodeId: key, field: null };
  return { nodeId: key.slice(0, separator), field: key.slice(separator + 1) };
}

function collectSourceNodeIds(source: EffectSource): string[] {
  if (source.kind === "node") return [source.nodeId];
  if (source.kind === "formula") return collectFormulaNodeIds(source.expression);
  return [];
}

function collectFormulaNodeIds(expression: FormulaExpression): string[] {
  if (expression.kind === "ref") return [expression.nodeId];
  if (expression.kind === "const") return [];
  return [...collectFormulaNodeIds(expression.left), ...collectFormulaNodeIds(expression.right)];
}

function collectConditionNodeIds(condition: EffectCondition): string[] {
  if (condition.kind === "fieldExists") return [condition.nodeId];
  if (condition.kind === "compare") return [condition.nodeId, ...collectSourceNodeIds(condition.value)];
  if (condition.kind === "and" || condition.kind === "or") return condition.conditions.flatMap(collectConditionNodeIds);
  if (condition.kind === "not") return collectConditionNodeIds(condition.condition);
  return [];
}

function uniqueEdges(edges: DependencyEdgeModel[]): DependencyEdgeModel[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.sourceNodeId}:${edge.targetNodeId}:${edge.effectId}:${edge.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectCycles(edges: DependencyEdgeModel[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    graph.set(edge.sourceNodeId, [...(graph.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      cycles.push([...stack.slice(start), nodeId]);
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const next of graph.get(nodeId) ?? []) visit(next);
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of graph.keys()) visit(nodeId);
  return cycles;
}

function collectAffected(changedNodeIds: string[], edges: DependencyEdgeModel[]): Set<string> {
  const affected = new Set(changedNodeIds);
  const queue = [...changedNodeIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.sourceNodeId !== current || affected.has(edge.targetNodeId)) continue;
      affected.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }

  return affected;
}
