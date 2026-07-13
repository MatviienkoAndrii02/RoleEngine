import type { NodeType, Prisma, TemplateNode, TemplateSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NodeIdMap = Map<string, string>;
type SlotBindingMap = Map<string, string>;
type DbClient = Prisma.TransactionClient | typeof prisma;

export async function copyTemplateIntoCharacter(input: {
  templateId: string;
  characterId: string;
  parentNodeId?: string | null;
  bindings?: Record<string, string>;
}, db: DbClient = prisma) {
  const template = await db.entityTemplate.findUnique({
    where: { id: input.templateId },
    include: {
      nodes: { orderBy: [{ parentId: "asc" }, { order: "asc" }] },
      effects: true,
      slots: true
    }
  });

  if (!template) throw new Error("Template not found");

  const idMap: NodeIdMap = new Map();
  const slotBindings = await validateTemplateSlotBindings({
    characterId: input.characterId,
    slots: template.slots,
    bindings: input.bindings ?? {},
    db,
  });
  const nodesByParent = groupByParent(template.nodes);

  const copyChildren = async (parentTemplateId: string | null, parentCharacterId: string | null, parentPath: string) => {
    for (const templateNode of nodesByParent.get(parentTemplateId) ?? []) {
      const path = parentPath ? `${parentPath}/${slugify(templateNode.name)}` : slugify(templateNode.name);
      const created = await db.characterNode.create({
        data: {
          characterId: input.characterId,
          parentId: parentCharacterId,
          type: templateNode.type,
          name: templateNode.name,
          slug: templateNode.slug,
          path,
          order: templateNode.order,
          data: templateNode.data as Prisma.InputJsonValue
        }
      });
      idMap.set(templateNode.id, created.id);
      await copyChildren(templateNode.id, created.id, path);
    }
  };

  const parentPath = input.parentNodeId
    ? (await db.characterNode.findFirstOrThrow({ where: { id: input.parentNodeId, characterId: input.characterId, archivedAt: null } })).path
    : "";

  await copyChildren(null, input.parentNodeId ?? null, parentPath);

  for (const effect of template.effects) {
    await db.effect.create({
      data: {
        name: effect.name,
        enabled: effect.enabled,
        operation: effect.operation,
        priority: effect.priority,
        characterId: input.characterId,
        sourceNodeId: effect.sourceTemplateNodeId ? idMap.get(effect.sourceTemplateNodeId) : null,
        condition: remapTemplateEffectJson(effect.condition, idMap, slotBindings),
        target: remapTemplateEffectJson(effect.target, idMap, slotBindings),
        source: remapTemplateEffectJson(effect.source, idMap, slotBindings),
        payload: remapTemplateEffectJson(effect.payload, idMap, slotBindings)
      }
    });
  }

  return { copiedNodeIds: [...idMap.values()] };
}

export async function copyTemplateIntoTemplate(input: {
  sourceTemplateId: string;
  targetTemplateId: string;
  parentNodeId?: string | null;
}, db: DbClient = prisma) {
  if (input.sourceTemplateId === input.targetTemplateId) throw new Error("Template cannot be copied into itself");
  const [source, target] = await Promise.all([
    db.entityTemplate.findUnique({
      where: { id: input.sourceTemplateId },
      include: {
        nodes: { orderBy: [{ parentId: "asc" }, { order: "asc" }] },
        effects: true,
        slots: true,
      },
    }),
    db.entityTemplate.findUnique({
      where: { id: input.targetTemplateId },
      include: { slots: true },
    }),
  ]);
  if (!source || !target) throw new Error("Template not found");

  const idMap: NodeIdMap = new Map();
  const slotMap = await copyTemplateSlotsIntoTemplate(source.slots, target.id, target.slots, db);
  const nodesByParent = groupByParent(source.nodes);
  const parentPath = input.parentNodeId
    ? (await db.templateNode.findFirstOrThrow({ where: { id: input.parentNodeId, templateId: input.targetTemplateId } })).path
    : "";

  const copyChildren = async (parentSourceId: string | null, parentTargetId: string | null, parentPathValue: string) => {
    for (const sourceNode of nodesByParent.get(parentSourceId) ?? []) {
      const path = parentPathValue ? `${parentPathValue}/${slugify(sourceNode.name)}` : slugify(sourceNode.name);
      const created = await db.templateNode.create({
        data: {
          templateId: input.targetTemplateId,
          parentId: parentTargetId,
          type: sourceNode.type,
          name: sourceNode.name,
          slug: sourceNode.slug,
          path,
          order: sourceNode.order,
          data: sourceNode.data as Prisma.InputJsonValue,
        },
      });
      idMap.set(sourceNode.id, created.id);
      await copyChildren(sourceNode.id, created.id, path);
    }
  };

  await copyChildren(null, input.parentNodeId ?? null, parentPath);

  for (const effect of source.effects) {
    await db.effect.create({
      data: {
        name: effect.name,
        enabled: effect.enabled,
        operation: effect.operation,
        priority: effect.priority,
        templateId: input.targetTemplateId,
        sourceTemplateNodeId: effect.sourceTemplateNodeId ? idMap.get(effect.sourceTemplateNodeId) : null,
        condition: remapTemplateEffectJsonForTemplate(effect.condition, idMap, slotMap),
        target: remapTemplateEffectJsonForTemplate(effect.target, idMap, slotMap),
        source: remapTemplateEffectJsonForTemplate(effect.source, idMap, slotMap),
        payload: remapTemplateEffectJsonForTemplate(effect.payload, idMap, slotMap),
      },
    });
  }

  return { copiedNodeIds: [...idMap.values()], copiedSlotIds: [...slotMap.values()] };
}

async function copyTemplateSlotsIntoTemplate(
  sourceSlots: TemplateSlot[],
  targetTemplateId: string,
  existingTargetSlots: TemplateSlot[],
  db: DbClient,
): Promise<SlotBindingMap> {
  const result = new Map<string, string>();
  const usedKeys = new Set(existingTargetSlots.map((slot) => slot.key));
  for (const sourceSlot of sourceSlots) {
    const key = nextAvailableSlotKey(sourceSlot.key, usedKeys);
    usedKeys.add(key);
    const created = await db.templateSlot.create({
      data: {
        templateId: targetTemplateId,
        key,
        label: sourceSlot.label,
        description: sourceSlot.description,
        direction: sourceSlot.direction,
        acceptedTypes: sourceSlot.acceptedTypes as Prisma.InputJsonValue,
        required: sourceSlot.required,
      },
    });
    result.set(sourceSlot.id, created.id);
  }
  return result;
}

function nextAvailableSlotKey(baseKey: string, usedKeys: Set<string>) {
  if (!usedKeys.has(baseKey)) return baseKey;
  for (let index = 2; ; index += 1) {
    const candidate = `${baseKey}_${index}`;
    if (!usedKeys.has(candidate)) return candidate;
  }
}

function groupByParent(nodes: TemplateNode[]) {
  const map = new Map<string | null, TemplateNode[]>();
  for (const node of nodes) {
    const list = map.get(node.parentId) ?? [];
    list.push(node);
    map.set(node.parentId, list);
  }
  return map;
}

async function validateTemplateSlotBindings(input: {
  characterId: string;
  slots: TemplateSlot[];
  bindings: Record<string, string>;
  db: DbClient;
}): Promise<SlotBindingMap> {
  const result = new Map<string, string>();
  const slotIds = new Set(input.slots.map((slot) => slot.id));
  const requestedNodeIds = [...new Set(Object.values(input.bindings).filter(Boolean))];
  const nodes = requestedNodeIds.length
    ? await input.db.characterNode.findMany({
        where: { characterId: input.characterId, id: { in: requestedNodeIds }, archivedAt: null },
        select: { id: true, type: true },
      })
    : [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const [slotId, nodeId] of Object.entries(input.bindings)) {
    if (!slotIds.has(slotId)) throw new Error("Unknown template slot binding");
    const node = nodesById.get(nodeId);
    if (!node) throw new Error("Template slot binding target was not found");
    const slot = input.slots.find((candidate) => candidate.id === slotId);
    if (!slot) continue;
    const acceptedTypes = readAcceptedTypes(slot.acceptedTypes);
    if (acceptedTypes.length > 0 && !acceptedTypes.includes(node.type)) {
      throw new Error("Template slot binding target has an incompatible node type");
    }
    result.set(slotId, nodeId);
  }

  for (const slot of input.slots) {
    if (slot.required && !result.has(slot.id)) throw new Error("Required template slot binding is missing");
  }

  return result;
}

function readAcceptedTypes(value: Prisma.JsonValue): NodeType[] {
  const allowed: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NodeType => typeof item === "string" && allowed.includes(item as NodeType));
}

