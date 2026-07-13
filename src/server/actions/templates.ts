"use server";

import type { Prisma, TemplateKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGM, requirePrimaryWritableWorkspace, requireTemplateGM } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { slugify } from "@/server/template-copy";
import { parseNodeData } from "@/domain/validation";
import { collectSubtreeIds } from "@/domain/tree";
import { appError } from "@/server/errors";

export async function createTemplate(input: {
  kind: TemplateKind;
  name: string;
  description?: string;
  isDefaultCharacter?: boolean;
}) {
  const actor = await requireGM();
  const workspaceId = await requirePrimaryWritableWorkspace(actor.id);
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");
  if (input.isDefaultCharacter && input.kind !== "CHARACTER") throw new Error("Only a character template can be the default");

  if (input.isDefaultCharacter) {
    await prisma.entityTemplate.updateMany({
      where: { workspaceId, isDefaultCharacter: true },
      data: { isDefaultCharacter: false }
    });
  }

  const template = await prisma.entityTemplate.create({
    data: {
      kind: input.kind,
      workspaceId,
      name,
      description: input.description?.trim() || null,
      isGlobal: false,
      isDefaultCharacter: input.isDefaultCharacter ?? false,
      createdById: actor.id
    }
  });

  await writeAudit({
    actorId: actor.id,
    workspaceId,
    entityType: "EntityTemplate",
    entityId: template.id,
    action: "CREATE",
    newValue: { name, kind: input.kind }
  });

  revalidatePath("/templates");
  return template;
}

export async function createTemplateNode(input: {
  templateId: string;
  parentId?: string | null;
  type: "NUMBER" | "BAR" | "TEXT" | "TABLE" | "CONTAINER" | "GROUP";
  name: string;
  data: Prisma.InputJsonValue;
}) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const name = input.name.trim();
  if (!name) throw new Error("Node name is required");
  const data = parseNodeData(input.type, input.data) as Prisma.InputJsonValue;
  const parent = input.parentId ? await prisma.templateNode.findFirstOrThrow({ where: { id: input.parentId, templateId: input.templateId } }) : null;
  const count = await prisma.templateNode.count({ where: { templateId: input.templateId, parentId: input.parentId ?? null } });
  const path = parent ? `${parent.path}/${slugify(name)}` : slugify(name);
  const node = await prisma.templateNode.create({
    data: {
      templateId: input.templateId,
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
    workspaceId: template.workspaceId,
    entityType: "TemplateNode",
    entityId: node.id,
    action: "CREATE",
    newValue: { name: input.name, type: input.type, data }
  });

  revalidatePath("/templates");
  return node;
}

export async function updateTemplate(input: { templateId: string; name?: string; description?: string; isDefaultCharacter?: boolean }) {
  const actor = await requireGM();
  const current = (await requireTemplateGM(input.templateId)).template;
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("Template name is required");
  if (input.isDefaultCharacter && current.kind !== "CHARACTER") throw new Error("Only a character template can be the default");
  const template = await prisma.$transaction(async (tx) => {
    if (input.isDefaultCharacter) await tx.entityTemplate.updateMany({ where: { workspaceId: current.workspaceId, isDefaultCharacter: true }, data: { isDefaultCharacter: false } });
    return tx.entityTemplate.update({ where: { id: input.templateId }, data: { name, description: input.description !== undefined ? input.description.trim() || null : undefined, isDefaultCharacter: input.isDefaultCharacter } });
  });
  await writeAudit({ actorId: actor.id, workspaceId: current.workspaceId, entityType: "EntityTemplate", entityId: template.id, action: "UPDATE", oldValue: { name: current.name, description: current.description }, newValue: { name: template.name, description: template.description } });
  revalidatePath("/templates");
  revalidatePath(`/templates/${template.id}`);
  return template;
}

export async function archiveTemplate(templateId: string) {
  const actor = await requireGM();
  await requireTemplateGM(templateId);
  const template = await prisma.entityTemplate.update({ where: { id: templateId }, data: { archivedAt: new Date(), isDefaultCharacter: false } });
  await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "EntityTemplate", entityId: template.id, action: "DELETE", oldValue: { name: template.name, kind: template.kind } });
  revalidatePath("/templates");
}

