import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { diagnoseEffectReferences } from "@/domain/effects";
import { buildNodeTree, type CharacterNodeModel } from "@/domain/nodes";
import { removePlayerHiddenSubtrees } from "@/domain/node-visibility";
import { parseAcceptedNodeTypes } from "@/domain/template-slots";
import { parseTemplateTagColor } from "@/domain/template-tags";
import { DependencyEngine, type NodeCalculation } from "@/engine/dependency-engine";
import { CharacterTree } from "@/components/characters/character-tree";
import { CharacterLiveRefresh } from "@/components/characters/character-live-refresh";
import { CharacterViewMode } from "@/components/characters/character-view-mode";
import { NodeEditor } from "@/components/characters/node-editor";
import { EffectComposer } from "@/components/characters/effect-composer";
import { EffectManager } from "@/components/characters/effect-manager";
import { CharacterSettings } from "@/components/characters/character-settings";
import { SidebarSection } from "@/components/characters/sidebar-section";
import { DependencyPanel } from "@/components/characters/dependency-panel";
import { ImpactPanel } from "@/components/characters/impact-panel";
import { ProblemsPanel, type ProblemItem } from "@/components/characters/problems-panel";
import { NodeArchive, type ArchivedNodeItem } from "@/components/characters/node-archive";
import { AuditList } from "@/components/history/audit-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canReadCharacter } from "@/server/authz";
import { requirePageUser } from "@/server/page-auth";
import { resolveCharacterNodeLinks } from "@/server/node-links";
import { getTranslator } from "@/i18n/server";
import { parseCharacterNodeModels, parseEffectDefinitions, type PersistedJsonDiagnostic } from "@/server/read-models";
import { collectSubtreeIds } from "@/domain/tree";
import { latestDate } from "@/server/character-version";

