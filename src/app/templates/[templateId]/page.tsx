import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buildNodeTree } from "@/domain/nodes";
import { prisma } from "@/lib/prisma";
import { requirePageGM } from "@/server/page-auth";
import { requireTemplateGM } from "@/server/authz";
import { parseEffectDefinitions, parseTemplateNodeModels, type PersistedJsonDiagnostic } from "@/server/read-models";
import { CharacterTree } from "@/components/characters/character-tree";
import { NodeEditor } from "@/components/characters/node-editor";
import { NumericEffectBuilder } from "@/components/characters/numeric-effect-builder";
import { StructuralEffectBuilder } from "@/components/characters/structural-effect-builder";
import { EffectManager } from "@/components/characters/effect-manager";
import { SidebarSection } from "@/components/characters/sidebar-section";
import { TemplateForm } from "@/components/templates/template-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";

export default async function TemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  await requirePageGM(`/templates/${templateId}`);
  await requireTemplateGM(templateId);
  const { t } = await getTranslator();
  const template = await prisma.entityTemplate.findFirst({ where: { id: templateId, archivedAt: null }, include: { nodes: { orderBy: [{ parentId: "asc" }, { order: "asc" }] }, effects: { orderBy: { priority: "asc" } }, _count: { select: { effects: true } } } });
  if (!template) notFound();
  const parsedNodes = parseTemplateNodeModels(template.nodes);
  const parsedEffects = parseEffectDefinitions(template.effects);
  const diagnostics = [...parsedNodes.diagnostics, ...parsedEffects.diagnostics];
  const nodes = parsedNodes.nodes;
  const effects = parsedEffects.effects;
  return <div className="space-y-6">
    <Button asChild variant="ghost"><Link href="/templates"><ArrowLeft className="h-4 w-4" />{t("template.back")}</Link></Button>
    <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">{template.name}</h1><Badge>{template.kind.toLowerCase()}</Badge>{template.isDefaultCharacter && <Badge className="bg-accent text-accent-foreground">{t("template.defaultCharacter")}</Badge>}</div><p className="text-sm text-muted-foreground">{t("template.editHint")}</p></div>
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
          <CharacterTree nodes={buildNodeTree(nodes)} editorSectionId="template-node-editor" />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <SidebarSection id="template-settings" title={t("template.settings")}>
          <TemplateForm template={template} />
        </SidebarSection>
        <SidebarSection id="template-node-editor" title={t("character.nodeEditor")}>
          <NodeEditor templateId={template.id} nodes={nodes} />
        </SidebarSection>
        <SidebarSection id="template-numeric-effects" title={t("character.numericEffects")}>
          <NumericEffectBuilder templateId={template.id} nodes={nodes} />
        </SidebarSection>
        <SidebarSection id="template-structural-effects" title={t("character.structuralEffects")}>
          <StructuralEffectBuilder templateId={template.id} nodes={nodes} />
        </SidebarSection>
        <SidebarSection id="template-effect-manager" title={t("template.effects")} count={effects.length}>
          <EffectManager nodes={nodes} effects={effects} title={t("template.effects")} rootLabel={t("common.rootTemplate")} />
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
