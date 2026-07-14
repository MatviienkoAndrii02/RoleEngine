import type { NodeType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CharacterNodeModel, NodeData } from "@/domain/nodes";
import type { CreateNodePayload, EffectCondition, EffectDefinition, EffectSource, FormulaExpression, TriggeredEffectAction } from "@/domain/effects";
import { parseNodeData } from "@/domain/validation";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";
import { slugify } from "@/server/template-copy";

const MAX_TRIGGER_PASSES = 10;

type TriggeredContext = {
  nodes: Map<string, CharacterNodeModel>;
};

type PrismaTx = Prisma.TransactionClient;

export async function runTriggeredCharacterEffects(characterId: string, actorId: string) {
  return prisma.$transaction(async (tx) => runTriggeredCharacterEffectsInTransaction(tx, characterId, actorId), {
    timeout: 20_000,
  });
}

export async function runManualTriggeredEffect(effectId: string, actorId: string, clickedNodeId: string) {
  return prisma.$transaction(async (tx) => {
    const effectRecord = await tx.effect.findUniqueOrThrow({ where: { id: effectId } });
    if (!effectRecord.characterId || !effectRecord.enabled || effectRecord.operation !== "TRIGGERED") return { runs: 0, actions: 0 };
    const character = await tx.character.findUniqueOrThrow({ where: { id: effectRecord.characterId }, select: { workspaceId: true } });
    const parsed = parseEffectDefinitions([effectRecord]).effects[0];
    const triggered = parsed?.payload?.triggered;
    if (!triggered || triggered.trigger.kind !== "nodeClick" || triggered.trigger.nodeId !== clickedNodeId) return { runs: 0, actions: 0 };
    const nodes = await loadNodes(tx, effectRecord.characterId);
    const ctx: TriggeredContext = { nodes: new Map(nodes.map((node) => [node.id, node])) };
    if (!evaluateCondition(triggered.trigger.condition, ctx)) return { runs: 0, actions: 0 };
    const result = await applyTriggeredActions(tx, effectRecord.characterId, actorId, character.workspaceId, parsed, triggered.actions, ctx);
    return { runs: result.actions > 0 ? 1 : 0, actions: result.actions };
  }, { timeout: 20_000 });
}