export function remapTemplateEffectJson(value: unknown, idMap: ReadonlyMap<string, string>, slotBindings: ReadonlyMap<string, string> = new Map()): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map((item) => remapTemplateEffectJson(item, idMap, slotBindings));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.kind === "templateSlot" && typeof record.slotId === "string") {
      const nodeId = slotBindings.get(record.slotId);
      return {
        ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== "slotId")),
        kind: "node",
        nodeId: nodeId ?? record.slotId,
      };
    }
    if (record.kind === "slotRef" && typeof record.slotId === "string") {
      const nodeId = slotBindings.get(record.slotId);
      return {
        ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== "slotId")),
        kind: "ref",
        nodeId: nodeId ?? record.slotId,
      };
    }
    if (record.kind === "slotExists" && typeof record.slotId === "string") {
      return { kind: "fieldExists", nodeId: slotBindings.get(record.slotId) ?? record.slotId };
    }
    if (record.kind === "compareSlot" && typeof record.slotId === "string") {
      return {
        ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== "slotId")),
        kind: "compare",
        nodeId: slotBindings.get(record.slotId) ?? record.slotId,
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if ((key === "nodeId" || key === "parentNodeId") && typeof item === "string") {
          return [key, idMap.get(item) ?? item];
        }
        return [key, remapTemplateEffectJson(item, idMap, slotBindings)];
      })
    );
  }
  return value as Prisma.InputJsonValue;
}

export function remapTemplateEffectJsonForTemplate(value: unknown, idMap: ReadonlyMap<string, string>, slotMap: ReadonlyMap<string, string> = new Map()): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map((item) => remapTemplateEffectJsonForTemplate(item, idMap, slotMap));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ((record.kind === "templateSlot" || record.kind === "slotRef" || record.kind === "slotExists" || record.kind === "compareSlot") && typeof record.slotId === "string") {
      return {
        ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== "slotId")),
        slotId: slotMap.get(record.slotId) ?? record.slotId,
      };
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => {
        if ((key === "nodeId" || key === "parentNodeId") && typeof item === "string") {
          return [key, idMap.get(item) ?? item];
        }
        return [key, remapTemplateEffectJsonForTemplate(item, idMap, slotMap)];
      })
    );
  }
  return value as Prisma.InputJsonValue;
}

export function slugify(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
