import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DependencyEngine } from "@/engine/dependency-engine";
import type { NodeType } from "@/domain/nodes";
import type { CreateNodePayload } from "@/domain/effects";
import { slugify } from "@/server/template-copy";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";
import { runTriggeredCharacterEffectsInTransaction } from "@/server/triggered-effects";

type Db = Prisma.TransactionClient;

export async function reconcileStructuralEffects(characterId: string) {
  return prisma.$transaction((tx) => reconcileStructuralEffectsInTransaction(tx, characterId), { timeout: 20_000 });
}

export async function reconcileStructuralEffectsInTransaction(tx: Db, characterId: string) {
  const effects = await tx.effect.findMany({ where: { characterId }, orderBy: { priority: "asc" } });
  let result: ReturnType<DependencyEngine["evaluate"]> | null = null;
  const maxPasses = Math.max(2, effects.length + 2);

  // Restoring a generated parent can make targets for other structural effects
  // available. Re-evaluate until no archive/create/restore operation is needed.
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const nodes = await tx.characterNode.findMany({ where: { characterId } });
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
        if (await syncGeneratedRoot(tx, characterId, root, request.parentNodeId, request.payload as CreateNodePayload)) {
          changed = true;
        }
        const ownedIds = generated
          .filter((node) => node.computed.generatedByEffectId === effectId)
          .map((node) => node.id);
        if (ownedIds.some((id) => nodes.find((node) => node.id === id)?.archivedAt)) {
          await tx.characterNode.updateMany({
            where: { characterId, id: { in: ownedIds } },
            data: { archivedAt: null },
          });
          ownedIds.forEach((id) => activeIds.add(id));
          changed = true;
        }
        desired.delete(effectId);
      } else if (!root.archivedAt) {
        await tx.characterNode.updateMany({
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
        tx,
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
  db: Db,
  characterId: string,
  root: GeneratedNode,
  parentId: string | null,
  payload: CreateNodePayload,
) {
  const parent = parentId
    ? await db.characterNode.findFirstOrThrow({ where: { id: parentId, characterId, archivedAt: null } })
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
  await db.characterNode.update({
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
    const descendants = await db.characterNode.findMany({
      where: { characterId, path: { startsWith: `${oldPath}/` } },
    });
    for (const descendant of descendants) {
      await db.characterNode.update({
        where: { id: descendant.id },
        data: { path: `${path}${descendant.path.slice(oldPath.length)}` },
      });
    }
  }
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

async function createGeneratedTree(db: Db, characterId: string, parentId: string | null, payload: CreateNodePayload, effectId: string, root: boolean) {
  const parent = parentId ? await db.characterNode.findFirstOrThrow({ where: { id: parentId, characterId, archivedAt: null } }) : null;
  const order = await db.characterNode.count({ where: { characterId, parentId, archivedAt: null } });
  const path = parent ? `${parent.path}/${slugify(payload.name)}` : slugify(payload.name);
  const created = await db.characterNode.create({ data: { characterId, parentId, type: payload.type as NodeType, name: payload.name, slug: slugify(payload.name), path, order, data: payload.data as Prisma.InputJsonValue, computed: { generatedByEffectId: effectId, generatedRoot: root } } });
  for (const child of payload.children ?? []) await createGeneratedTree(db, characterId, created.id, child, effectId, false);
  return created;
}

export async function stabilizeCharacterEffects(characterId: string, actorId: string) {
  await prisma.$transaction((tx) => stabilizeCharacterEffectsInTransaction(tx, characterId, actorId), { timeout: 30_000 });
}

// DependencyEdge bookkeeping must share the caller's transaction.
export async function syncGraphInTransaction(tx: Db, characterId: string) {
  const [nodes, effects] = await Promise.all([
    tx.characterNode.findMany({ where: { characterId, archivedAt: null } }),
    tx.effect.findMany({ where: { characterId, enabled: true }, orderBy: { priority: "asc" } })
  ]);
  const result = new DependencyEngine(parseCharacterNodeModels(nodes).nodes, parseEffectDefinitions(effects).effects).evaluate();
  if (result.cycles.length) throw new Error("Effect creates a dependency cycle");
  await tx.dependencyEdge.deleteMany({ where: { characterId } });
  if (result.edges.length) await tx.dependencyEdge.createMany({ data: result.edges.map((edge) => ({ characterId, ...edge })), skipDuplicates: true });
}

// Reconcile → graph sync → triggered → reconcile must share the caller's
// transaction so a mutation, its audit entry and all derived state commit or
// roll back together.
export async function stabilizeCharacterEffectsInTransaction(
  tx: Db,
  characterId: string,
  actorId: string,
): Promise<void> {
  await reconcileStructuralEffectsInTransaction(tx, characterId);
  await syncGraphInTransaction(tx, characterId);
  await runTriggeredCharacterEffectsInTransaction(tx, characterId, actorId);
  await reconcileStructuralEffectsInTransaction(tx, characterId);
}
