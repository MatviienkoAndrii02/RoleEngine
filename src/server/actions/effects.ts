"use server";

import type { Effect, EffectOperation, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCharacterGM, requireGM, requireTemplateGM } from "@/server/authz";
import { DependencyEngine } from "@/engine/dependency-engine";
import type { EffectCondition, EffectDefinition, EffectSource } from "@/domain/effects";
import type { CreateNodePayload } from "@/domain/effects";
import { reconcileStructuralEffects } from "@/server/structural-effects";
import { parseCharacterNodeModels, parseEffectDefinitions, parseTemplateNodeModels } from "@/server/read-models";

const numericOperations: EffectOperation[] = ["ADD", "SUBTRACT", "MULTIPLY", "PERCENT_BONUS", "SET_BAR_MAX"];

export async function createNumericEffect(input: { characterId: string; name: string; operation: EffectOperation; targetNodeId: string; numericField?: string; source: EffectSource; condition: EffectCondition }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  if (!numericOperations.includes(input.operation)) throw new Error("Unsupported numeric operation");
  const name = input.name.trim();
  if (!name) throw new Error("Effect name is required");
  const [nodes, effects] = await Promise.all([
    prisma.characterNode.findMany({ where: { characterId: input.characterId, archivedAt: null } }),
    prisma.effect.findMany({ where: { characterId: input.characterId, enabled: true } })
  ]);
  const target = nodes.find((node) => node.id === input.targetNodeId);
  if (!target || !["NUMBER", "BAR"].includes(target.type)) throw new Error("Numeric target is required");
  const candidate = { id: "candidate", name, enabled: true, operation: input.operation, priority: effects.length, condition: input.condition, target: { kind: "node", nodeId: input.targetNodeId }, source: input.source, payload: input.numericField ? { numericField: input.numericField } : {} } as EffectDefinition;
  const parsedNodes = parseCharacterNodeModels(nodes).nodes;
  const parsedEffects = parseEffectDefinitions(effects).effects;
  const check = new DependencyEngine(parsedNodes, [...parsedEffects, candidate]).evaluate();
  if (check.cycles.length) throw new Error("Effect creates a dependency cycle");
  const effect = await prisma.effect.create({ data: { name, operation: input.operation, priority: effects.length, characterId: input.characterId, condition: input.condition as Prisma.InputJsonValue, target: candidate.target as Prisma.InputJsonValue, source: input.source as Prisma.InputJsonValue, payload: candidate.payload as Prisma.InputJsonValue } });
  await syncGraph(input.characterId);
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId: character.workspaceId, characterId: input.characterId, entityType: "Effect", entityId: effect.id, action: "CREATE", newValue: { name, operation: input.operation, targetNodeId: input.targetNodeId } } });
  revalidatePath(`/characters/${input.characterId}`);
  return effect;
}

export async function createStructuralEffect(input: { characterId: string; name: string; operation: "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS"; targetNodeId?: string | null; source?: EffectSource; condition: EffectCondition; createNode?: CreateNodePayload; patch?: Record<string, unknown>; patchFromSource?: { field: string } }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const target = input.targetNodeId
    ? await prisma.characterNode.findFirstOrThrow({ where: { id: input.targetNodeId, characterId: input.characterId, archivedAt: null } })
    : null;
  if (input.operation === "PATCH_NODE_PROPS" && !target) throw new Error("Patch target is required");
  if ((input.operation === "CREATE_NODE" || input.operation === "CREATE_GROUP") && target && !["CONTAINER", "GROUP"].includes(target.type)) throw new Error("Structural nodes can only be created at the character root or inside Container or Group");
  const count = await prisma.effect.count({ where: { characterId: input.characterId } });
  const payload = input.operation === "PATCH_NODE_PROPS" ? { patch: input.patch ?? {}, ...(input.patchFromSource ? { patchFromSource: input.patchFromSource } : {}) } : { createNode: input.createNode };
  const effectTarget = target
    ? { kind: "node", nodeId: target.id }
    : { kind: "root" };
  const effect = await prisma.effect.create({ data: { name: input.name.trim(), operation: input.operation, priority: count, characterId: input.characterId, condition: input.condition as Prisma.InputJsonValue, target: effectTarget, source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue, payload: payload as Prisma.InputJsonValue } });
  try { await reconcileStructuralEffects(input.characterId); } catch (error) { await prisma.effect.delete({ where: { id: effect.id } }); throw error; }
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId: character.workspaceId, characterId: input.characterId, entityType: "Effect", entityId: effect.id, action: "CREATE", newValue: { name: effect.name, operation: effect.operation } } });
  revalidatePath(`/characters/${input.characterId}`);
  return effect;
}

