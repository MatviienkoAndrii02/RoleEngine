import type { Prisma, TemplateNode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NodeIdMap = Map<string, string>;
type DbClient = Prisma.TransactionClient | typeof prisma;

export async function copyTemplateIntoCharacter(input: {
  templateId: string;
  characterId: string;
  parentNodeId?: string | null;
}, db: DbClient = prisma) {
  const template = await db.entityTemplate.findUnique({
    where: { id: input.templateId },
    include: {
      nodes: { orderBy: [{ parentId: "asc" }, { order: "asc" }] },
      effects: true
    }
  });

  if (!template) throw new Error("Template not found");

  const idMap: NodeIdMap = new Map();
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
        condition: remapTemplateEffectJson(effect.condition, idMap),
        target: remapTemplateEffectJson(effect.target, idMap),
        source: remapTemplateEffectJson(effect.source, idMap),
        payload: remapTemplateEffectJson(effect.payload, idMap)
      }
    });
  }

  return { copiedNodeIds: [...idMap.values()] };
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

export function remapTemplateEffectJson(value: unknown, idMap: ReadonlyMap<string, string>): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map((item) => remapTemplateEffectJson(item, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if ((key === "nodeId" || key === "parentNodeId") && typeof item === "string") {
          return [key, idMap.get(item) ?? item];
        }
        return [key, remapTemplateEffectJson(item, idMap)];
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
