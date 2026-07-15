import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buildNodeTree } from "@/domain/nodes";
import { parseAcceptedNodeTypes } from "@/domain/template-slots";
import { parseTemplateTagColor } from "@/domain/template-tags";
import { prisma } from "@/lib/prisma";
import { requirePageGM } from "@/server/page-auth";
import { requireTemplateGM } from "@/server/authz";
import { resolveLocalNodeLinks } from "@/server/node-links";
import { parseEffectDefinitions, parseTemplateNodeModels, type PersistedJsonDiagnostic } from "@/server/read-models";
import { CharacterTree } from "@/components/characters/character-tree";
import { NodeEditor } from "@/components/characters/node-editor";
import { EffectComposer } from "@/components/characters/effect-composer";
import { EffectManager } from "@/components/characters/effect-manager";
import { SidebarSection } from "@/components/characters/sidebar-section";
import { TemplateForm } from "@/components/templates/template-form";
import { TemplateSlotManager } from "@/components/templates/template-slot-manager";
import { TemplateTagManager } from "@/components/templates/template-tag-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function TemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  await requirePageGM(`/templates/${templateId}`);
  await requireTemplateGM(templateId);
  const { t } = await getTranslator();
  const template = await prisma.entityTemplate.findFirst({ where: { id: templateId, archivedAt: null }, include: { nodes: { orderBy: [{ parentId: "asc" }, { order: "asc" }] }, effects: { orderBy: { priority: "asc" } }, slots: { orderBy: { createdAt: "asc" } }, tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }, _count: { select: { effects: true } } } });
  if (!template) notFound();
  const allTags = template.workspaceId
    ? await prisma.templateTag.findMany({ where: { workspaceId: template.workspaceId, archivedAt: null }, orderBy: { name: "asc" } })
    : [];
  const availableTemplates = await prisma.entityTemplate.findMany({
    where: {
      id: { not: template.id },
      archivedAt: null,
      OR: [
        { workspaceId: template.workspaceId },
        { workspaceId: null, isGlobal: true },
      ],
    },
    include: { tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } } },
    orderBy: { name: "asc" },
  });
  const parsedNodes = parseTemplateNodeModels(template.nodes);
  const parsedEffects = parseEffectDefinitions(template.effects);
  const diagnostics = [...parsedNodes.diagnostics, ...parsedEffects.diagnostics];
  const nodes = parsedNodes.nodes;
  const linkedNodes = resolveLocalNodeLinks(nodes, t("node.linkUnavailable"));
  const effects = parsedEffects.effects;
  const slots = template.slots.map((slot) => ({ ...slot, acceptedTypes: parseAcceptedNodeTypes(slot.acceptedTypes) }));
  const assignedTags = template.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, color: parseTemplateTagColor(item.tag.color) }));
  const availableTags = allTags.map((tag) => ({ id: tag.id, name: tag.name, color: parseTemplateTagColor(tag.color) }));
  const templateOptions = availableTemplates.map((item) => ({
    id: item.id,
    name: item.name,
    tags: item.tags.map((tagLink) => ({ id: tagLink.tag.id, name: tagLink.tag.name, color: parseTemplateTagColor(tagLink.tag.color) })),
  }));
  return <div className="space-y-6">
    <Button asChild variant="ghost"><Link href="/templates"><ArrowLeft className="h-4 w-4" />{t("template.back")}</Link></Button>
    <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">{template.name}</h1>{template.isDefaultCharacter && <Badge className="bg-accent text-accent-foreground">{t("template.defaultCharacter")}</Badge>}</div><p className="text-sm text-muted-foreground">{t("template.editHint")}</p></div>
    {diagnostics.length > 0 && (
      <PersistedJsonDiagnostics
        diagnostics={diagnostics}
        title={t("diagnostics.persistedJsonTitle")}
        recordLabel={(name, field) => t("diagnostics.persistedJsonRecord", { name, field })}
        moreLabel={t("diagnostics.moreInvalid", { count: diagnostics.length - Math.min(diagnostics.length, 5) })}
      />
    )}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("template.structure")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CharacterTree nodes={buildNodeTree(linkedNodes)} editorSectionId="template-node-editor" />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <SidebarSection id="template-settings" title={t("template.settings")}>
          <TemplateForm template={template} />
        </SidebarSection>
        <SidebarSection id="template-tags" title={t("template.tags")} count={assignedTags.length}>
          <TemplateTagManager templateId={template.id} assignedTags={assignedTags} allTags={availableTags} />
        </SidebarSection>
        <SidebarSection id="template-node-editor" title={t("character.nodeEditor")}>
          <NodeEditor templateId={template.id} nodes={nodes} templates={templateOptions} />
        </SidebarSection>
        <SidebarSection id="template-slots" title={t("templateSlot.title")} count={slots.length}>
          <TemplateSlotManager templateId={template.id} slots={slots} />
        </SidebarSection>
        <SidebarSection id="template-effect-composer" title={t("effect.addEffect")}>
          <EffectComposer templateId={template.id} nodes={nodes} slots={slots} />
        </SidebarSection>
        <SidebarSection id="template-effect-manager" title={t("template.effects")} count={effects.length}>
          <EffectManager nodes={nodes} effects={effects} title={t("template.effects")} rootLabel={t("common.rootTemplate")} slots={slots} />
        </SidebarSection>
      </div>
    </div>
  </div>;
}

function PersistedJsonDiagnostics({
  diagnostics,
  title,
  recordLabel,
  moreLabel,
}: {
  diagnostics: PersistedJsonDiagnostic[];
  title: string;
  recordLabel: (name: string, field: string) => string;
  moreLabel: string;
}) {
  const shown = diagnostics.slice(0, 5);
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="font-medium">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {shown.map((diagnostic) => (
          <li key={`${diagnostic.entityType}-${diagnostic.entityId}`}>
            {recordLabel(diagnostic.entityName, diagnostic.field)}
          </li>
        ))}
      </ul>
      {diagnostics.length > shown.length && (
        <p className="mt-2">{moreLabel}</p>
      )}
    </div>
  );
}
