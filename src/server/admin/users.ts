import { isUserOnline } from "@/domain/user-presence";
import type { AdminUserSummary, AdminUsersResponse } from "@/domain/admin-console";
import { prisma } from "@/lib/prisma";

type UserCounts = Pick<AdminUserSummary, "createdWorkspaceCount" | "memberWorkspaceCount" | "characterCount" | "templateCount">;

export async function getAdminUsers(now = new Date()): Promise<AdminUsersResponse> {
  const [users, workspaces] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, username: true, createdAt: true, lastSeenAt: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.workspace.findMany({
      where: { archivedAt: null },
      select: {
        ownerId: true,
        memberships: { select: { userId: true } },
        _count: {
          select: {
            characters: { where: { archivedAt: null } },
            templates: { where: { archivedAt: null } },
          },
        },
      },
    }),
  ]);

  const counts = new Map<string, UserCounts>(users.map((user) => [user.id, {
    createdWorkspaceCount: 0,
    memberWorkspaceCount: 0,
    characterCount: 0,
    templateCount: 0,
  }]));

  for (const workspace of workspaces) {
    if (workspace.ownerId) {
      const ownerCounts = counts.get(workspace.ownerId);
      if (ownerCounts) {
        ownerCounts.createdWorkspaceCount += 1;
        ownerCounts.characterCount += workspace._count.characters;
        ownerCounts.templateCount += workspace._count.templates;
      }
    }

    for (const membership of workspace.memberships) {
      const memberCounts = counts.get(membership.userId);
      if (memberCounts) memberCounts.memberWorkspaceCount += 1;
    }
  }

  const resultUsers = users.map((user): AdminUserSummary => ({
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    online: isUserOnline(user.lastSeenAt, now),
    ...(counts.get(user.id) ?? {
      createdWorkspaceCount: 0,
      memberWorkspaceCount: 0,
      characterCount: 0,
      templateCount: 0,
    }),
  }));

  resultUsers.sort((left, right) => Number(right.online) - Number(left.online)
    || (right.lastSeenAt ?? "").localeCompare(left.lastSeenAt ?? "")
    || left.email.localeCompare(right.email));

  return {
    generatedAt: now.toISOString(),
    onlineWindowSeconds: 300,
    users: resultUsers,
  };
}
