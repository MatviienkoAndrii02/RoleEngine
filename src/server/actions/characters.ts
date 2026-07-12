"use server";

import type { NodeType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCharacterGM, requireGM, requirePrimaryWritableWorkspace } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { copyTemplateIntoCharacter, slugify } from "@/server/template-copy";
import { reconcileStructuralEffects } from "@/server/structural-effects";
import { parseNodeData } from "@/domain/validation";
import { collectSubtreeIds } from "@/domain/tree";
import { appError } from "@/server/errors";

export async function createCharacter(input: {
  name: string;
  description?: string;
  ownerId?: string;
  templateId?: string;
}) {
  const actor = await requireGM();
  const workspaceId = await requirePrimaryWritableWorkspace(actor.id);
  const name = input.name.trim();
  if (!name) throw new Error("Character name is required");

  const character = await prisma.$transaction(async (tx) => {
    if (input.ownerId) {
      await tx.workspaceMembership.findFirstOrThrow({ where: { workspaceId, userId: input.ownerId, role: "PLAYER" } });
    }
    if (input.templateId) {
      await tx.entityTemplate.findFirstOrThrow({
        where: {
          id: input.templateId,
          archivedAt: null,
          OR: [{ workspaceId }, { workspaceId: null, isGlobal: true }],
        },
      });
    }
    const created = await tx.character.create({
      data: {
        workspaceId,
        name,
        description: input.description?.trim() || null,
        ownerId: input.ownerId || null,
        createdById: actor.id
      }
    });

    if (input.ownerId) {
      await tx.characterAssignment.create({
        data: { characterId: created.id, userId: input.ownerId }
      });
    }
    if (input.templateId) {
      await copyTemplateIntoCharacter({ templateId: input.templateId, characterId: created.id }, tx);
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId,
        characterId: created.id,
        entityType: "Character",
        entityId: created.id,
        action: "CREATE",
        newValue: { name, ownerId: input.ownerId ?? null, templateId: input.templateId ?? null }
      }
    });
    return created;
  });

  await reconcileStructuralEffects(character.id);
  revalidatePath("/");
  return character;
}

export async function updateCharacter(input: {
  characterId: string;
  name?: string;
  description?: string | null;
  ownerId?: string | null;
}) {
  const actor = await requireGM();
  const current = (await requireCharacterGM(input.characterId)).character;
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("Character name is required");
  const description = input.description !== undefined ? input.description?.trim() || null : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.ownerId) {
      await tx.workspaceMembership.findFirstOrThrow({ where: { workspaceId: current.workspaceId, userId: input.ownerId, role: "PLAYER" } });
    }
    const character = await tx.character.update({
      where: { id: input.characterId },
      data: {
        name,
        description,
        ownerId: input.ownerId !== undefined ? input.ownerId : undefined,
      },
    });
    if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
      if (input.ownerId) {
        await tx.characterAssignment.upsert({
          where: { characterId_userId: { characterId: input.characterId, userId: input.ownerId } },
          create: { characterId: input.characterId, userId: input.ownerId, canView: true },
          update: { canView: true },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          workspaceId: current.workspaceId,
          characterId: input.characterId,
          entityType: "Character",
          entityId: input.characterId,
          action: "ASSIGN",
          fieldPath: "ownerId",
          oldValue: { ownerId: current.ownerId },
          newValue: { ownerId: input.ownerId },
        },
      });
    }
    if ((input.name !== undefined && character.name !== current.name) || (input.description !== undefined && character.description !== current.description)) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          workspaceId: current.workspaceId,
          characterId: input.characterId,
          entityType: "Character",
          entityId: input.characterId,
          action: "UPDATE",
          oldValue: { name: current.name, description: current.description },
          newValue: { name: character.name, description: character.description },
        },
      });
    }
    return character;
  });

  revalidatePath("/");
  revalidatePath(`/characters/${input.characterId}`);
  return updated;
}

export async function archiveCharacter(characterId: string) {
  const actor = await requireGM();
  const current = (await requireCharacterGM(characterId)).character;
  const archived = await prisma.$transaction(async (tx) => {
    const character = await tx.character.update({ where: { id: characterId }, data: { archivedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: current.workspaceId,
        characterId,
        entityType: "Character",
        entityId: characterId,
        action: "DELETE",
        oldValue: { name: current.name, description: current.description, ownerId: current.ownerId },
      },
    });
    return character;
  });
  revalidatePath("/");
  revalidatePath(`/characters/${characterId}`);
  return archived;
}