export async function updateTemplateNode(input: { templateId: string; nodeId: string; name?: string; parentId?: string | null; data?: unknown }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const current = await prisma.templateNode.findFirstOrThrow({
    where: { id: input.nodeId, templateId: input.templateId }
  });
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("Node name is required");
  const data = input.data === undefined
    ? undefined
    : parseNodeData(current.type, input.data) as Prisma.InputJsonValue;
  const parentChanged = input.parentId !== undefined && input.parentId !== current.parentId;
  const nextParentId = input.parentId === undefined ? current.parentId : input.parentId;
  const allNodes = await prisma.templateNode.findMany({
    where: { templateId: current.templateId },
    select: { id: true, parentId: true },
  });
  const subtreeIds = collectSubtreeIds(allNodes, current.id);
  if (nextParentId && subtreeIds.includes(nextParentId)) {
    throw appError("BAD_REQUEST", "A node cannot be moved inside itself or its descendants");
  }
  const nextParent = nextParentId
    ? await prisma.templateNode.findFirstOrThrow({ where: { id: nextParentId, templateId: input.templateId } })
    : null;
  const nextSlug = name ? slugify(name) : current.slug ?? slugify(current.name);
  const nextPath = nextParent ? `${nextParent.path}/${nextSlug}` : nextSlug;
  const node = await prisma.$transaction(async (tx) => {
    const order = parentChanged
      ? await tx.templateNode.count({ where: { templateId: current.templateId, parentId: nextParentId ?? null } })
      : undefined;
    const updated = await tx.templateNode.update({ where: { id: current.id }, data: { name, parentId: parentChanged ? nextParentId : undefined, slug: name ? nextSlug : undefined, path: nextPath, order, data } });
    if (nextPath !== current.path) {
      const descendantIds = subtreeIds.filter((id) => id !== current.id);
      const descendants = await tx.templateNode.findMany({ where: { templateId: current.templateId, id: { in: descendantIds } } });
      for (const descendant of descendants) await tx.templateNode.update({ where: { id: descendant.id }, data: { path: `${nextPath}${descendant.path.slice(current.path.length)}` } });
    }
    return updated;
  });
  await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "TemplateNode", entityId: node.id, action: "UPDATE", oldValue: { name: current.name, parentId: current.parentId, data: current.data }, newValue: { name: node.name, parentId: node.parentId, data: node.data } });
  revalidatePath(`/templates/${current.templateId}`);
  return node;
}

export async function deleteTemplateNode(input: { templateId: string; nodeId: string }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const current = await prisma.templateNode.findFirstOrThrow({
    where: { id: input.nodeId, templateId: input.templateId }
  });
  await prisma.templateNode.delete({ where: { id: input.nodeId } });
  await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "TemplateNode", entityId: input.nodeId, action: "DELETE", oldValue: { name: current.name, type: current.type, data: current.data } });
  revalidatePath(`/templates/${current.templateId}`);
}

export async function createTemplateSlot(input: {
  templateId: string;
  key: string;
  label: string;
  description?: string;
  direction: "INPUT" | "OUTPUT" | "BIDIRECTIONAL";
  acceptedTypes: Array<"NUMBER" | "BAR" | "TEXT" | "TABLE" | "CONTAINER" | "GROUP">;
  required?: boolean;
}) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const slot = await prisma.templateSlot.create({
    data: {
      templateId: input.templateId,
      key: input.key.trim(),
      label: input.label.trim(),
      description: input.description?.trim() || null,
      direction: input.direction,
      acceptedTypes: input.acceptedTypes,
      required: input.required ?? true,
    },
  });
  await writeAudit({
    actorId: actor.id,
    workspaceId: template.workspaceId,
    entityType: "TemplateSlot",
    entityId: slot.id,
    action: "CREATE",
    newValue: { key: slot.key, label: slot.label, direction: slot.direction, acceptedTypes: slot.acceptedTypes, required: slot.required },
  });
  revalidatePath(`/templates/${input.templateId}`);
  return slot;
}

export async function updateTemplateSlot(input: {
  templateId: string;
  slotId: string;
  key?: string;
  label?: string;
  description?: string | null;
  direction?: "INPUT" | "OUTPUT" | "BIDIRECTIONAL";
  acceptedTypes?: Array<"NUMBER" | "BAR" | "TEXT" | "TABLE" | "CONTAINER" | "GROUP">;
  required?: boolean;
}) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const current = await prisma.templateSlot.findFirstOrThrow({ where: { id: input.slotId, templateId: input.templateId } });
  const updated = await prisma.templateSlot.update({
    where: { id: input.slotId },
    data: {
      key: input.key?.trim(),
      label: input.label?.trim(),
      description: input.description !== undefined ? input.description?.trim() || null : undefined,
      direction: input.direction,
      acceptedTypes: input.acceptedTypes,
      required: input.required,
    },
  });
  await writeAudit({
    actorId: actor.id,
    workspaceId: template.workspaceId,
    entityType: "TemplateSlot",
    entityId: input.slotId,
    action: "UPDATE",
    oldValue: { key: current.key, label: current.label, description: current.description, direction: current.direction, acceptedTypes: current.acceptedTypes, required: current.required },
    newValue: { key: updated.key, label: updated.label, description: updated.description, direction: updated.direction, acceptedTypes: updated.acceptedTypes, required: updated.required },
  });
  revalidatePath(`/templates/${input.templateId}`);
  return updated;
}

export async function deleteTemplateSlot(input: { templateId: string; slotId: string }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const current = await prisma.templateSlot.findFirstOrThrow({ where: { id: input.slotId, templateId: input.templateId } });
  await prisma.templateSlot.delete({ where: { id: input.slotId } });
  await writeAudit({
    actorId: actor.id,
    workspaceId: template.workspaceId,
    entityType: "TemplateSlot",
    entityId: input.slotId,
    action: "DELETE",
    oldValue: { key: current.key, label: current.label, direction: current.direction, acceptedTypes: current.acceptedTypes, required: current.required },
  });
  revalidatePath(`/templates/${input.templateId}`);
}
