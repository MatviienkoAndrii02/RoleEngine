import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageGM } from "@/server/page-auth";
import { getActiveWritableWorkspace, requireUserWorkspace } from "@/server/authz";
import { CreateCharacterForm } from "@/components/characters/create-character-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";
import { parseTemplateTagColor } from "@/domain/template-tags";

export default async function NewCharacterPage({ params }: { params: Promise<{ workspaceId?: string }> }) {
  const workspaceId = (await params)?.workspaceId;
  const user = await requirePageGM(workspaceId ? `/workspaces/${workspaceId}/characters/new` : "/characters/new");
  const { t } = await getTranslator();
  const activeWorkspace = workspaceId
    ? await requireUserWorkspace(user.id, workspaceId)
    : await getActiveWritableWorkspace(user.id);
  if (!workspaceId && activeWorkspace) redirect(`/workspaces/${activeWorkspace.id}/characters/new`);
  if (workspaceId && !activeWorkspace?.canWrite) notFound();
  const workspaceIds = activeWorkspace ? [activeWorkspace.id] : [];
  const [players, templates] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceMemberships: { some: { workspaceId: { in: workspaceIds }, role: "PLAYER" } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.entityTemplate.findMany({
      where: { archivedAt: null, OR: [{ workspaceId: { in: workspaceIds } }, { workspaceId: null, isGlobal: true }] },
      select: { id: true, name: true, isDefaultCharacter: true, tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } } },
      orderBy: { name: "asc" },
    })
  ]);
  const defaultTemplateId = templates.find((template) => template.isDefaultCharacter)?.id;

  return <div className="mx-auto max-w-2xl space-y-5" data-workspace-context={activeWorkspace?.id}>
    <Button asChild variant="ghost"><Link href={activeWorkspace ? `/workspaces/${activeWorkspace.id}` : "/"}><ArrowLeft className="h-4 w-4" />{t("createCharacter.back")}</Link></Button>
    <Card>
      <CardHeader><CardTitle>{t("createCharacter.title")}</CardTitle></CardHeader>
      <CardContent>
        <CreateCharacterForm
          players={players.map((player) => ({ id: player.id, name: player.name ?? player.email }))}
          templates={templates.map(({ id, name, tags }) => ({
            id,
            name,
            tags: tags.map((item) => ({ id: item.tag.id, name: item.tag.name, color: parseTemplateTagColor(item.tag.color) })),
          }))}
          defaultTemplateId={defaultTemplateId}
        />
      </CardContent>
    </Card>
  </div>;
}
