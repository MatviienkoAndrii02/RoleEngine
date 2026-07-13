import { prisma } from "@/lib/prisma";
import { buildNodeTree, type CharacterNodeModel } from "@/domain/nodes";
import { removePlayerHiddenSubtrees } from "@/domain/node-visibility";
import { parseAcceptedNodeTypes } from "@/domain/template-slots";
import { parseTemplateTagColor } from "@/domain/template-tags";
import { DependencyEngine, type NodeCalculation } from "@/engine/dependency-engine";
import { CharacterTree } from "@/components/characters/character-tree";
import { NodeEditor } from "@/components/characters/node-editor";
import { NumericEffectBuilder } from "@/components/characters/numeric-effect-builder";
import { StructuralEffectBuilder } from "@/components/characters/structural-effect-builder";
import { EffectManager } from "@/components/characters/effect-manager";
import { CharacterSettings } from "@/components/characters/character-settings";
import { SidebarSection } from "@/components/characters/sidebar-section";
import { DependencyPanel } from "@/components/characters/dependency-panel";
import { NodeArchive, type ArchivedNodeItem } from "@/components/characters/node-archive";
import { AuditList } from "@/components/history/audit-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canReadCharacter } from "@/server/authz";
import { requirePageUser } from "@/server/page-auth";
import { getTranslator } from "@/i18n/server";
import { parseCharacterNodeModels, parseEffectDefinitions, type PersistedJsonDiagnostic } from "@/server/read-models";
import { collectSubtreeIds } from "@/domain/tree";