const INITIAL_AUDIT_LIMIT = 25;

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
          take: INITIAL_AUDIT_LIMIT + 1
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
  const initialVersion = latestDate([
    data.updatedAt,
    ...data.rootNodes.map((node) => node.updatedAt),
    ...data.effects.map((effect) => effect.updatedAt),
    ...data.auditLogs.map((log) => log.createdAt),
  ]).toISOString();
  let diagnostics = [...parsedNodes.diagnostics, ...parsedEffects.diagnostics];
  const nodes = parsedNodes.nodes;
  const effects = parsedEffects.effects;
  const auditLogs = data.auditLogs.slice(0, INITIAL_AUDIT_LIMIT);
  const auditNextCursor = data.auditLogs.length > INITIAL_AUDIT_LIMIT ? auditLogs.at(-1)?.id ?? null : null;
  const auditTotal = await prisma.auditLog.count({ where: { characterId: data.id } });
  const nodeClickTriggers = effects
    .filter((effect) => effect.enabled && effect.operation === "TRIGGERED" && effect.payload?.triggered?.trigger.kind === "nodeClick")
    .map((effect) => ({
      effectId: effect.id,
      nodeId: effect.payload?.triggered?.trigger.kind === "nodeClick" ? effect.payload.triggered.trigger.nodeId : "",
      name: effect.name,
    }))
    .filter((trigger) => trigger.nodeId);
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
  const playerDisplayNodes = removePlayerHiddenSubtrees(displayNodes);
  const playerNodeIds = new Set(playerDisplayNodes.map((node) => node.id));
  const linkedFullDisplayNodes = await resolveCharacterNodeLinks({
    nodes: displayNodes,
    userId: user.id,
    missingLabel: t("node.linkUnavailable"),
  });
  const linkedPlayerDisplayNodes = await resolveCharacterNodeLinks({
    nodes: playerDisplayNodes,
    userId: user.id,
    missingLabel: t("node.linkUnavailable"),
  });
  const playerNodes = nodes.filter((node) => playerNodeIds.has(node.id));
  const playerChangedCalculations = changedCalculations.filter((calculation) => playerNodeIds.has(calculation.nodeId));
  const playerChangedCalculationNodeIds = new Set(playerChangedCalculations.map((calculation) => calculation.nodeId));
  const playerChangedDependencyEdges = changedDependencyEdges.filter((edge) => playerChangedCalculationNodeIds.has(edge.targetNodeId));
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
  const linkableCharacters = canEdit
    ? await prisma.character.findMany({
        where: { workspaceId: data.workspaceId, id: { not: data.id }, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
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
  const problems = buildCharacterProblems({
    cycles: engineResult.cycles,
    diagnostics: canEdit ? diagnostics : [],
    effects: canEdit ? effects : [],
    nodes,
    archivedNodes: parsedArchivedNodes.nodes,
    t,
  });
  const gmView = (
    <CharacterMainGrid
      treeNodes={linkedFullDisplayNodes}
      manualTriggers={nodeClickTriggers}
      dependencyCalculations={changedCalculations}
      dependencyNodes={nodes}
      dependencyEdges={changedDependencyEdges}
      auditNodes={nodes}
      auditEffects={effects}
      auditLogs={auditLogs}
      auditNextCursor={auditNextCursor}
      auditTotal={auditTotal}
      characterId={data.id}
      maskAuditNodeNames={false}
      canEdit={canEdit}
      settings={
        canEdit ? (
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
        ) : null
      }
      nodeEditor={canEdit ? <NodeEditor characterId={characterId} nodes={nodes} templates={templateOptions} linkableCharacters={linkableCharacters} /> : null}
      effectComposer={canEdit ? <EffectComposer characterId={characterId} nodes={nodes} /> : null}
      effectManager={canEdit ? <EffectManager characterId={characterId} nodes={nodes} archivedNodes={parsedArchivedNodes.nodes} effects={effects} /> : null}
      nodeArchive={canEdit ? <NodeArchive characterId={characterId} items={archivedItems} /> : null}
      counts={{
        effects: effects.length,
        archivedNodes: parsedArchivedNodes.nodes.length,
      }}
      t={t}
    />
  );
  const playerView = (
    <CharacterMainGrid
      treeNodes={linkedPlayerDisplayNodes}
      manualTriggers={[]}
      dependencyCalculations={playerChangedCalculations}
      dependencyNodes={playerNodes}
      dependencyEdges={playerChangedDependencyEdges}
      auditNodes={playerNodes}
      auditEffects={effects}
      auditLogs={auditLogs}
      auditNextCursor={auditNextCursor}
      auditTotal={auditTotal}
      characterId={data.id}
      maskAuditNodeNames
      canEdit={false}
      t={t}
    />
  );

  return (
    <div className="space-y-6">
      <CharacterLiveRefresh characterId={characterId} initialVersion={initialVersion} enabled={!canEdit} />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">{data.description ?? t("character.defaultDescription")}</p>
        </div>
      </div>

      <ProblemsPanel problems={problems} />
      {canEdit && <ImpactPanel />}

      {canEdit ? <CharacterViewMode gmView={gmView} playerView={playerView} /> : playerView}
    </div>
  );
}

function CharacterMainGrid({
  treeNodes,
  manualTriggers,
  dependencyCalculations,
  dependencyNodes,
  dependencyEdges,
  auditNodes,
  auditEffects,
  auditLogs,
  auditNextCursor,
  auditTotal,
  characterId,
  maskAuditNodeNames = false,
  canEdit,
  settings,
  nodeEditor,
  effectComposer,
  effectManager,
  nodeArchive,
  counts,
  t,
}: {
  treeNodes: CharacterNodeModel[];
  manualTriggers: Array<{ effectId: string; nodeId: string; name: string }>;
  dependencyCalculations: NodeCalculation[];
  dependencyNodes: CharacterNodeModel[];
  dependencyEdges: ReturnType<DependencyEngine["evaluate"]>["edges"];
  auditNodes: CharacterNodeModel[];
  auditEffects: ReturnType<typeof parseEffectDefinitions>["effects"];
  auditLogs: Parameters<typeof AuditList>[0]["logs"];
  auditNextCursor: string | null;
  auditTotal: number;
  characterId: string;
  maskAuditNodeNames?: boolean;
  canEdit: boolean;
  settings?: ReactNode;
  nodeEditor?: ReactNode;
  effectComposer?: ReactNode;
  effectManager?: ReactNode;
  nodeArchive?: ReactNode;
  counts?: {
    effects?: number;
    archivedNodes?: number;
  };
  t: Awaited<ReturnType<typeof getTranslator>>["t"];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("character.nodeTree")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CharacterTree characterId={canEdit ? characterId : undefined} nodes={buildNodeTree(treeNodes)} searchable manualTriggers={manualTriggers} />
        </CardContent>
      </Card>
      <div className="space-y-6">
        {canEdit && settings && (
          <SidebarSection id="settings" title={t("character.settings")}>
            {settings}
          </SidebarSection>
        )}
        {canEdit && nodeEditor && (
          <SidebarSection id="node-editor" title={t("character.nodeEditor")}>
            {nodeEditor}
          </SidebarSection>
        )}
        {canEdit && effectComposer && (
          <SidebarSection id="effect-composer" title={t("effect.addEffect")}>
            {effectComposer}
          </SidebarSection>
        )}
        {canEdit && effectManager && (
          <SidebarSection id="effect-manager" title={t("character.allEffects")} count={counts?.effects}>
            {effectManager}
          </SidebarSection>
        )}
        {canEdit && nodeArchive && (
          <SidebarSection id="node-archive" title={t("character.nodeArchive")} count={counts?.archivedNodes}>
            {nodeArchive}
          </SidebarSection>
        )}
        <SidebarSection id={canEdit ? "dependencies" : "player-preview-dependencies"} title={t("character.dependencies")} count={dependencyCalculations.length}>
          <DependencyPanel calculations={dependencyCalculations} nodes={dependencyNodes} edges={dependencyEdges} />
        </SidebarSection>
        <SidebarSection id={canEdit ? "history" : "player-preview-history"} title={t("character.history")} count={auditTotal}>
          <AuditList
            characterId={characterId}
            logs={auditLogs}
            nextCursor={auditNextCursor}
            total={auditTotal}
            nodes={auditNodes}
            effects={auditEffects}
            maskUnknownNodeNames={maskAuditNodeNames}
          />
        </SidebarSection>
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

function buildCharacterProblems({
  cycles,
  diagnostics,
  effects,
  nodes,
  archivedNodes,
  t,
}: {
  cycles: string[][];
  diagnostics: PersistedJsonDiagnostic[];
  effects: Array<ReturnType<typeof parseEffectDefinitions>["effects"][number]>;
  nodes: CharacterNodeModel[];
  archivedNodes: CharacterNodeModel[];
  t: Awaited<ReturnType<typeof getTranslator>>["t"];
}) {
  const problems: ProblemItem[] = [];
  const referenceLabels = buildReferenceLabels(nodes, archivedNodes, t);

  if (cycles.length > 0) {
    problems.push({
      id: "dependency-cycles",
      severity: "error",
      title: t("problems.dependencyCyclesTitle"),
      description: t("character.cycles"),
      details: cycles.slice(0, 5).map((cycle) => cycle.map((id) => formatReference(id, referenceLabels, t)).join(" -> ")),
    });
  }

  for (const effect of effects) {
    const diagnostic = diagnoseEffectReferences(effect, nodes);
    const refs = [...diagnostic.missingNodeIds, ...diagnostic.missingPaths];
    if (refs.length === 0) continue;
    problems.push({
      id: `effect-${effect.id}`,
      severity: "warning",
      title: t("problems.brokenEffectTitle", { name: effect.name }),
      description: t("effect.missingRefs", { refs: refs.map((ref) => formatReference(ref, referenceLabels, t)).join(", ") }),
    });
  }

  for (const diagnostic of diagnostics) {
    problems.push({
      id: `json-${diagnostic.entityType}-${diagnostic.entityId}-${diagnostic.field}`,
      severity: "warning",
      title: t("problems.invalidJsonTitle", { name: diagnostic.entityName }),
      description: t("problems.invalidJsonBody", {
        entity: t(`problems.entity.${diagnostic.entityType}`),
        field: diagnostic.field,
      }),
      details: diagnostic.issues.slice(0, 3),
    });
  }

  return problems;
}

function buildReferenceLabels(nodes: CharacterNodeModel[], archivedNodes: CharacterNodeModel[], t: Awaited<ReturnType<typeof getTranslator>>["t"]) {
  const labels = new Map<string, string>();
  for (const node of nodes) labels.set(node.id, node.name);
  for (const node of archivedNodes) labels.set(node.id, t("problems.archivedReference", { name: node.name, id: shortReferenceId(node.id) }));
  return labels;
}

function formatReference(ref: string, labels: Map<string, string>, t: Awaited<ReturnType<typeof getTranslator>>["t"]) {
  return labels.get(ref) ?? t("problems.unknownReference", { id: shortReferenceId(ref) });
}

function shortReferenceId(id: string) {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}
