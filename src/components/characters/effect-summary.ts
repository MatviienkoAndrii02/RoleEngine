import type { EffectCondition, EffectDefinition, EffectSource, FormulaExpression, TriggeredEffectAction } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import type { TranslationKey } from "@/i18n/translations";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function nodeSummary(nodes: CharacterNodeModel[], value: string, slots: TemplateSlotModel[] = [], rootLabel?: string) {
  if (value === "__ROOT__") return rootLabel ?? "";
  if (value.startsWith("slot:")) {
    const slot = slots.find((candidate) => candidate.id === value.slice("slot:".length));
    return slot?.label ?? value;
  }
  return breadcrumb(nodes.find((node) => node.id === value) ?? null, nodes) || value;
}

export function targetSummary(effect: EffectDefinition, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], rootLabel: string) {
  const target = effect.target;
  if (target.kind === "root") return rootLabel;
  if (target.kind === "templateSlot") return slots.find((slot) => slot.id === target.slotId)?.label ?? target.slotId;
  if (target.kind === "parent") return nodeSummary(nodes, target.parentNodeId, slots, rootLabel);
  if (target.kind === "path") return target.path;
  return nodeSummary(nodes, target.nodeId, slots, rootLabel);
}

export function sourceSummary(source: EffectSource, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: Translator) {
  if (source.kind === "number") return formatNumber(source.value);
  if (source.kind === "node") return fieldReference(nodeSummary(nodes, source.nodeId, slots), source.field, t);
  if (source.kind === "templateSlot") {
    const slot = slots.find((candidate) => candidate.id === source.slotId);
    return fieldReference(slot?.label ?? source.slotId, source.field, t);
  }
  return formulaSummary(source.expression, nodes, slots, t);
}

export function formulaSummary(expression: FormulaExpression, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: Translator): string {
  if (expression.kind === "const") return formatNumber(expression.value);
  if (expression.kind === "ref") return fieldReference(nodeSummary(nodes, expression.nodeId, slots), expression.field, t);
  if (expression.kind === "slotRef") {
    const slot = slots.find((candidate) => candidate.id === expression.slotId);
    return fieldReference(slot?.label ?? expression.slotId, expression.field, t);
  }
  return `${formulaSummary(expression.left, nodes, slots, t)} ${formulaOperator(expression.kind)} ${formulaSummary(expression.right, nodes, slots, t)}`;
}

export function conditionExpressionSummary(condition: EffectCondition, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: Translator): string {
  if (condition.kind === "always") return t("effect.conditionAlways");
  if (condition.kind === "fieldExists") return t("effect.conditionExistsPrefix", { name: nodeSummary(nodes, condition.nodeId, slots) });
  if (condition.kind === "slotExists") {
    const slot = slots.find((candidate) => candidate.id === condition.slotId);
    return t("effect.conditionExistsPrefix", { name: slot?.label ?? condition.slotId });
  }
  if (condition.kind === "compare") {
    return `${nodeSummary(nodes, condition.nodeId, slots)} ${conditionOperator(condition.operator)} ${sourceSummary(condition.value, nodes, slots, t)}`;
  }
  if (condition.kind === "compareSlot") {
    const slot = slots.find((candidate) => candidate.id === condition.slotId);
    return `${slot?.label ?? condition.slotId} ${conditionOperator(condition.operator)} ${sourceSummary(condition.value, nodes, slots, t)}`;
  }
  if (condition.kind === "not") return `NOT (${conditionExpressionSummary(condition.condition, nodes, slots, t)})`;
  const joiner = condition.kind === "and" ? " AND " : " OR ";
  return condition.conditions.map((child) => conditionExpressionSummary(child, nodes, slots, t)).join(joiner);
}

export function numericEffectSummary(operation: EffectDefinition["operation"], target: string, field: string, source: string, t: Translator) {
  const fieldSuffix = field ? `.${fieldLabel(field, t)}` : "";
  if (operation === "ADD") return `${target}${fieldSuffix} + ${source}`;
  if (operation === "SUBTRACT") return `${target}${fieldSuffix} - ${source}`;
  if (operation === "MULTIPLY") return `${target}${fieldSuffix} x ${source}`;
  if (operation === "PERCENT_BONUS") return `${target}${fieldSuffix} + ${source}%`;
  if (operation === "SET_BAR_MAX") return `${target}${fieldSuffix} = ${source}`;
  return target;
}

export function triggeredActionSummary(action: TriggeredEffectAction, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: Translator, rootLabel: string) {
  if (action.kind === "NUMERIC") {
    return numericActionSummary(action.operation, nodeSummary(nodes, action.targetNodeId, slots), action.field ?? "value", sourceSummary(action.source, nodes, slots, t), t);
  }
  if (action.kind === "PATCH_NODE_PROPS") {
    const field = Object.keys(action.patch)[0] ?? "";
    return `${nodeSummary(nodes, action.targetNodeId, slots)}.${fieldLabel(field, t)} = ${patchValueSummary(action.patch[field])}`;
  }
  const parent = action.parentNodeId ? nodeSummary(nodes, action.parentNodeId, slots) : rootLabel;
  return `${action.kind === "CREATE_GROUP" ? t("effect.createGroup") : t("effect.createNode")}: ${action.createNode.name || action.createNode.type} -> ${parent}`;
}

export function numericActionSummary(operation: "SET" | "ADD" | "SUBTRACT" | "MULTIPLY", target: string, field: string, source: string, t: Translator) {
  const left = `${target}.${fieldLabel(field, t)}`;
  if (operation === "SET") return `${left} = ${source}`;
  if (operation === "ADD") return `${left} + ${source}`;
  if (operation === "SUBTRACT") return `${left} - ${source}`;
  return `${left} x ${source}`;
}

export function fieldLabel(field: string | undefined, t: Translator) {
  if (field === "min") return t("node.minimum");
  if (field === "max") return t("node.maximum");
  if (field && field !== "value" && field !== "current") return field;
  return t("common.value");
}

function fieldReference(label: string, field: string | undefined, t: Translator) {
  return field && field !== "value" && field !== "current" ? `${label}.${fieldLabel(String(field), t)}` : label;
}

function breadcrumb(node: CharacterNodeModel | null, nodes: CharacterNodeModel[]) {
  if (!node) return "";
  const names = [node.name];
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

function formulaOperator(kind: Extract<FormulaExpression["kind"], "add" | "subtract" | "multiply" | "divide">) {
  if (kind === "add") return "+";
  if (kind === "subtract") return "-";
  if (kind === "multiply") return "x";
  return "/";
}

function conditionOperator(operator: "gt" | "lt" | "eq") {
  if (operator === "gt") return ">";
  if (operator === "lt") return "<";
  return "=";
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function patchValueSummary(value: unknown) {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value || "empty";
  return "...";
}
