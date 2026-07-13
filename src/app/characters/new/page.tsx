import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageGM } from "@/server/page-auth";
import { getActiveWritableWorkspace } from "@/server/authz";
import { CreateCharacterForm } from "@/components/characters/create-character-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function NewCharacterPage() {
  const user = await requirePageGM("/characters/new");
  const { t } = await getTranslator();
  const activeWorkspace = await getActiveWritableWorkspace(user.id);
  const workspaceIds = activeWorkspace ? [activeWorkspace.id] : [];
  const [players, templates] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceMemberships: { some: { workspaceId: { in: workspaceIds }, role: "PLAYER" } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.entityTemplate.findMany({
      where: { archivedAt: null, OR: [{ workspaceId: { in: workspaceIds } }, { workspaceId: null, isGlobal: true }] },
      select: { id: true, name: true, isDefaultCharacter: true },
      orderBy: { name: "asc" },
    })
  ]);
  const defaultTemplateId = templates.find((template) => template.isDefaultCharacter)?.id;

  return <div className="mx-auto max-w-2xl space-y-5">
    <Button asChild variant="ghost"><Link href="/"><ArrowLeft className="h-4 w-4" />{t("createCharacter.back")}</Link></Button>
    <Card>
      <CardHeader><CardTitle>{t("createCharacter.title")}</CardTitle></CardHeader>
      <CardContent>
        <CreateCharacterForm
          players={players.map((player) => ({ id: player.id, name: player.name ?? player.email }))}
          templates={templates.map(({ id, name }) => ({ id, name }))}
          defaultTemplateId={defaultTemplateId}
        />
      </CardContent>
    </Card>
  </div>;
}