export async function runTriggeredCharacterEffectsInTransaction(tx: PrismaTx, characterId: string, actorId: string) {
  const character = await tx.character.findUniqueOrThrow({ where: { id: characterId }, select: { workspaceId: true } });
  const triggeredEffects = await tx.effect.findMany({
    where: { characterId, enabled: true, operation: "TRIGGERED" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!triggeredEffects.length) return { runs: 0, actions: 0 };

  let runs = 0;
  let actions = 0;
  for (let pass = 0; pass < MAX_TRIGGER_PASSES; pass += 1) {
    const nodes = await loadNodes(tx, characterId);
    const effects = parseEffectDefinitions(triggeredEffects).effects.filter((effect) => effect.operation === "TRIGGERED");
    const ctx: TriggeredContext = { nodes: new Map(nodes.map((node) => [node.id, node])) };
    let changed = false;

    for (const effect of effects) {
      const triggered = effect.payload?.triggered;
      if (triggered?.trigger.kind === "nodeClick") continue;
      if (!triggered || !evaluateCondition(triggered.trigger.condition, ctx)) continue;
      const result = await applyTriggeredActions(tx, characterId, actorId, character.workspaceId, effect, triggered.actions, ctx);
      if (result.actions > 0) {
        runs += 1;
        actions += result.actions;
        changed = true;
      }
    }

    if (!changed) return { runs, actions };
  }

  throw new Error("Triggered effects did not reach a stable state");
}

async function applyTriggeredActions(
  tx: PrismaTx,
  characterId: string,
  actorId: string,
  workspaceId: string,
  effect: EffectDefinition,
  actions: TriggeredEffectAction[],
  ctx: TriggeredContext,
) {
  let applied = 0;
  const changes: Array<Record<string, unknown>> = [];

  for (const action of actions) {
    if (action.kind === "NUMERIC") {
      const target = ctx.nodes.get(action.targetNodeId);
      if (!target) continue;
      const field = action.field ?? defaultNumericField(target);
      const current = readNodeField(target, field);
      const amount = evaluateSource(action.source, ctx);
      if (current == null || amount == null) continue;
      const next = numericResult(current, amount, action.operation);
      if (next == null || sameNumber(current, next)) continue;
      const nextData = writeNodeField(target, field, next);
      const parsedData = parseNodeData(target.type, nextData) as Prisma.InputJsonValue;
      await tx.characterNode.update({ where: { id: target.id }, data: { data: parsedData } });
      ctx.nodes.set(target.id, { ...target, data: nextData });
      applied += 1;
      changes.push({ kind: action.kind, nodeId: target.id, field, operation: action.operation, from: current, to: next });
      continue;
    }

    if (action.kind === "PATCH_NODE_PROPS") {
      const target = ctx.nodes.get(action.targetNodeId);
      if (!target) continue;
      const nextData = { ...target.data, ...action.patch } as NodeData;
      const parsedData = parseNodeData(target.type, nextData) as Prisma.InputJsonValue;
      await tx.characterNode.update({ where: { id: target.id }, data: { data: parsedData } });
      ctx.nodes.set(target.id, { ...target, data: nextData });
      applied += 1;
      changes.push({ kind: action.kind, nodeId: target.id, patch: action.patch });
      continue;
    }

    const parentNodeId = action.parentNodeId ?? null;
    if (parentNodeId && !ctx.nodes.has(parentNodeId)) continue;
    const payload = action.kind === "CREATE_GROUP"
      ? { ...action.createNode, type: "GROUP" as const }
      : action.createNode;
    const created = await createNodeTree(tx, characterId, parentNodeId, payload);
    for (const node of await loadNodes(tx, characterId)) ctx.nodes.set(node.id, node);
    applied += 1;
    changes.push({ kind: action.kind, parentNodeId, nodeId: created.id, name: created.name });
  }

  if (applied > 0) {
    await tx.auditLog.create({
      data: {
        actorId,
        workspaceId,
        characterId,
        entityType: "Effect",
        entityId: effect.id,
        action: "RECALCULATE",
        newValue: { name: effect.name, operation: "TRIGGERED", actions: changes } as Prisma.InputJsonValue,
      },
    });
  }

  return { actions: applied };
}

async function createNodeTree(tx: PrismaTx, characterId: string, parentId: string | null, payload: CreateNodePayload) {
  const type = payload.type as NodeType;
  const name = payload.name.trim();
  const data = parseNodeData(type, payload.data) as Prisma.InputJsonValue;
  const parent = parentId ? await tx.characterNode.findFirstOrThrow({ where: { id: parentId, characterId, archivedAt: null } }) : null;
  const order = await tx.characterNode.count({ where: { characterId, parentId } });
  const slug = slugify(name);
  const path = parent ? `${parent.path}/${slug}` : slug;
  const created = await tx.characterNode.create({ data: { characterId, parentId, type, name, slug, path, order, data } });
  for (const child of payload.children ?? []) {
    await createNodeTree(tx, characterId, created.id, child);
  }
  return created;
}

async function loadNodes(tx: PrismaTx, characterId: string) {
  const records = await tx.characterNode.findMany({ where: { characterId, archivedAt: null }, orderBy: [{ parentId: "asc" }, { order: "asc" }] });
  return parseCharacterNodeModels(records).nodes;
}

function evaluateCondition(condition: EffectCondition, ctx: TriggeredContext): boolean {
  if (condition.kind === "always") return true;
  if (condition.kind === "fieldExists") return ctx.nodes.has(condition.nodeId);
  if (condition.kind === "slotExists") return false;
  if (condition.kind === "and") return condition.conditions.every((child) => evaluateCondition(child, ctx));
  if (condition.kind === "or") return condition.conditions.some((child) => evaluateCondition(child, ctx));
  if (condition.kind === "not") return !evaluateCondition(condition.condition, ctx);
  if (condition.kind === "compare") {
    const nodeValue = readNodeField(ctx.nodes.get(condition.nodeId), undefined);
    const compareValue = evaluateSource(condition.value, ctx);
    if (nodeValue == null || compareValue == null) return false;
    if (condition.operator === "gt") return nodeValue > compareValue;
    if (condition.operator === "lt") return nodeValue < compareValue;
    return nodeValue === compareValue;
  }
  return false;
}

function evaluateSource(source: EffectSource, ctx: TriggeredContext): number | null {
  if (source.kind === "number") return source.value;
  if (source.kind === "node") return readNodeField(ctx.nodes.get(source.nodeId), source.field);
  if (source.kind === "templateSlot") return null;
  return evaluateFormula(source.expression, ctx);
}

function evaluateFormula(expression: FormulaExpression, ctx: TriggeredContext): number | null {
  if (expression.kind === "const") return expression.value;
  if (expression.kind === "ref") return readNodeField(ctx.nodes.get(expression.nodeId), expression.field);
  if (expression.kind === "slotRef") return null;
  const left = evaluateFormula(expression.left, ctx);
  const right = evaluateFormula(expression.right, ctx);
  if (left == null || right == null) return null;
  if (expression.kind === "add") return left + right;
  if (expression.kind === "subtract") return left - right;
  if (expression.kind === "multiply") return left * right;
  return right === 0 ? null : left / right;
}

type NumericField = "value" | "current" | "min" | "max";

function defaultNumericField(node: CharacterNodeModel): NumericField {
  return node.type === "BAR" ? "current" : "value";
}

function readNodeField(node: CharacterNodeModel | undefined, field?: NumericField): number | null {
  if (!node) return null;
  const actualField = field ?? defaultNumericField(node);
  if (node.type === "NUMBER" && actualField === "value" && "value" in node.data) return node.data.value;
  if (node.type === "NUMBER" && actualField === "min" && "min" in node.data) return node.data.min ?? null;
  if (node.type === "NUMBER" && actualField === "max" && "max" in node.data) return node.data.max ?? null;
  if (node.type === "BAR" && actualField === "value" && "current" in node.data) return node.data.current;
  if (node.type === "BAR" && actualField === "current" && "current" in node.data) return node.data.current;
  if (node.type === "BAR" && actualField === "min" && "min" in node.data) return node.data.min ?? null;
  if (node.type === "BAR" && actualField === "max" && "max" in node.data) return node.data.max ?? null;
  return null;
}

function writeNodeField(node: CharacterNodeModel, field: NumericField, value: number): NodeData {
  return { ...node.data, [field === "value" && node.type === "BAR" ? "current" : field]: value } as NodeData;
}

function numericResult(current: number, amount: number, operation: "SET" | "ADD" | "SUBTRACT" | "MULTIPLY") {
  if (operation === "SET") return amount;
  if (operation === "ADD") return current + amount;
  if (operation === "SUBTRACT") return current - amount;
  return current * amount;
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 0.000001;
}