export async function restoreCharacter(characterId: string) {
  const actor = await requireGM();
  const current = (await requireCharacterGM(characterId, { archived: "archived" })).character;
  const restored = await prisma.$transaction(async (tx) => {
    const character = await tx.character.update({ where: { id: characterId }, data: { archivedAt: null } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: current.workspaceId,
        characterId,
        entityType: "Character",
        entityId: characterId,
        action: "UPDATE",
        fieldPath: "archivedAt",
        oldValue: { archivedAt: current.archivedAt },
        newValue: { archivedAt: null },
      },
    });
    return character;
  });
  revalidatePath("/");
  revalidatePath(`/characters/${characterId}`);
  return restored;
}

export async function addCharacterAssignment(input: { characterId: string; userId: string }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  await prisma.$transaction(async (tx) => {
    const member = await tx.workspaceMembership.findFirstOrThrow({
      where: { workspaceId: character.workspaceId, userId: input.userId, role: "PLAYER" },
      include: { user: true },
    });
    await tx.characterAssignment.upsert({
      where: { characterId_userId: { characterId: input.characterId, userId: input.userId } },
      create: { characterId: input.characterId, userId: input.userId, canView: true },
      update: { canView: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: character.workspaceId,
        characterId: input.characterId,
        entityType: "CharacterAssignment",
        entityId: input.userId,
        action: "ASSIGN",
        newValue: { userId: input.userId, label: member.user.name ?? member.user.email, canView: true },
      },
    });
  });
  revalidatePath("/");
  revalidatePath(`/characters/${input.characterId}`);
}

export async function removeCharacterAssignment(input: { characterId: string; userId: string }) {
  const actor = await requireGM();
  const scoped = await requireCharacterGM(input.characterId);
  await prisma.$transaction(async (tx) => {
    const character = scoped.character;
    const assignment = await tx.characterAssignment.findUnique({
      where: { characterId_userId: { characterId: input.characterId, userId: input.userId } },
      include: { user: true },
    });
    if (!assignment) return;
    await tx.characterAssignment.delete({ where: { characterId_userId: { characterId: input.characterId, userId: input.userId } } });
    if (character.ownerId === input.userId) {
      await tx.character.update({ where: { id: input.characterId }, data: { ownerId: null } });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: character.workspaceId,
        characterId: input.characterId,
        entityType: "CharacterAssignment",
        entityId: input.userId,
        action: "ASSIGN",
        oldValue: { userId: input.userId, label: assignment.user.name ?? assignment.user.email, canView: assignment.canView },
        newValue: { removed: true, ownerCleared: character.ownerId === input.userId },
      },
    });
  });
  revalidatePath("/");
  revalidatePath(`/characters/${input.characterId}`);
}

export async function createCharacterNode(input: {
  characterId: string;
  parentId?: string | null;
  type: NodeType;
  name: string;
  data: Prisma.InputJsonValue;
}) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const name = input.name.trim();
  if (!name) throw new Error("Node name is required");
  const data = parseNodeData(input.type, input.data) as Prisma.InputJsonValue;
  const parent = input.parentId ? await prisma.characterNode.findFirstOrThrow({ where: { id: input.parentId, characterId: input.characterId, archivedAt: null } }) : null;
  const count = await prisma.characterNode.count({ where: { characterId: input.characterId, parentId: input.parentId ?? null } });
  const path = parent ? `${parent.path}/${slugify(name)}` : slugify(name);
  const node = await prisma.characterNode.create({
    data: {
      characterId: input.characterId,
      parentId: input.parentId,
      type: input.type,
      name,
      slug: slugify(name),
      path,
      order: count,
      data
    }
  });

  await writeAudit({
    actorId: actor.id,
    workspaceId: character.workspaceId,
    characterId: input.characterId,
    entityType: "CharacterNode",
    entityId: node.id,
    action: "CREATE",
    newValue: { name: node.name, type: node.type, data }
  });

  revalidatePath(`/characters/${input.characterId}`);
  await reconcileStructuralEffects(input.characterId);
  return node;
}

