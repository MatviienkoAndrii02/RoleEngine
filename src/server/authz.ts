import { auth } from "@/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/server/errors";
import type { WorkspaceRole } from "@prisma/client";

const writableWorkspaceRoles: WorkspaceRole[] = ["OWNER", "GM"];
export const ACTIVE_WORKSPACE_COOKIE = "role-engine-workspace";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();
  return session.user;
}

export async function requireGM() {
  return requireUser();
}

export async function getWritableWorkspaceIds(userId: string) {
  const workspaces = await getWritableWorkspaces(userId);
  return workspaces.map((workspace) => workspace.id);
}

export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId, workspace: { archivedAt: null } },
    select: {
      role: true,
      workspace: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
    canWrite: writableWorkspaceRoles.includes(membership.role),
  }));
}

export async function getWritableWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId, role: { in: writableWorkspaceRoles }, workspace: { archivedAt: null } },
    select: {
      role: true,
      workspace: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
  }));
}

export async function getActiveWorkspace(userId: string) {
  const workspaces = await getUserWorkspaces(userId);
  if (!workspaces.length) return null;
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0] ?? null;
}

export async function getActiveWritableWorkspace(userId: string) {
  const workspace = await getActiveWorkspace(userId);
  if (workspace?.canWrite) return workspace;
  return null;
}

export async function requirePrimaryWritableWorkspace(userId: string) {
  const workspace = await getActiveWritableWorkspace(userId);
  if (!workspace) throw forbidden();
  return workspace.id;
}

export async function requireWorkspaceRole(workspaceId: string, roles: WorkspaceRole[]) {
  const user = await requireUser();
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: { select: { archivedAt: true } } },
  });
  if (!membership || membership.workspace.archivedAt || !roles.includes(membership.role)) throw forbidden();
  return { user, membership };
}

export async function requireCharacterGM(characterId: string, options: { archived?: "active" | "archived" | "any" } = {}) {
  const user = await requireUser();
  const archived = options.archived ?? "active";
  const character = await prisma.character.findFirstOrThrow({
    where: {
      id: characterId,
      ...(archived === "active" ? { archivedAt: null } : archived === "archived" ? { archivedAt: { not: null } } : {}),
      workspace: {
        archivedAt: null,
        memberships: { some: { userId: user.id, role: { in: writableWorkspaceRoles } } },
      },
    },
  });
  return { user, character };
}

export async function requireTemplateGM(templateId: string, options: { archived?: "active" | "archived" | "any" } = {}) {
  const user = await requireUser();
  const archived = options.archived ?? "active";
  const template = await prisma.entityTemplate.findFirstOrThrow({
    where: {
      id: templateId,
      ...(archived === "active" ? { archivedAt: null } : archived === "archived" ? { archivedAt: { not: null } } : {}),
      workspace: {
        archivedAt: null,
        memberships: { some: { userId: user.id, role: { in: writableWorkspaceRoles } } },
      },
    },
  });
  return { user, template };
}

export async function canReadCharacter(characterId: string) {
  const user = await requireUser();
  const readable = await prisma.character.findFirst({
    where: {
      id: characterId,
      workspace: {
        archivedAt: null,
        memberships: {
          some: {
            userId: user.id,
            OR: [
              { role: { in: writableWorkspaceRoles } },
              { role: "PLAYER", user: { characterAccess: { some: { characterId, canView: true } } } },
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  if (!readable) throw forbidden();
  return user;
}