export async function createTemplateNumericEffect(input: { templateId: string; name: string; operation: EffectOperation; targetNodeId: string; numericField?: string; source: EffectSource; condition: EffectCondition }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  if (!numericOperations.includes(input.operation)) throw new Error("Unsupported numeric operation");
  const name = input.name.trim();
  if (!name) throw new Error("Effect name is required");
  const [nodes, effects] = await Promise.all([
    prisma.templateNode.findMany({ where: { templateId: input.templateId } }),
    prisma.effect.findMany({ where: { templateId: input.templateId, enabled: true } })
  ]);
  const target = nodes.find((node) => node.id === input.targetNodeId);
  if (!target || !["NUMBER", "BAR"].includes(target.type)) throw new Error("Numeric target is required");
  const candidate = { id: "candidate", name, enabled: true, operation: input.operation, priority: effects.length, condition: input.condition, target: { kind: "node", nodeId: input.targetNodeId }, source: input.source, payload: input.numericField ? { numericField: input.numericField } : {} } as EffectDefinition;
  const parsedNodes = parseTemplateNodeModels(nodes).nodes;
  const parsedEffects = parseEffectDefinitions(effects).effects;
  const check = new DependencyEngine(parsedNodes, [...parsedEffects, candidate]).evaluate();
  if (check.cycles.length) throw new Error("Effect creates a dependency cycle");
  const effect = await prisma.effect.create({ data: { name, operation: input.operation, priority: effects.length, templateId: input.templateId, condition: input.condition as Prisma.InputJsonValue, target: candidate.target as Prisma.InputJsonValue, source: input.source as Prisma.InputJsonValue, payload: candidate.payload as Prisma.InputJsonValue } });
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId: template.workspaceId, entityType: "Effect", entityId: effect.id, action: "CREATE", newValue: { templateId: input.templateId, name, operation: input.operation, targetNodeId: input.targetNodeId } } });
  revalidatePath(`/templates/${input.templateId}`);
  return effect;
}

export async function createTemplateStructuralEffect(input: { templateId: string; name: string; operation: "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS"; targetNodeId?: string | null; source?: EffectSource; condition: EffectCondition; createNode?: CreateNodePayload; patch?: Record<string, unknown>; patchFromSource?: { field: string } }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const target = input.targetNodeId
    ? await prisma.templateNode.findFirstOrThrow({ where: { id: input.targetNodeId, templateId: input.templateId } })
    : null;
  if (input.operation === "PATCH_NODE_PROPS" && !target) throw new Error("Patch target is required");
  if ((input.operation === "CREATE_NODE" || input.operation === "CREATE_GROUP") && target && !["CONTAINER", "GROUP"].includes(target.type)) throw new Error("Structural nodes can only be created at the template root or inside Container or Group");
  const count = await prisma.effect.count({ where: { templateId: input.templateId } });
  const payload = input.operation === "PATCH_NODE_PROPS" ? { patch: input.patch ?? {}, ...(input.patchFromSource ? { patchFromSource: input.patchFromSource } : {}) } : { createNode: input.createNode };
  const effectTarget = target ? { kind: "node", nodeId: target.id } : { kind: "root" };
  const effect = await prisma.effect.create({ data: { name: input.name.trim(), operation: input.operation, priority: count, templateId: input.templateId, condition: input.condition as Prisma.InputJsonValue, target: effectTarget, source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue, payload: payload as Prisma.InputJsonValue } });
  try { await validateTemplateEffectGraph(input.templateId); } catch (error) { await prisma.effect.delete({ where: { id: effect.id } }); throw error; }
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId: template.workspaceId, entityType: "Effect", entityId: effect.id, action: "CREATE", newValue: { templateId: input.templateId, name: effect.name, operation: effect.operation } } });
  revalidatePath(`/templates/${input.templateId}`);
  return effect;
}

