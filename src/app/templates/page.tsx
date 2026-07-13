import { Plus } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateArchiveActions } from "@/components/templates/template-archive-actions";
import { requirePageGM } from "@/server/page-auth";
import { getActiveWritableWorkspace } from "@/server/authz";
import { getTranslator } from "@/i18n/server";

export default async function TemplatesPage({ searchParams }: { searchParams?: Promise<{ archived?: string }> }) {
  const user = await requirePageGM("/templates");
  const params = await searchParams;
  const { t } = await getTranslator();
  const showArchived = params?.archived === "1";
  const activeWorkspace = await getActiveWritableWorkspace(user.id);
  const workspaceIds = activeWorkspace ? [activeWorkspace.id] : [];
  const templates = await prisma.entityTemplate
    .findMany({
      where: {
        archivedAt: showArchived ? { not: null } : null,
        OR: showArchived
          ? [{ workspaceId: { in: workspaceIds } }]
          : [{ workspaceId: { in: workspaceIds } }, { workspaceId: null, isGlobal: true }],
      },
      include: { _count: { select: { nodes: true, effects: true } } },
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    })
    .catch(() => []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.templates")}</h1>
          <p className="text-sm text-muted-foreground">{showArchived ? t("template.archivedSubtitle") : t("template.listSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={showArchived ? "outline" : "ghost"}><Link href={showArchived ? "/templates" : "/templates?archived=1"}>
            {showArchived ? t("template.activeTemplates") : t("template.archivedTemplates")}
          </Link></Button>
          {!showArchived && <Button asChild><Link href="/templates/new">
            <Plus className="h-4 w-4" />
            {t("template.new")}
          </Link></Button>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{showArchived ? t("template.noArchivedTemplatesTitle") : t("template.noTemplatesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {showArchived ? t("template.noArchivedTemplatesBody") : t("template.noTemplatesBody")}
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            showArchived ? (
              <Card key={template.id} className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{template.name}</CardTitle>
                    <Badge>{template.kind.toLowerCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{template.description ?? t("common.noDescription")}</p>
                  <div className="flex gap-2">
                    <Badge>{t("dashboard.nodes", { count: template._count.nodes })}</Badge>
                    <Badge>{t("dashboard.effects", { count: template._count.effects })}</Badge>
                  </div>
                  <TemplateArchiveActions templateId={template.id} name={template.name} />
                </CardContent>
              </Card>
            ) : (
              <Link key={template.id} href={`/templates/${template.id}`}><Card className="h-full transition-colors hover:bg-muted/60">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{template.name}</CardTitle>
                  <Badge>{template.kind.toLowerCase()}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{template.description ?? t("common.noDescription")}</p>
                <div className="flex gap-2">
                  <Badge>{t("dashboard.nodes", { count: template._count.nodes })}</Badge>
                  <Badge>{t("dashboard.effects", { count: template._count.effects })}</Badge>
                  {template.isDefaultCharacter && <Badge className="bg-accent text-accent-foreground">{t("template.defaultCharacter")}</Badge>}
                </div>
              </CardContent>
            </Card></Link>
            )
          ))
        )}
      </div>
    </div>
  );
}
