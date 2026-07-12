import { BriefcaseBusiness, CheckCircle2, Plus, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import type { WorkspaceRole } from "@prisma/client";
import { addWorkspaceMember, createWorkspace, removeWorkspaceMember, selectWorkspace, updateWorkspaceMember } from "@/server/actions/workspaces";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, getUserWorkspaces } from "@/server/authz";
import { requirePageGM } from "@/server/page-auth";
import { getTranslator } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type WorkspaceSearchParams = {
  workspaceError?: string;
};

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<WorkspaceSearchParams> }) {
  const user = await requirePageGM("/workspaces");
  const { t } = await getTranslator();
  const params = await searchParams;
  const [workspaces, activeWorkspace] = await Promise.all([
    getUserWorkspaces(user.id),
    getActiveWorkspace(user.id),
  ]);
  const activeMemberships = activeWorkspace
    ? await prisma.workspaceMembership.findMany({
      where: { workspaceId: activeWorkspace.id },
      include: { user: { select: { id: true, name: true, email: true, username: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    })
    : [];
  const canManageActiveWorkspace = activeWorkspace?.role === "OWNER";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("workspace.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("workspace.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("workspace.create")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWorkspace} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input name="name" required maxLength={200} placeholder={t("workspace.namePlaceholder")} />
            <Button type="submit">
              <Plus className="h-4 w-4" />
              {t("common.create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              {t("workspace.none")}
            </CardContent>
          </Card>
        ) : (
          workspaces.map((workspace) => (
            <Card key={workspace.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <BriefcaseBusiness className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{workspace.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>{workspaceRoleLabel(workspace.role, t)}</Badge>
                      {activeWorkspace?.id === workspace.id && (
                        <Badge className="bg-accent text-accent-foreground">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("workspace.activeBadge")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {activeWorkspace?.id === workspace.id ? (
                  <Button asChild variant="outline">
                    <Link href="/">{t("nav.dashboard")}</Link>
                  </Button>
                ) : (
                  <form action={selectWorkspace}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <Button type="submit" variant="outline">
                      {t("workspace.switch")}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {activeWorkspace && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("workspace.members")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="text-sm font-medium">{activeWorkspace.name}</div>
              <p className="text-sm text-muted-foreground">
                {canManageActiveWorkspace ? t("workspace.membersHelp") : t("workspace.ownerOnly")}
              </p>
            </div>

            {canManageActiveWorkspace && (
              <div className="space-y-3">
                {params.workspaceError && (
                  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {workspaceErrorLabel(params.workspaceError, t)}
                  </p>
                )}
                <form action={addWorkspaceMember} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_160px_auto]">
                  <input type="hidden" name="workspaceId" value={activeWorkspace.id} />
                  <Input name="identifier" type="text" required maxLength={320} placeholder={t("workspace.memberIdentifierPlaceholder")} />
                  <select
                    name="role"
                    defaultValue="PLAYER"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    aria-label={t("workspace.memberRole")}
                  >
                    <option value="PLAYER">{t("workspace.role.PLAYER")}</option>
                    <option value="GM">{t("workspace.role.GM")}</option>
                    <option value="OWNER">{t("workspace.role.OWNER")}</option>
                  </select>
                  <Button type="submit">
                    <Plus className="h-4 w-4" />
                    {t("workspace.addMember")}
                  </Button>
                </form>
              </div>
            )}

            <div className="space-y-3">
              {activeMemberships.map((membership) => (
                <div
                  key={membership.id}
                  className="flex flex-col gap-3 rounded-md border border-border p-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {membership.user.name || membership.user.email}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="truncate">@{membership.user.username}</span>
                      <span className="truncate">{membership.user.email}</span>
                      <Badge>{workspaceRoleLabel(membership.role, t)}</Badge>
                    </div>
                  </div>

                  {canManageActiveWorkspace ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <form action={updateWorkspaceMember} className="flex items-center gap-2">
                        <input type="hidden" name="workspaceId" value={activeWorkspace.id} />
                        <input type="hidden" name="membershipId" value={membership.id} />
                        <select
                          name="role"
                          defaultValue={membership.role}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          aria-label={t("workspace.memberRole")}
                        >
                          <option value="PLAYER">{t("workspace.role.PLAYER")}</option>
                          <option value="GM">{t("workspace.role.GM")}</option>
                          <option value="OWNER">{t("workspace.role.OWNER")}</option>
                        </select>
                        <Button type="submit" variant="outline" size="sm">
                          {t("workspace.updateRole")}
                        </Button>
                      </form>
                      <form action={removeWorkspaceMember} className="sm:ml-6">
                        <input type="hidden" name="workspaceId" value={activeWorkspace.id} />
                        <input type="hidden" name="membershipId" value={membership.id} />
                        <Button type="submit" variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10">
                          <UserMinus className="h-4 w-4" />
                          {t("workspace.removeMember")}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function workspaceRoleLabel(role: WorkspaceRole, t: Awaited<ReturnType<typeof getTranslator>>["t"]) {
  if (role === "OWNER") return t("workspace.role.OWNER");
  if (role === "GM") return t("workspace.role.GM");
  return t("workspace.role.PLAYER");
}

function workspaceErrorLabel(error: string, t: Awaited<ReturnType<typeof getTranslator>>["t"]) {
  if (error === "memberNotFound") return t("workspace.error.memberNotFound");
  if (error === "membershipNotFound") return t("workspace.error.membershipNotFound");
  if (error === "lastOwner") return t("workspace.error.lastOwner");
  return t("workspace.error.generic");
}