export async function updateCharacterNode(input: {
  characterId: string;
  nodeId: string;
  name?: string;
  data?: unknown;
}) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const current = await prisma.characterNode.findFirstOrThrow({
    where: { id: input.nodeId, characterId: input.characterId, archivedAt: null }
  });
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("Node name is required");
  const nextPath = name
    ? `${current.path.includes("/") ? current.path.slice(0, current.path.lastIndexOf("/") + 1) : ""}${slugify(name)}`
    : current.path;
  const data = input.data === undefined
    ? undefined
    : parseNodeData(current.type, input.data) as Prisma.InputJsonValue;
  const node = await prisma.$transaction(async (tx) => {
    const updated = await tx.characterNode.update({
      where: { id: input.nodeId },
      data: { name, slug: name ? slugify(name) : undefined, path: nextPath, data }
    });
    if (nextPath !== current.path) {
      const descendants = await tx.characterNode.findMany({
        where: { characterId: current.characterId, path: { startsWith: `${current.path}/` } }
      });
      for (const descendant of descendants) {
        await tx.characterNode.update({
          where: { id: descendant.id },
          data: { path: `${nextPath}${descendant.path.slice(current.path.length)}` }
        });
      }
    }
    return updated;
  });

  await writeAudit({
    actorId: actor.id,
    workspaceId: character.workspaceId,
    characterId: current.characterId,
    entityType: "CharacterNode",
    entityId: current.id,
    action: "UPDATE",
    oldValue: { name: current.name, data: current.data },
    newValue: { name: node.name, data: node.data }
  });

  revalidatePath(`/characters/${current.characterId}`);
  await reconcileStructuralEffects(current.characterId);
  return node;
}

export async function deleteCharacterNode(input: { characterId: string; nodeId: string }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const current = await prisma.characterNode.findFirstOrThrow({
    where: { id: input.nodeId, characterId: input.characterId, archivedAt: null }
  });
  const activeNodes = await prisma.characterNode.findMany({
    where: { characterId: current.characterId, archivedAt: null },
    select: { id: true, parentId: true },
  });
  const archivedNodeIds = collectSubtreeIds(activeNodes, current.id);
  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.characterNode.updateMany({
      where: { characterId: current.characterId, id: { in: archivedNodeIds } },
      data: { archivedAt }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: character.workspaceId,
        characterId: current.characterId,
        entityType: "CharacterNode",
        entityId: current.id,
        action: "DELETE",
        oldValue: { name: current.name, type: current.type, data: current.data, archivedNodeIds }
      }
    });
  });
  revalidatePath(`/characters/${current.characterId}`);
  await reconcileStructuralEffects(current.characterId);
}

export async function restoreCharacterNode(input: { characterId: string; nodeId: string }) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  const current = await prisma.characterNode.findFirstOrThrow({
    where: { id: input.nodeId, characterId: input.characterId, archivedAt: { not: null } }
  });
  const nodes = await prisma.characterNode.findMany({
    where: { characterId: input.characterId },
    select: { id: true, parentId: true, archivedAt: true },
  });
  const parent = current.parentId ? nodes.find((node) => node.id === current.parentId) : null;
  if (parent?.archivedAt) {
    throw appError("BAD_REQUEST", "Restore the archived parent node first");
  }

  const restoredNodeIds = collectSubtreeIds(nodes, current.id);
  await prisma.$transaction(async (tx) => {
    await tx.characterNode.updateMany({
      where: { characterId: input.characterId, id: { in: restoredNodeIds } },
      data: { archivedAt: null },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: character.workspaceId,
        characterId: input.characterId,
        entityType: "CharacterNode",
        entityId: current.id,
        action: "UPDATE",
        fieldPath: "archivedAt",
        oldValue: { name: current.name, type: current.type, archivedAt: current.archivedAt, restoredNodeIds },
        newValue: { archivedAt: null },
      }
    });
  });

  revalidatePath("/");
  revalidatePath(`/characters/${input.characterId}`);
  await reconcileStructuralEffects(input.characterId);
}

export async function applyTemplateToCharacter(input: {
  characterId: string;
  templateId: string;
  parentNodeId?: string | null;
}) {
  const actor = await requireGM();
  const { character } = await requireCharacterGM(input.characterId);
  await prisma.entityTemplate.findFirstOrThrow({
    where: {
      id: input.templateId,
      archivedAt: null,
      OR: [{ workspaceId: character.workspaceId }, { workspaceId: null, isGlobal: true }],
    },
  });
  const result = await copyTemplateIntoCharacter(input);
  await reconcileStructuralEffects(input.characterId);

  await writeAudit({
    actorId: actor.id,
    workspaceId: character.workspaceId,
    characterId: input.characterId,
    entityType: "EntityTemplate",
    entityId: input.templateId,
    action: "APPLY_TEMPLATE",
    newValue: { copiedNodeIds: result.copiedNodeIds, parentNodeId: input.parentNodeId }
  });

  revalidatePath(`/characters/${input.characterId}`);
  return result;
}
