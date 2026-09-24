import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateArchiveActions } from "@/components/templates/template-archive-actions";
import { requirePageGM } from "@/server/page-auth";
import { getActiveWritableWorkspace, requireUserWorkspace } from "@/server/authz";
import { getTranslator } from "@/i18n/server";
import { templateTagColorClass } from "@/domain/template-tags";

export default async function TemplatesPage({ params, searchParams }: { params?: Promise<{ workspaceId?: string }>; searchParams?: Promise<{ archived?: string }> }) {
  const routeParams = await params;
  const workspaceId = routeParams?.workspaceId;
  const user = await requirePageGM(workspaceId ? `/workspaces/${workspaceId}/templates` : "/templates");
  const queryParams = await searchParams;
  const { t } = await getTranslator();
  const showArchived = queryParams?.archived === "1";
  const activeWorkspace = workspaceId
    ? await requireUserWorkspace(user.id, workspaceId)
    : await getActiveWritableWorkspace(user.id);
  const writableWorkspace = activeWorkspace?.canWrite ? activeWorkspace : null;
  if (!workspaceId && writableWorkspace) redirect(`/workspaces/${writableWorkspace.id}/templates${showArchived ? "?archived=1" : ""}`);
  const workspaceIds = writableWorkspace ? [writableWorkspace.id] : [];
  const templates = await prisma.entityTemplate
    .findMany({
      where: {
        archivedAt: showArchived ? { not: null } : null,
        OR: showArchived
          ? [{ workspaceId: { in: workspaceIds } }]
          : [{ workspaceId: { in: workspaceIds } }, { workspaceId: null, isGlobal: true }],
      },
      include: { tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }, _count: { select: { nodes: true, effects: true } } },
      orderBy: [{ name: "asc" }]
    })
    .catch(() => []);

  return (
    <div className="space-y-6" data-workspace-context={writableWorkspace?.id}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav.templates")}</h1>
          <p className="text-sm text-muted-foreground">{showArchived ? t("template.archivedSubtitle") : t("template.listSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={showArchived ? "outline" : "ghost"}><Link href={showArchived ? (writableWorkspace ? `/workspaces/${writableWorkspace.id}/templates` : "/templates") : (writableWorkspace ? `/workspaces/${writableWorkspace.id}/templates?archived=1` : "/templates?archived=1")}>
            {showArchived ? t("template.activeTemplates") : t("template.archivedTemplates")}
          </Link></Button>
          {!showArchived && writableWorkspace && <Button asChild><Link href={`/workspaces/${writableWorkspace.id}/templates/new`}>
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
                    {template.isDefaultCharacter && <Badge className="bg-accent text-accent-foreground">{t("template.defaultCharacter")}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{template.description ?? t("common.noDescription")}</p>
                  {template.tags.length > 0 && <TagList tags={template.tags.map((item) => item.tag)} />}
                  <div className="flex gap-2">
                    <Badge>{t("dashboard.nodes", { count: template._count.nodes })}</Badge>
                    <Badge>{t("dashboard.effects", { count: template._count.effects })}</Badge>
                  </div>
                  <TemplateArchiveActions templateId={template.id} name={template.name} />
                </CardContent>
              </Card>
            ) : (
              <Link key={template.id} href={writableWorkspace ? `/workspaces/${writableWorkspace.id}/templates/${template.id}` : `/templates/${template.id}`}><Card className="h-full transition-colors hover:bg-muted/60">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{template.name}</CardTitle>
                  {template.isDefaultCharacter && <Badge className="bg-accent text-accent-foreground">{t("template.defaultCharacter")}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{template.description ?? t("common.noDescription")}</p>
                {template.tags.length > 0 && <TagList tags={template.tags.map((item) => item.tag)} />}
                <div className="flex gap-2">
                  <Badge>{t("dashboard.nodes", { count: template._count.nodes })}</Badge>
                  <Badge>{t("dashboard.effects", { count: template._count.effects })}</Badge>
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

function TagList({ tags }: { tags: Array<{ id: string; name: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag.id} className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${templateTagColorClass(tag.color)}`}>
          {tag.name}
        </span>
      ))}
    </div>
  );
}
