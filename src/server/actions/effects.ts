"use server";

import type { Effect, EffectOperation, Prisma } from "@prisma/client";
import { safeRevalidatePath as revalidatePath } from "@/server/revalidate";
import { prisma } from "@/lib/prisma";
import { requireCharacterGM, requireGM, requireTemplateGM } from "@/server/authz";
import { DependencyEngine } from "@/engine/dependency-engine";
import type { EffectCondition, EffectDefinition, EffectSource } from "@/domain/effects";
import type { CreateNodePayload, TriggeredEffectAction, TriggeredEffectTrigger } from "@/domain/effects";
import {
  reconcileStructuralEffects,
  reconcileStructuralEffectsInTransaction,
  stabilizeCharacterEffectsInTransaction,
  syncGraphInTransaction,
} from "@/server/structural-effects";
import { runManualTriggeredEffectInTransaction } from "@/server/triggered-effects";
import { writeAudit } from "@/server/audit";
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
  // Effect write, derived state and audit must commit or roll back together.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({ data: { name, operation: input.operation, priority: effects.length, characterId: input.characterId, condition: input.condition as Prisma.InputJsonValue, target: candidate.target as Prisma.InputJsonValue, source: input.source as Prisma.InputJsonValue, payload: candidate.payload as Prisma.InputJsonValue } });
    await syncGraphInTransaction(tx, input.characterId);
    await stabilizeCharacterEffectsInTransaction(tx, input.characterId, actor.id);
    await writeAudit({ actorId: actor.id, workspaceId: character.workspaceId, characterId: input.characterId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { name, operation: input.operation, targetNodeId: input.targetNodeId } }, tx);
    return created;
  });
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
  // The effect record itself only persists when stabilization succeeds.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({ data: { name: input.name.trim(), operation: input.operation, priority: count, characterId: input.characterId, condition: input.condition as Prisma.InputJsonValue, target: effectTarget, source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue, payload: payload as Prisma.InputJsonValue } });
    await stabilizeCharacterEffectsInTransaction(tx, input.characterId, actor.id);
    await writeAudit({ actorId: actor.id, workspaceId: character.workspaceId, characterId: input.characterId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { name: created.name, operation: created.operation } }, tx);
    return created;
  });
  revalidatePath(`/characters/${input.characterId}`);
  return effect;
}

export async function createTriggeredEffect(input: { characterId: string; name: string; trigger: TriggeredEffectTrigger; actions: TriggeredEffectAction[] }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const name = input.name.trim();
  if (!name) throw new Error("Effect name is required");
  if (!input.actions.length) throw new Error("Triggered effect needs at least one action");
  const count = await prisma.effect.count({ where: { characterId: input.characterId } });
  // The effect record itself only persists when stabilization succeeds.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({
      data: {
        name,
        operation: "TRIGGERED",
        priority: count,
        characterId: input.characterId,
        condition: { kind: "always" },
        target: { kind: "root" },
        source: { kind: "number", value: 0 },
        payload: { triggered: { trigger: input.trigger, actions: input.actions } } as Prisma.InputJsonValue,
      },
    });
    await stabilizeCharacterEffectsInTransaction(tx, input.characterId, actor.id);
    await writeAudit({ actorId: actor.id, workspaceId: character.workspaceId, characterId: input.characterId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { name, operation: "TRIGGERED", actions: input.actions.length } }, tx);
    return created;
  });
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
  const targetRef = await resolveTemplateTargetRef(input.templateId, input.targetNodeId, ["NUMBER", "BAR"]);
  if (!targetRef) throw new Error("Numeric target is required");
  const candidate = { id: "candidate", name, enabled: true, operation: input.operation, priority: effects.length, condition: input.condition, target: targetRef, source: input.source, payload: input.numericField ? { numericField: input.numericField } : {} } as EffectDefinition;
  const parsedNodes = parseTemplateNodeModels(nodes).nodes;
  const parsedEffects = parseEffectDefinitions(effects).effects;
  const check = new DependencyEngine(parsedNodes, [...parsedEffects, candidate]).evaluate();
  if (check.cycles.length) throw new Error("Effect creates a dependency cycle");
  // Effect write and audit must commit or roll back together.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({ data: { name, operation: input.operation, priority: effects.length, templateId: input.templateId, condition: input.condition as Prisma.InputJsonValue, target: candidate.target as Prisma.InputJsonValue, source: input.source as Prisma.InputJsonValue, payload: candidate.payload as Prisma.InputJsonValue } });
    await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { templateId: input.templateId, name, operation: input.operation, targetNodeId: input.targetNodeId } }, tx);
    return created;
  });
  revalidatePath(`/templates/${input.templateId}`);
  return effect;
}