export async function deleteEffect(effectId: string) {
  const actor = await requireGM();
  const effect = await prisma.effect.findUniqueOrThrow({ where: { id: effectId } });
  const workspaceId = await requireEffectWritableWorkspace(effect);
  await prisma.effect.delete({ where: { id: effectId } });
  if (effect.characterId) await reconcileStructuralEffects(effect.characterId);
  if (effect.characterId) await syncGraph(effect.characterId);
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId, characterId: effect.characterId, entityType: "Effect", entityId: effect.id, action: "DELETE", oldValue: { name: effect.name, operation: effect.operation } } });
  if (effect.characterId) revalidatePath(`/characters/${effect.characterId}`);
  if (effect.templateId) revalidatePath(`/templates/${effect.templateId}`);
}

export async function updateEffect(effectId: string, input: {
  name?: string;
  enabled?: boolean;
  priority?: number;
  operation?: EffectOperation;
  targetNodeId?: string | null;
  numericField?: string;
  source?: EffectSource;
  condition?: EffectCondition;
  createNode?: CreateNodePayload;
  patch?: Record<string, unknown>;
  patchFromSource?: { field: string };
}) {
  const actor = await requireGM();
  const current = await prisma.effect.findUniqueOrThrow({ where: { id: effectId } });
  const workspaceId = await requireEffectWritableWorkspace(current);
  if (!current.characterId && !current.templateId) throw new Error("Effect scope is required");
  const isReplacement = input.operation !== undefined;
  let replacement: {
    operation: EffectOperation;
    target: Prisma.InputJsonValue;
    source: Prisma.InputJsonValue;
    condition: Prisma.InputJsonValue;
    payload: Prisma.InputJsonValue;
  } | null = null;

  if (isReplacement) {
    const operation = input.operation;
    if (!operation) throw new Error("Effect operation is required");
    const templateId = current.templateId;
    const nodes = current.characterId
      ? await prisma.characterNode.findMany({ where: { characterId: current.characterId, archivedAt: null } })
      : await prisma.templateNode.findMany({ where: { templateId: templateId ?? "" } });
    const target = input.targetNodeId
      ? nodes.find((node) => node.id === input.targetNodeId)
      : null;
    if (numericOperations.includes(operation)) {
      if (!target || !["NUMBER", "BAR"].includes(target.type)) throw new Error("Numeric target is required");
      if (!input.source || !input.condition) throw new Error("Numeric source and condition are required");
      replacement = {
        operation,
        target: { kind: "node", nodeId: target.id },
        source: input.source as Prisma.InputJsonValue,
        condition: input.condition as Prisma.InputJsonValue,
        payload: (input.numericField ? { numericField: input.numericField } : {}) as Prisma.InputJsonValue,
      };
    } else {
      if (!input.condition) throw new Error("Effect condition is required");
      if (operation === "PATCH_NODE_PROPS" && !target) throw new Error("Patch target is required");
      if ((operation === "CREATE_NODE" || operation === "CREATE_GROUP") && target && !["CONTAINER", "GROUP"].includes(target.type)) {
        throw new Error("Structural nodes can only be created at the character root or inside Container or Group");
      }
      replacement = {
        operation,
        target: target ? { kind: "node", nodeId: target.id } : { kind: "root" },
        source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue,
        condition: input.condition as Prisma.InputJsonValue,
        payload: (operation === "PATCH_NODE_PROPS"
          ? { patch: input.patch ?? {}, ...(input.patchFromSource ? { patchFromSource: input.patchFromSource } : {}) }
          : { createNode: input.createNode }) as Prisma.InputJsonValue,
      };
    }
  }

  const updated = await prisma.effect.update({
    where: { id: effectId },
    data: {
      name: input.name?.trim() || undefined,
      enabled: input.enabled,
      priority: input.priority,
      operation: replacement?.operation,
      target: replacement?.target,
      source: replacement?.source,
      condition: replacement?.condition,
      payload: replacement?.payload,
    },
  });
  try {
    if (current.characterId) {
      await syncGraph(current.characterId);
      await reconcileStructuralEffects(current.characterId);
    } else if (current.templateId) {
      await validateTemplateEffectGraph(current.templateId);
    }
  }
  catch (error) {
    await prisma.effect.update({
      where: { id: effectId },
      data: {
        name: current.name,
        enabled: current.enabled,
        priority: current.priority,
        operation: current.operation,
        target: current.target as Prisma.InputJsonValue,
        source: current.source as Prisma.InputJsonValue,
        condition: current.condition as Prisma.InputJsonValue,
        payload: current.payload as Prisma.InputJsonValue,
      },
    });
    if (current.characterId) {
      await syncGraph(current.characterId);
      await reconcileStructuralEffects(current.characterId);
    } else if (current.templateId) {
      await validateTemplateEffectGraph(current.templateId);
    }
    throw error;
  }
  await prisma.auditLog.create({ data: { actorId: actor.id, workspaceId, characterId: current.characterId, entityType: "Effect", entityId: effectId, action: "UPDATE", oldValue: { name: current.name, enabled: current.enabled, priority: current.priority, operation: current.operation, target: current.target, source: current.source, condition: current.condition, payload: current.payload }, newValue: { name: updated.name, enabled: updated.enabled, priority: updated.priority, operation: updated.operation, target: updated.target, source: updated.source, condition: updated.condition, payload: updated.payload } } });
  if (current.characterId) revalidatePath(`/characters/${current.characterId}`);
  if (current.templateId) revalidatePath(`/templates/${current.templateId}`);
  return updated;
}

