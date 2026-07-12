import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DependencyEngine } from "@/engine/dependency-engine";
import type { NodeType } from "@/domain/nodes";
import type { CreateNodePayload } from "@/domain/effects";
import { slugify } from "@/server/template-copy";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";

export async function reconcileStructuralEffects(characterId: string) {
  const effects = await prisma.effect.findMany({ where: { characterId }, orderBy: { priority: "asc" } });
  let result: ReturnType<DependencyEngine["evaluate"]> | null = null;
  const maxPasses = Math.max(2, effects.length + 2);

  // Restoring a generated parent can make targets for other structural effects
  // available. Re-evaluate until no archive/create/restore operation is needed.
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const nodes = await prisma.characterNode.findMany({ where: { characterId } });
    const activeNodes = nodes.filter((node) => !node.archivedAt);
    result = new DependencyEngine(
      parseCharacterNodeModels(activeNodes).nodes,
      parseEffectDefinitions(effects).effects,
    ).evaluate();
    if (result.cycles.length) throw new Error("Effect creates a dependency cycle");

    const desired = new Map(result.createdNodeRequests.map((request) => [request.effectId, request]));
    const generated = nodes.filter(hasGeneratedProvenance);
    const roots = generated
      .filter((node) => node.computed.generatedRoot)
      .sort((left, right) => left.path.split("/").length - right.path.split("/").length);
    const activeIds = new Set(activeNodes.map((node) => node.id));
    let changed = false;

    for (const root of roots) {
      const effectId = root.computed.generatedByEffectId;
      const request = desired.get(effectId);
      const parentIsActive = !root.parentId || activeIds.has(root.parentId);

      if (request && parentIsActive) {
        if (await syncGeneratedRoot(characterId, root, request.parentNodeId, request.payload as CreateNodePayload)) {
          changed = true;
        }
        const ownedIds = generated
          .filter((node) => node.computed.generatedByEffectId === effectId)
          .map((node) => node.id);
        if (ownedIds.some((id) => nodes.find((node) => node.id === id)?.archivedAt)) {
          await prisma.characterNode.updateMany({
            where: { characterId, id: { in: ownedIds } },
            data: { archivedAt: null },
          });
          ownedIds.forEach((id) => activeIds.add(id));
          changed = true;
        }
        desired.delete(effectId);
      } else if (!root.archivedAt) {
        await prisma.characterNode.updateMany({
          where: { characterId, OR: [{ id: root.id }, { path: { startsWith: `${root.path}/` } }] },
          data: { archivedAt: new Date() },
        });
        nodes
          .filter((node) => node.id === root.id || node.path.startsWith(`${root.path}/`))
          .forEach((node) => activeIds.delete(node.id));
        changed = true;
      }
    }

    for (const request of desired.values()) {
      const parentIsActive = !request.parentNodeId || activeIds.has(request.parentNodeId);
      if (!parentIsActive) continue;
      await createGeneratedTree(
        characterId,
        request.parentNodeId,
        request.payload as CreateNodePayload,
        request.effectId,
        true,
      );
      changed = true;
    }

    if (!changed) return result;
  }

  throw new Error("Structural effects did not reach a stable state");
}

async function syncGeneratedRoot(
  characterId: string,
  root: GeneratedNode,
  parentId: string | null,
  payload: CreateNodePayload,
) {
  const parent = parentId
    ? await prisma.characterNode.findFirstOrThrow({ where: { id: parentId, characterId, archivedAt: null } })
    : null;
  const slug = slugify(payload.name);
  const path = parent ? `${parent.path}/${slug}` : slug;
  const differs = root.parentId !== parentId
    || root.type !== payload.type
    || root.name !== payload.name
    || root.slug !== slug
    || root.path !== path
    || JSON.stringify(root.data) !== JSON.stringify(payload.data);
  if (!differs) return false;

  const oldPath = root.path;
  await prisma.$transaction(async (tx) => {
    await tx.characterNode.update({
      where: { id: root.id },
      data: {
        parentId,
        type: payload.type as NodeType,
        name: payload.name,
        slug,
        path,
        data: payload.data as Prisma.InputJsonValue,
      },
    });
    if (oldPath !== path) {
      const descendants = await tx.characterNode.findMany({
        where: { characterId, path: { startsWith: `${oldPath}/` } },
      });
      for (const descendant of descendants) {
        await tx.characterNode.update({
          where: { id: descendant.id },
          data: { path: `${path}${descendant.path.slice(oldPath.length)}` },
        });
      }
    }
  });
  return true;
}

type GeneratedNode = Awaited<ReturnType<typeof prisma.characterNode.findMany>>[number] & {
  computed: { generatedByEffectId: string; generatedRoot?: boolean };
};

function hasGeneratedProvenance(node: Awaited<ReturnType<typeof prisma.characterNode.findMany>>[number]): node is GeneratedNode {
  return typeof node.computed === "object"
    && node.computed !== null
    && "generatedByEffectId" in node.computed
    && typeof node.computed.generatedByEffectId === "string";
}

async function createGeneratedTree(characterId: string, parentId: string | null, payload: CreateNodePayload, effectId: string, root: boolean) {
  const parent = parentId ? await prisma.characterNode.findFirstOrThrow({ where: { id: parentId, characterId, archivedAt: null } }) : null;
  const order = await prisma.characterNode.count({ where: { characterId, parentId, archivedAt: null } });
  const path = parent ? `${parent.path}/${slugify(payload.name)}` : slugify(payload.name);
  const created = await prisma.characterNode.create({ data: { characterId, parentId, type: payload.type as NodeType, name: payload.name, slug: slugify(payload.name), path, order, data: payload.data as Prisma.InputJsonValue, computed: { generatedByEffectId: effectId, generatedRoot: root } } });
  for (const child of payload.children ?? []) await createGeneratedTree(characterId, created.id, child, effectId, false);
  return created;
}