export async function createTemplateStructuralEffect(input: { templateId: string; name: string; operation: "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS"; targetNodeId?: string | null; source?: EffectSource; condition: EffectCondition; createNode?: CreateNodePayload; patch?: Record<string, unknown>; patchFromSource?: { field: string } }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const target = input.targetNodeId
    ? await resolveTemplateStructuralTarget(input.templateId, input.targetNodeId)
    : null;
  if (input.operation === "PATCH_NODE_PROPS" && !target) throw new Error("Patch target is required");
  if ((input.operation === "CREATE_NODE" || input.operation === "CREATE_GROUP") && target && target.kind === "node" && !["CONTAINER", "GROUP"].includes(target.type)) throw new Error("Structural nodes can only be created at the template root or inside Container or Group");
  if ((input.operation === "CREATE_NODE" || input.operation === "CREATE_GROUP") && target && target.kind === "templateSlot" && !target.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP")) throw new Error("Structural slot target must accept Container or Group");
  const count = await prisma.effect.count({ where: { templateId: input.templateId } });
  const payload = input.operation === "PATCH_NODE_PROPS" ? { patch: input.patch ?? {}, ...(input.patchFromSource ? { patchFromSource: input.patchFromSource } : {}) } : { createNode: input.createNode };
  const effectTarget = target ? target.target : { kind: "root" };
  // Creation, graph validation and audit must commit or roll back together; the
  // tx-based validation sees the uncommitted candidate row inside the transaction.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({ data: { name: input.name.trim(), operation: input.operation, priority: count, templateId: input.templateId, condition: input.condition as Prisma.InputJsonValue, target: effectTarget, source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue, payload: payload as Prisma.InputJsonValue } });
    await validateTemplateEffectGraph(input.templateId, tx);
    await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { templateId: input.templateId, name: created.name, operation: created.operation } }, tx);
    return created;
  });
  revalidatePath(`/templates/${input.templateId}`);
  return effect;
}

export async function createTemplateTriggeredEffect(input: { templateId: string; name: string; trigger: TriggeredEffectTrigger; actions: TriggeredEffectAction[] }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const name = input.name.trim();
  if (!name) throw new Error("Effect name is required");
  if (!input.actions.length) throw new Error("Triggered effect needs at least one action");
  const count = await prisma.effect.count({ where: { templateId: input.templateId } });
  // Effect write and audit must commit or roll back together.
  const effect = await prisma.$transaction(async (tx) => {
    const created = await tx.effect.create({
      data: {
        name,
        operation: "TRIGGERED",
        priority: count,
        templateId: input.templateId,
        condition: { kind: "always" },
        target: { kind: "root" },
        source: { kind: "number", value: 0 },
        payload: { triggered: { trigger: input.trigger, actions: input.actions } } as Prisma.InputJsonValue,
      },
    });
    await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "Effect", entityId: created.id, action: "CREATE", newValue: { templateId: input.templateId, name, operation: "TRIGGERED", actions: input.actions.length } }, tx);
    return created;
  });
  revalidatePath(`/templates/${input.templateId}`);
  return effect;
}

export async function deleteEffect(effectId: string) {
  const actor = await requireGM();
  const effect = await prisma.effect.findUniqueOrThrow({ where: { id: effectId } });
  const workspaceId = await requireEffectWritableWorkspace(effect);
  // Deletion, derived state and audit must commit or roll back together.
  await prisma.$transaction(async (tx) => {
    await tx.effect.delete({ where: { id: effectId } });
    if (effect.characterId) {
      await syncGraphInTransaction(tx, effect.characterId);
      await stabilizeCharacterEffectsInTransaction(tx, effect.characterId, actor.id);
    }
    await writeAudit({ actorId: actor.id, workspaceId, characterId: effect.characterId, entityType: "Effect", entityId: effect.id, action: "DELETE", oldValue: { name: effect.name, operation: effect.operation } }, tx);
  });
  if (effect.characterId) revalidatePath(`/characters/${effect.characterId}`);
  if (effect.templateId) revalidatePath(`/templates/${effect.templateId}`);
}