async function syncGraph(characterId: string) {
  const [nodes, effects] = await Promise.all([
    prisma.characterNode.findMany({ where: { characterId, archivedAt: null } }),
    prisma.effect.findMany({ where: { characterId, enabled: true }, orderBy: { priority: "asc" } })
  ]);
  const result = new DependencyEngine(parseCharacterNodeModels(nodes).nodes, parseEffectDefinitions(effects).effects).evaluate();
  if (result.cycles.length) throw new Error("Effect creates a dependency cycle");
  await prisma.$transaction(async (tx) => {
    await tx.dependencyEdge.deleteMany({ where: { characterId } });
    if (result.edges.length) await tx.dependencyEdge.createMany({ data: result.edges.map((edge) => ({ characterId, ...edge })), skipDuplicates: true });
  });
}

async function validateTemplateEffectGraph(templateId: string) {
  const [nodes, effects] = await Promise.all([
    prisma.templateNode.findMany({ where: { templateId } }),
    prisma.effect.findMany({ where: { templateId, enabled: true }, orderBy: { priority: "asc" } })
  ]);
  const result = new DependencyEngine(parseTemplateNodeModels(nodes).nodes, parseEffectDefinitions(effects).effects).evaluate();
  if (result.cycles.length) throw new Error("Effect creates a dependency cycle");
}

async function requireEffectWritableWorkspace(effect: Effect) {
  if (effect.characterId) {
    return (await requireCharacterGM(effect.characterId, { archived: "any" })).character.workspaceId;
  }
  if (effect.templateId) {
    return (await requireTemplateGM(effect.templateId, { archived: "any" })).template.workspaceId;
  }
  throw new Error("Effect scope is required");
}