export default async function CharacterPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const user = await requirePageUser(`/characters/${characterId}`);
  const { t } = await getTranslator();
  await canReadCharacter(characterId);
  const data = await prisma.character
    .findFirst({
      where: { id: characterId, archivedAt: null },
      include: {
        rootNodes: { where: { archivedAt: null }, orderBy: [{ parentId: "asc" }, { order: "asc" }] },
        effects: { orderBy: { priority: "asc" } },
        assignments: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" }
        },
        auditLogs: {
          include: { actor: { select: { name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 100
        }
      }
    })
    .catch(() => null);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("character.unavailableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("character.unavailableBody")}</CardContent>
      </Card>
    );
  }

  const parsedNodes = parseCharacterNodeModels(data.rootNodes);
  const parsedEffects = parseEffectDefinitions(data.effects);
  let diagnostics = [...parsedNodes.diagnostics, ...parsedEffects.diagnostics];
  const nodes = parsedNodes.nodes;
  const effects = parsedEffects.effects;
  const writableMembership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId: data.workspaceId, userId: user.id, role: { in: ["OWNER", "GM"] } },
    select: { id: true },
  });
  const canEdit = Boolean(writableMembership);
  const engineResult = new DependencyEngine(nodes, effects).evaluate();
  const calculations = [...engineResult.calculations.values()] as NodeCalculation[];
  const changedCalculations = calculations.filter((calculation) => !sameNumber(calculation.base, calculation.final));
  const changedCalculationNodeIds = new Set(changedCalculations.map((calculation) => calculation.nodeId));
  const changedDependencyEdges = engineResult.edges.filter((edge) => changedCalculationNodeIds.has(edge.targetNodeId));
  const displayNodes = nodes.map((node) => {
    const patches = engineResult.patchRequests.filter((request) => request.targetNodeId === node.id).map((request) => request.patch);
    const patchedData = Object.assign({}, node.data, ...patches);
    const nodeCalculations = calculations.filter((calculation) => calculation.nodeId === node.id);
    for (const calculation of nodeCalculations) {
      const field = node.type === "BAR" && calculation.field === "value" ? "current" : calculation.field;
      patchedData[field] = calculation.final;
    }
    return { ...node, data: patchedData } as CharacterNodeModel;
  });
  const visibleDisplayNodes = canEdit ? displayNodes : removePlayerHiddenSubtrees(displayNodes);
  const visibleNodeIds = new Set(visibleDisplayNodes.map((node) => node.id));
  const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleChangedCalculations = canEdit
    ? changedCalculations
    : changedCalculations.filter((calculation) => visibleNodeIds.has(calculation.nodeId));
  const visibleChangedCalculationNodeIds = new Set(visibleChangedCalculations.map((calculation) => calculation.nodeId));
  const visibleChangedDependencyEdges = canEdit
    ? changedDependencyEdges
    : changedDependencyEdges.filter((edge) => visibleChangedCalculationNodeIds.has(edge.targetNodeId) && visibleNodeIds.has(edge.sourceNodeId));
  const templates = canEdit
    ? await prisma.entityTemplate.findMany({
        where: { archivedAt: null, OR: [{ workspaceId: data.workspaceId }, { workspaceId: null, isGlobal: true }] },
        select: { id: true, name: true, slots: { orderBy: { createdAt: "asc" } }, tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } } },
        orderBy: [{ name: "asc" }]
      })
    : [];
  const templateOptions = templates.map((template) => ({
    id: template.id,
    name: template.name,
    tags: template.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, color: parseTemplateTagColor(item.tag.color) })),
    slots: template.slots.map((slot) => ({ ...slot, acceptedTypes: parseAcceptedNodeTypes(slot.acceptedTypes) })),
  }));
  const players = canEdit
    ? await prisma.user.findMany({
        where: { workspaceMemberships: { some: { workspaceId: data.workspaceId, role: "PLAYER" } } },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }]
      })
    : [];
  const archivedNodeRecords = canEdit
    ? await prisma.characterNode.findMany({
        where: { characterId: data.id, archivedAt: { not: null } },
        orderBy: [{ parentId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const parsedArchivedNodes = parseCharacterNodeModels(archivedNodeRecords);
  diagnostics = [...diagnostics, ...parsedArchivedNodes.diagnostics];
  const archivedItems = buildArchivedNodeItems(parsedArchivedNodes.nodes);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">{data.description ?? t("character.defaultDescription")}</p>
        </div>
      </div>

      {engineResult.cycles.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {t("character.cycles")}
        </div>
      )}
      {diagnostics.length > 0 && canEdit && (
        <PersistedJsonDiagnostics
          diagnostics={diagnostics}
          title={t("diagnostics.persistedJsonTitle")}
          recordLabel={(name, field) => t("diagnostics.persistedJsonRecord", { name, field })}
          moreLabel={t("diagnostics.moreInvalid", { count: diagnostics.length - Math.min(diagnostics.length, 5) })}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("character.nodeTree")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CharacterTree nodes={buildNodeTree(visibleDisplayNodes)} searchable />
          </CardContent>
        </Card>
        <div className="space-y-6">
          {canEdit && (
            <SidebarSection id="settings" title={t("character.settings")}>
              <CharacterSettings
                character={{
                  id: data.id,
                  name: data.name,
                  description: data.description,
                  ownerId: data.ownerId,
                  assignments: data.assignments.map((assignment) => assignment.user)
                }}
                players={players}
              />
            </SidebarSection>
          )}
          {canEdit && (
            <SidebarSection id="node-editor" title={t("character.nodeEditor")}>
              <NodeEditor characterId={characterId} nodes={nodes} templates={templateOptions} />
            </SidebarSection>
          )}
          {canEdit && (
            <SidebarSection id="numeric-effects" title={t("character.numericEffects")}>
              <NumericEffectBuilder characterId={characterId} nodes={nodes} />
            </SidebarSection>
          )}
          {canEdit && (
            <SidebarSection id="structural-effects" title={t("character.structuralEffects")}>
              <StructuralEffectBuilder characterId={characterId} nodes={nodes} />
            </SidebarSection>
          )}
          {canEdit && (
            <SidebarSection id="effect-manager" title={t("character.allEffects")} count={effects.length}>
              <EffectManager nodes={nodes} effects={effects} />
            </SidebarSection>
          )}
          {canEdit && (
            <SidebarSection id="node-archive" title={t("character.nodeArchive")} count={parsedArchivedNodes.nodes.length}>
              <NodeArchive characterId={characterId} items={archivedItems} />
            </SidebarSection>
          )}
          <SidebarSection id="dependencies" title={t("character.dependencies")} count={visibleChangedCalculations.length}>
            <DependencyPanel calculations={visibleChangedCalculations} nodes={visibleNodes} edges={visibleChangedDependencyEdges} />
          </SidebarSection>
          <SidebarSection id="history" title={t("character.history")} count={data.auditLogs.length}>
            <AuditList logs={data.auditLogs} nodes={visibleNodes} effects={effects} />
          </SidebarSection>
        </div>
      </div>
    </div>
  );
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 0.000001;
}

function buildArchivedNodeItems(nodes: CharacterNodeModel[]): ArchivedNodeItem[] {
  const archivedIds = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => !node.parentId || !archivedIds.has(node.parentId))
    .map((node) => ({
      id: node.id,
      name: node.name,
      path: node.path,
      type: node.type,
      subtreeCount: collectSubtreeIds(nodes, node.id).length,
    }));
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