export async function runTriggeredEffect(input: { effectId: string; nodeId: string }) {
  const actor = await requireGM();
  const effect = await prisma.effect.findUniqueOrThrow({ where: { id: input.effectId } });
  const workspaceId = await requireEffectWritableWorkspace(effect);
  if (!effect.characterId) throw new Error("Triggered effect must belong to a character");
  const characterId: string = effect.characterId;
  const node = await prisma.characterNode.findFirstOrThrow({ where: { id: input.nodeId, characterId, archivedAt: null } });
  const result = await prisma.$transaction(async (tx) => {
    const triggered = await runManualTriggeredEffectInTransaction(tx, effect.id, actor.id, node.id);
    await syncGraphInTransaction(tx, characterId);
    await reconcileStructuralEffectsInTransaction(tx, characterId);
    await writeAudit({
      actorId: actor.id,
      workspaceId,
      characterId,
      entityType: "Effect",
      entityId: effect.id,
      action: "RECALCULATE",
      newValue: { manualTrigger: true, nodeId: node.id, effectName: effect.name, ...triggered },
    }, tx);
    return triggered;
  });
  revalidatePath(`/characters/${characterId}`);
  return result;
}

export async function withEffectMutationRollback<T>(characterId: string, effectId: string, mutate: () => Promise<T>): Promise<T> {
  const current = await prisma.effect.findUniqueOrThrow({ where: { id: effectId } });
  const snapshot = {
    name: current.name,
    enabled: current.enabled,
    priority: current.priority,
    operation: current.operation,
    target: current.target as Prisma.InputJsonValue,
    source: current.source as Prisma.InputJsonValue,
    condition: current.condition as Prisma.InputJsonValue,
    payload: current.payload as Prisma.InputJsonValue,
  };

  try {
    return await mutate();
  } catch (error) {
    await prisma.effect.update({
      where: { id: effectId },
      data: snapshot,
    });
    await syncGraph(characterId);
    await reconcileStructuralEffects(characterId);
    throw error;
  }
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
  trigger?: TriggeredEffectTrigger;
  actions?: TriggeredEffectAction[];
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
      ? current.templateId
        ? await resolveTemplateStructuralTarget(current.templateId, input.targetNodeId)
        : nodes.find((node) => node.id === input.targetNodeId) ?? null
      : null;
    if (operation === "TRIGGERED") {
      if (!input.trigger || !input.actions?.length) throw new Error("Triggered effect needs a trigger and at least one action");
      replacement = {
        operation,
        target: { kind: "root" },
        source: { kind: "number", value: 0 },
        condition: { kind: "always" },
        payload: { triggered: { trigger: input.trigger, actions: input.actions } } as Prisma.InputJsonValue,
      };
    } else if (numericOperations.includes(operation)) {
      const numericTarget = input.targetNodeId && current.templateId
        ? await resolveTemplateTargetRef(current.templateId, input.targetNodeId, ["NUMBER", "BAR"])
        : target && "type" in target && ["NUMBER", "BAR"].includes(target.type)
          ? { kind: "node" as const, nodeId: target.id }
          : null;
      if (!numericTarget) throw new Error("Numeric target is required");
      if (!input.source || !input.condition) throw new Error("Numeric source and condition are required");
      replacement = {
        operation,
        target: numericTarget,
        source: input.source as Prisma.InputJsonValue,
        condition: input.condition as Prisma.InputJsonValue,
        payload: (input.numericField ? { numericField: input.numericField } : {}) as Prisma.InputJsonValue,
      };
    } else {
      if (!input.condition) throw new Error("Effect condition is required");
      if (operation === "PATCH_NODE_PROPS" && !target) throw new Error("Patch target is required");
      if ((operation === "CREATE_NODE" || operation === "CREATE_GROUP") && target && "type" in target && !["CONTAINER", "GROUP"].includes(target.type)) {
        throw new Error("Structural nodes can only be created at the character root or inside Container or Group");
      }
      if ((operation === "CREATE_NODE" || operation === "CREATE_GROUP") && target && "acceptedTypes" in target && !target.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP")) {
        throw new Error("Structural slot target must accept Container or Group");
      }
      replacement = {
        operation,
        target: target ? ("target" in target ? target.target : { kind: "node", nodeId: target.id }) : { kind: "root" },
        source: (input.source ?? { kind: "number", value: 0 }) as Prisma.InputJsonValue,
        condition: input.condition as Prisma.InputJsonValue,
        payload: (operation === "PATCH_NODE_PROPS"
          ? { patch: input.patch ?? {}, ...(input.patchFromSource ? { patchFromSource: input.patchFromSource } : {}) }
          : { createNode: input.createNode }) as Prisma.InputJsonValue,
      };
    }
  }

  // Single transaction: effect mutation, derived graph state and audit commit
  // or roll back together вЂ” no compensation wrapper needed.
  const updated = await prisma.$transaction(async (tx) => {
    const candidate = await tx.effect.update({
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

    if (current.characterId) {
      await syncGraphInTransaction(tx, current.characterId);
      await stabilizeCharacterEffectsInTransaction(tx, current.characterId, actor.id);
    } else if (current.templateId) {
      await validateTemplateEffectGraph(current.templateId, tx);
    }

    await tx.auditLog.create({ data: { actorId: actor.id, workspaceId, characterId: current.characterId, entityType: "Effect", entityId: effectId, action: "UPDATE", oldValue: { name: current.name, enabled: current.enabled, priority: current.priority, operation: current.operation, target: current.target, source: current.source, condition: current.condition, payload: current.payload }, newValue: { name: candidate.name, enabled: candidate.enabled, priority: candidate.priority, operation: candidate.operation, target: candidate.target, source: candidate.source, condition: candidate.condition, payload: candidate.payload } } });
    return candidate;
  }, { timeout: 30_000 });
  if (current.characterId) revalidatePath(`/characters/${current.characterId}`);
  if (current.templateId) revalidatePath(`/templates/${current.templateId}`);
  return updated;
}

// Compensation path for the legacy rollback guard; new flows use transactions.
async function syncGraph(characterId: string) {
  await prisma.$transaction((tx) => syncGraphInTransaction(tx, characterId));
}

async function validateTemplateEffectGraph(templateId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  const [nodes, effects] = await Promise.all([
    db.templateNode.findMany({ where: { templateId } }),
    db.effect.findMany({ where: { templateId, enabled: true }, orderBy: { priority: "asc" } })
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

function parseTemplateTargetInput(value: string) {
  return value.startsWith("slot:")
    ? { kind: "slot" as const, id: value.slice("slot:".length) }
    : { kind: "node" as const, id: value };
}

async function resolveTemplateTargetRef(templateId: string, value: string, acceptedTypes: string[]): Promise<EffectDefinition["target"] | null> {
  const parsed = parseTemplateTargetInput(value);
  if (parsed.kind === "node") {
    const target = await prisma.templateNode.findFirst({ where: { id: parsed.id, templateId } });
    if (!target || !acceptedTypes.includes(target.type)) return null;
    return { kind: "node", nodeId: target.id };
  }

  const slot = await prisma.templateSlot.findFirst({ where: { id: parsed.id, templateId } });
  if (!slot) return null;
  const slotTypes = Array.isArray(slot.acceptedTypes) ? slot.acceptedTypes.filter((type): type is string => typeof type === "string") : [];
  if (slotTypes.length > 0 && !slotTypes.some((type) => acceptedTypes.includes(type))) return null;
  return { kind: "templateSlot", slotId: slot.id };
}

async function resolveTemplateStructuralTarget(templateId: string, value: string): Promise<
  | { kind: "node"; id: string; type: string; target: EffectDefinition["target"] }
  | { kind: "templateSlot"; id: string; acceptedTypes: string[]; target: EffectDefinition["target"] }
  | null
> {
  const parsed = parseTemplateTargetInput(value);
  if (parsed.kind === "node") {
    const target = await prisma.templateNode.findFirst({ where: { id: parsed.id, templateId } });
    return target ? { kind: "node", id: target.id, type: target.type, target: { kind: "node", nodeId: target.id } } : null;
  }
  const slot = await prisma.templateSlot.findFirst({ where: { id: parsed.id, templateId } });
  if (!slot) return null;
  const acceptedTypes = Array.isArray(slot.acceptedTypes) ? slot.acceptedTypes.filter((type): type is string => typeof type === "string") : [];
  return { kind: "templateSlot", id: slot.id, acceptedTypes, target: { kind: "templateSlot", slotId: slot.id } };
}
