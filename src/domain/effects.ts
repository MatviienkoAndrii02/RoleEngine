import type { NodeType } from "@/domain/nodes";

export type EffectCondition =
  | { kind: "always" }
  | { kind: "fieldExists"; nodeId: string }
  | { kind: "slotExists"; slotId: string }
  | { kind: "compare"; nodeId: string; operator: "gt" | "lt" | "eq"; value: EffectSource }
  | { kind: "compareSlot"; slotId: string; operator: "gt" | "lt" | "eq"; value: EffectSource }
  | { kind: "and"; conditions: EffectCondition[] }
  | { kind: "or"; conditions: EffectCondition[] }
  | { kind: "not"; condition: EffectCondition };

export type EffectTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "templateSlot"; slotId: string }
  | { kind: "path"; path: string }
  | { kind: "parent"; parentNodeId: string }
  | { kind: "root" };

export type EffectSource =
  | { kind: "number"; value: number }
  | { kind: "node"; nodeId: string; field?: "value" | "current" | "min" | "max" }
  | { kind: "templateSlot"; slotId: string; field?: "value" | "current" | "min" | "max" }
  | { kind: "formula"; expression: FormulaExpression };

export type FormulaExpression =
  | { kind: "const"; value: number }
  | { kind: "ref"; nodeId: string; field?: "value" | "current" | "min" | "max" }
  | { kind: "slotRef"; slotId: string; field?: "value" | "current" | "min" | "max" }
  | { kind: "add" | "subtract" | "multiply" | "divide"; left: FormulaExpression; right: FormulaExpression };

export type CreateNodePayload = {
  type: NodeType;
  name: string;
  data: Record<string, unknown>;
  children?: CreateNodePayload[];
};

export type EffectOperation =
  | "ADD"
  | "SUBTRACT"
  | "MULTIPLY"
  | "PERCENT_BONUS"
  | "CREATE_NODE"
  | "CREATE_GROUP"
  | "SET_BAR_MAX"
  | "PATCH_NODE_PROPS";

export type EffectDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  operation: EffectOperation;
  priority: number;
  sourceNodeId?: string | null;
  condition: EffectCondition;
  target: EffectTarget;
  source: EffectSource;
  payload?: {
    createNode?: CreateNodePayload;
    patch?: Record<string, unknown>;
    patchFromSource?: { field: string };
    numericField?: string;
  };
};

export type EffectContribution = {
  effectId: string;
  effectName: string;
  sourceNodeId?: string | null;
  referencedNodeIds?: string[];
  targetNodeId: string;
  operation: EffectOperation;
  priority: number;
  field?: string;
  amount: number;
};

export type EffectReferenceDiagnostic = {
  missingNodeIds: string[];
  missingPaths: string[];
};

export function diagnoseEffectReferences(
  effect: EffectDefinition,
  nodes: Array<{ id: string; path: string }>,
): EffectReferenceDiagnostic {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const paths = new Set(nodes.map((node) => node.path));
  const referencedIds = new Set<string>();
  const missingPaths: string[] = [];

  if (effect.target.kind === "node") referencedIds.add(effect.target.nodeId);
  if (effect.target.kind === "parent") referencedIds.add(effect.target.parentNodeId);
  if (effect.target.kind === "path" && !paths.has(effect.target.path)) missingPaths.push(effect.target.path);
  if (effect.sourceNodeId) referencedIds.add(effect.sourceNodeId);
  collectSourceReferences(effect.source, referencedIds);
  collectConditionReferences(effect.condition, referencedIds);

  return {
    missingNodeIds: [...referencedIds].filter((id) => !nodeIds.has(id)),
    missingPaths,
  };
}

function collectSourceReferences(source: EffectSource, result: Set<string>) {
  if (source.kind === "node") result.add(source.nodeId);
  if (source.kind === "formula") collectFormulaReferences(source.expression, result);
}

function collectFormulaReferences(expression: FormulaExpression, result: Set<string>) {
  if (expression.kind === "ref") result.add(expression.nodeId);
  if (expression.kind === "add" || expression.kind === "subtract" || expression.kind === "multiply" || expression.kind === "divide") {
    collectFormulaReferences(expression.left, result);
    collectFormulaReferences(expression.right, result);
  }
}

function collectConditionReferences(condition: EffectCondition, result: Set<string>) {
  if (condition.kind === "fieldExists") result.add(condition.nodeId);
  if (condition.kind === "compare") {
    result.add(condition.nodeId);
    collectSourceReferences(condition.value, result);
  }
  if (condition.kind === "compareSlot") collectSourceReferences(condition.value, result);
  if (condition.kind === "and" || condition.kind === "or") condition.conditions.forEach((child) => collectConditionReferences(child, result));
  if (condition.kind === "not") collectConditionReferences(condition.condition, result);
}
