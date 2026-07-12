"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_WORKSPACE_COOKIE, requireUser, requireWorkspaceRole } from "@/server/authz";
import {
  addWorkspaceMemberCommandSchema,
  createWorkspaceCommandSchema,
  removeWorkspaceMemberCommandSchema,
  selectWorkspaceCommandSchema,
  updateWorkspaceMemberCommandSchema,
} from "@/domain/validation";

export async function selectWorkspace(formData: FormData) {
  const actor = await requireUser();
  const parsed = selectWorkspaceCommandSchema.parse({
    workspaceId: formData.get("workspaceId"),
  });
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.workspaceId, userId: actor.id } },
    include: { workspace: { select: { archivedAt: true } } },
  });
  if (!membership || membership.workspace.archivedAt) redirectWorkspaceError("membershipNotFound");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, parsed.workspaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/");
  revalidatePath("/templates");
  revalidatePath("/workspaces");
  redirect("/");
}

export async function createWorkspace(formData: FormData) {
  const actor = await requireUser();
  const parsed = createWorkspaceCommandSchema.parse({
    name: formData.get("name"),
  });
  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        name: parsed.name,
        ownerId: actor.id,
        memberships: {
          create: { userId: actor.id, role: "OWNER" },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        workspaceId: created.id,
        entityType: "Workspace",
        entityId: created.id,
        action: "CREATE",
        newValue: { name: created.name },
      },
    });
    return created;
  });
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/");
  revalidatePath("/templates");
  revalidatePath("/workspaces");
  redirect("/workspaces");
}

export async function addWorkspaceMember(formData: FormData) {
  const parsed = addWorkspaceMemberCommandSchema.parse({
    workspaceId: formData.get("workspaceId"),
    identifier: formData.get("identifier"),
    role: formData.get("role"),
  });
  const { user: actor } = await requireWorkspaceRole(parsed.workspaceId, ["OWNER"]);
  const targetUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: parsed.identifier },
        { usernameKey: parsed.identifier },
      ],
    },
    select: { id: true, email: true, username: true },
  });
  if (!targetUser) redirectWorkspaceError("memberNotFound");
  const existing = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.workspaceId, userId: targetUser.id } },
  });
  if (existing?.role === "OWNER" && parsed.role !== "OWNER") {
    await redirectIfLastOwner(parsed.workspaceId, existing.id);
  }

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.workspaceMembership.update({
        where: { id: existing.id },
        data: { role: parsed.role },
      });
      await writeWorkspaceMembershipAudit(tx, {
        actorId: actor.id,
        workspaceId: parsed.workspaceId,
        membershipId: existing.id,
        action: "UPDATE",
        oldValue: { userId: targetUser.id, email: targetUser.email, username: targetUser.username, role: existing.role },
        newValue: { userId: targetUser.id, email: targetUser.email, username: targetUser.username, role: parsed.role },
      });
      return;
    }

    const created = await tx.workspaceMembership.create({
      data: { workspaceId: parsed.workspaceId, userId: targetUser.id, role: parsed.role },
    });
    await writeWorkspaceMembershipAudit(tx, {
      actorId: actor.id,
      workspaceId: parsed.workspaceId,
      membershipId: created.id,
      action: "ASSIGN",
      oldValue: null,
      newValue: { userId: targetUser.id, email: targetUser.email, username: targetUser.username, role: parsed.role },
    });
  });

  revalidatePath("/workspaces");
  revalidatePath("/");
  redirect("/workspaces");
}

export async function updateWorkspaceMember(formData: FormData) {
  const parsed = updateWorkspaceMemberCommandSchema.parse({
    workspaceId: formData.get("workspaceId"),
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  const { user: actor } = await requireWorkspaceRole(parsed.workspaceId, ["OWNER"]);
  const membership = await prisma.workspaceMembership.findFirst({
    where: { id: parsed.membershipId, workspaceId: parsed.workspaceId },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  if (!membership) redirectWorkspaceError("membershipNotFound");
  if (membership.role === "OWNER" && parsed.role !== "OWNER") {
    await redirectIfLastOwner(parsed.workspaceId, membership.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMembership.update({
      where: { id: membership.id },
      data: { role: parsed.role },
    });
    await writeWorkspaceMembershipAudit(tx, {
      actorId: actor.id,
      workspaceId: parsed.workspaceId,
      membershipId: membership.id,
      action: "UPDATE",
      oldValue: { userId: membership.userId, email: membership.user.email, username: membership.user.username, role: membership.role },
      newValue: { userId: membership.userId, email: membership.user.email, username: membership.user.username, role: parsed.role },
    });
  });

  revalidatePath("/workspaces");
  revalidatePath("/");
  redirect("/workspaces");
}

export async function removeWorkspaceMember(formData: FormData) {
  const parsed = removeWorkspaceMemberCommandSchema.parse({
    workspaceId: formData.get("workspaceId"),
    membershipId: formData.get("membershipId"),
  });
  const { user: actor } = await requireWorkspaceRole(parsed.workspaceId, ["OWNER"]);
  const membership = await prisma.workspaceMembership.findFirst({
    where: { id: parsed.membershipId, workspaceId: parsed.workspaceId },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  if (!membership) redirectWorkspaceError("membershipNotFound");
  if (membership.role === "OWNER") {
    await redirectIfLastOwner(parsed.workspaceId, membership.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.characterAssignment.deleteMany({
      where: { userId: membership.userId, character: { workspaceId: parsed.workspaceId } },
    });
    await tx.character.updateMany({
      where: { workspaceId: parsed.workspaceId, ownerId: membership.userId },
      data: { ownerId: null },
    });
    await tx.workspaceMembership.delete({ where: { id: membership.id } });
    await writeWorkspaceMembershipAudit(tx, {
      actorId: actor.id,
      workspaceId: parsed.workspaceId,
      membershipId: membership.id,
      action: "DELETE",
      oldValue: { userId: membership.userId, email: membership.user.email, username: membership.user.username, role: membership.role },
      newValue: null,
    });
  });

  revalidatePath("/workspaces");
  revalidatePath("/");
  redirect("/workspaces");
}

type WorkspaceFormError =
  | "memberNotFound"
  | "membershipNotFound"
  | "lastOwner";

function redirectWorkspaceError(error: WorkspaceFormError): never {
  redirect(`/workspaces?workspaceError=${error}`);
}

async function redirectIfLastOwner(workspaceId: string, membershipId: string) {
  const otherOwners = await prisma.workspaceMembership.count({
    where: { workspaceId, role: "OWNER", id: { not: membershipId } },
  });
  if (otherOwners === 0) redirectWorkspaceError("lastOwner");
}

async function writeWorkspaceMembershipAudit(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    workspaceId: string;
    membershipId: string;
    action: "ASSIGN" | "UPDATE" | "DELETE";
    oldValue: Prisma.InputJsonValue | null;
    newValue: Prisma.InputJsonValue | null;
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      entityType: "WorkspaceMembership",
      entityId: input.membershipId,
      action: input.action,
      oldValue: input.oldValue === null ? Prisma.JsonNull : input.oldValue,
      newValue: input.newValue === null ? Prisma.JsonNull : input.newValue,
    },
  });
}
