import { auth } from "@/auth";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { appError, forbidden, unauthorized } from "@/server/errors";
import type { WorkspaceRole } from "@prisma/client";
import { REQUEST_WORKSPACE_HEADER } from "@/domain/workspace-context";

const writableWorkspaceRoles: WorkspaceRole[] = ["OWNER", "GM"];
export const ACTIVE_WORKSPACE_COOKIE = "role-engine-workspace";
export { REQUEST_WORKSPACE_HEADER } from "@/domain/workspace-context";

type SessionLike = { user?: { id: string } | null } | null;

export async function requireUser(sessionOverride?: SessionLike): Promise<{ id: string }> {
  const session = sessionOverride ?? (await auth());
  if (!session?.user?.id) throw unauthorized();
  return { id: session.user.id };
}

export async function requireGM(sessionOverride?: SessionLike): Promise<{ id: string }> {
  return requireUser(sessionOverride);
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

export async function getRequestWorkspaceId() {
  try {
    return (await headers()).get(REQUEST_WORKSPACE_HEADER);
  } catch {
    return null;
  }
}

export async function requireUserWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { id: true, name: true, archivedAt: true } } },
  });
  if (!membership || membership.workspace.archivedAt) throw appError("NOT_FOUND", "Workspace not found", 404);
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
    canWrite: writableWorkspaceRoles.includes(membership.role),
  };
}

export function assertWorkspaceRoleMembership(
  workspaceId: string,
  membership: { workspaceId: string; role: WorkspaceRole; workspace?: { archivedAt: Date | null } | null } | null,
  allowedRoles: WorkspaceRole[],
) {
  if (!membership || membership.workspaceId !== workspaceId || membership.workspace?.archivedAt || !allowedRoles.includes(membership.role)) {
    throw forbidden();
  }
  return membership;
}

export async function assertUserHasWorkspaceRole(userId: string, workspaceId: string, allowedRoles: WorkspaceRole[]) {
  if (!workspaceId) throw forbidden();
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { archivedAt: true } } },
  });
  return assertWorkspaceRoleMembership(workspaceId, membership, allowedRoles);
}

export async function requirePrimaryWritableWorkspace(userId: string) {
  const requestWorkspaceId = await getRequestWorkspaceId();
  if (requestWorkspaceId) {
    await assertUserHasWorkspaceRole(userId, requestWorkspaceId, writableWorkspaceRoles);
    return requestWorkspaceId;
  }
  const workspace = await getActiveWritableWorkspace(userId);
  if (!workspace) throw forbidden();
  return workspace.id;
}

export async function requireWorkspaceRole(workspaceId: string, roles: WorkspaceRole[], sessionOverride?: SessionLike) {
  const user = await requireUser(sessionOverride);
  const membership = await assertUserHasWorkspaceRole(user.id, workspaceId, roles);
  return { user, membership };
}

export async function requireCharacterGM(characterId: string, options: { archived?: "active" | "archived" | "any"; workspaceId?: string } = {}, sessionOverride?: SessionLike) {
  const user = await requireUser(sessionOverride);
  const archived = options.archived ?? "active";
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { workspace: { select: { archivedAt: true } } },
  });

  if (!character || (options.workspaceId && character.workspaceId !== options.workspaceId)) throw appError("NOT_FOUND", "Character not found", 404);
  const requestWorkspaceId = await getRequestWorkspaceId();
  if (requestWorkspaceId && character.workspaceId !== requestWorkspaceId) throw appError("NOT_FOUND", "Character not found", 404);
  if (archived === "active" && character.archivedAt) throw appError("NOT_FOUND", "Character not found", 404);
  if (archived === "archived" && !character.archivedAt) throw appError("NOT_FOUND", "Character not found", 404);
  if (character.workspace.archivedAt) throw forbidden();

  await assertUserHasWorkspaceRole(user.id, character.workspaceId, writableWorkspaceRoles);
  return { user, character };
}

export async function requireTemplateGM(templateId: string, options: { archived?: "active" | "archived" | "any"; workspaceId?: string } = {}, sessionOverride?: SessionLike) {
  const user = await requireUser(sessionOverride);
  const archived = options.archived ?? "active";
  const template = await prisma.entityTemplate.findUnique({
    where: { id: templateId },
    include: { workspace: { select: { archivedAt: true } } },
  });

  if (!template || (options.workspaceId && template.workspaceId !== options.workspaceId)) throw appError("NOT_FOUND", "Template not found", 404);
  const requestWorkspaceId = await getRequestWorkspaceId();
  if (requestWorkspaceId && template.workspaceId !== requestWorkspaceId) throw appError("NOT_FOUND", "Template not found", 404);
  if (archived === "active" && template.archivedAt) throw appError("NOT_FOUND", "Template not found", 404);
  if (archived === "archived" && !template.archivedAt) throw appError("NOT_FOUND", "Template not found", 404);
  if (!template.workspaceId) throw forbidden();
  if (template.workspace?.archivedAt) throw forbidden();

  await assertUserHasWorkspaceRole(user.id, template.workspaceId, writableWorkspaceRoles);
  return { user, template };
}

export async function canReadCharacter(characterId: string, workspaceId?: string) {
  const user = await requireUser();
  const requestWorkspaceId = await getRequestWorkspaceId();
  if (requestWorkspaceId && workspaceId && requestWorkspaceId !== workspaceId) throw forbidden();
  const effectiveWorkspaceId = workspaceId ?? requestWorkspaceId ?? undefined;
  const readable = await prisma.character.findFirst({
    where: {
      id: characterId,
      ...(effectiveWorkspaceId ? { workspaceId: effectiveWorkspaceId } : {}),
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
