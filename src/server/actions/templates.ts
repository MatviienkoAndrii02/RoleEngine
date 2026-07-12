"use server";

import type { Prisma, TemplateKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGM, requirePrimaryWritableWorkspace, requireTemplateGM } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { slugify } from "@/server/template-copy";
import { parseNodeData } from "@/domain/validation";

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

export async function updateTemplateNode(input: { templateId: string; nodeId: string; name?: string; data?: unknown }) {
  const actor = await requireGM();
  const { template } = await requireTemplateGM(input.templateId);
  const current = await prisma.templateNode.findFirstOrThrow({
    where: { id: input.nodeId, templateId: input.templateId }
  });
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("Node name is required");
  const nextPath = name ? `${current.path.includes("/") ? current.path.slice(0, current.path.lastIndexOf("/") + 1) : ""}${slugify(name)}` : current.path;
  const data = input.data === undefined
    ? undefined
    : parseNodeData(current.type, input.data) as Prisma.InputJsonValue;
  const node = await prisma.$transaction(async (tx) => {
    const updated = await tx.templateNode.update({ where: { id: current.id }, data: { name, slug: name ? slugify(name) : undefined, path: nextPath, data } });
    if (nextPath !== current.path) {
      const descendants = await tx.templateNode.findMany({ where: { templateId: current.templateId, path: { startsWith: `${current.path}/` } } });
      for (const descendant of descendants) await tx.templateNode.update({ where: { id: descendant.id }, data: { path: `${nextPath}${descendant.path.slice(current.path.length)}` } });
    }
    return updated;
  });
  await writeAudit({ actorId: actor.id, workspaceId: template.workspaceId, entityType: "TemplateNode", entityId: node.id, action: "UPDATE", oldValue: { name: current.name, data: current.data }, newValue: { name: node.name, data: node.data } });
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
