import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  inspectAuditRecord,
  inspectEffectRecord,
  inspectJsonObjectField,
  inspectNodeRecord,
  inspectNodeTypeArrayField,
  type JsonIntegrityApplyResult,
  type JsonIntegrityEntityType,
  type JsonIntegrityEntry,
  type JsonIntegrityFinding,
  type JsonIntegrityQuarantineView,
  type JsonIntegrityReport,
  type JsonIntegrityScope,
} from "@/domain/json-integrity";
import { appError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { safeRevalidatePath as revalidatePath } from "@/server/revalidate";

export type { JsonIntegrityApplyResult, JsonIntegrityEntry, JsonIntegrityQuarantineView, JsonIntegrityReport, JsonIntegrityScope };

type Db = Prisma.TransactionClient;

/** Audit rows are append-only history; a bounded sample keeps scans cheap. */
const AUDIT_SCAN_LIMIT = 200;

type FindingContext = {
  workspaceId: string | null;
  characterId: string | null;
  templateId: string | null;
};

type InternalFinding = JsonIntegrityEntry & {
  /** Persisted value that failed validation, snapshotted for review. */
  rawValue: unknown;
  /** Deterministic replacement produced by the domain policy, when repairable. */
  repairedValue?: unknown;
  context: FindingContext;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Prisma JSON columns reject bare nulls, so primitives are wrapped. */
function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value as Prisma.InputJsonArray;
  if (isPlainObject(value)) return value as Prisma.InputJsonObject;
  return { value: value === undefined ? null : (value as Prisma.InputJsonValue) };
}

function toFinding(
  entityType: JsonIntegrityEntityType,
  entityId: string,
  entityName: string,
  field: string,
  finding: JsonIntegrityFinding,
  rawValue: unknown,
  context: FindingContext,
): InternalFinding | null {
  if (finding.strategy === "valid") return null;
  return {
    entityType,
    entityId,
    entityName,
    field,
    strategy: finding.strategy,
    repairable: finding.strategy === "repair",
    issues: finding.issues,
    repairs: finding.repairs,
    rawValue,
    repairedValue: finding.repairedValue,
    context,
  };
}

function toEntry(finding: InternalFinding): JsonIntegrityEntry {
  return {
    entityType: finding.entityType,
    entityId: finding.entityId,
    entityName: finding.entityName,
    field: finding.field,
    strategy: finding.strategy,
    repairable: finding.repairable,
    issues: finding.issues,
    repairs: finding.repairs,
  };
}

const nodeSelect = { id: true, type: true, name: true, data: true, computed: true } as const;
const templateNodeSelect = { id: true, type: true, name: true, data: true } as const;
const effectSelect = {
  id: true,
  name: true,
  enabled: true,
  operation: true,
  priority: true,
  sourceNodeId: true,
  condition: true,
  target: true,
  source: true,
  payload: true,
} as const;

export async function collectCharacterFindings(db: Db, characterId: string): Promise<InternalFinding[]> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, workspaceId: true, metadata: true },
  });
  if (!character) throw appError("NOT_FOUND", "Character not found", 404);

  const context: FindingContext = { workspaceId: character.workspaceId, characterId: character.id, templateId: null };
  const [nodes, effects, auditLogs] = await Promise.all([
    db.characterNode.findMany({ where: { characterId }, select: nodeSelect }),
    db.effect.findMany({ where: { characterId }, select: effectSelect }),
    db.auditLog.findMany({
      where: { characterId },
      orderBy: { createdAt: "desc" },
      take: AUDIT_SCAN_LIMIT,
      select: { id: true, entityType: true, entityId: true, metadata: true },
    }),
  ]);

  const findings = collectObjectFieldFinding("Character", character.id, character.name, "metadata", character.metadata, context);
  for (const node of nodes) {
    findings.push(...collectNodeFindings("CharacterNode", node, context));
  }
  for (const effect of effects) {
    const finding = toFinding(
      "Effect",
      effect.id,
      effect.name,
      "definition",
      inspectEffectRecord(effect),
      { condition: effect.condition, target: effect.target, source: effect.source, payload: effect.payload },
      context,
    );
    if (finding) findings.push(finding);
  }
  for (const log of auditLogs) {
    const finding = toFinding(
      "AuditLog",
      log.id,
      `${log.entityType} ${log.entityId}`,
      "metadata",
      inspectAuditRecord({ entityType: log.entityType, metadata: log.metadata }),
      log.metadata,
      context,
    );
    if (finding) findings.push(finding);
  }
  return findings;
}

export async function collectTemplateFindings(db: Db, templateId: string): Promise<InternalFinding[]> {
  const template = await db.entityTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, workspaceId: true, metadata: true },
  });
  if (!template) throw appError("TEMPLATE_NOT_FOUND", "Template not found", 404);

  const context: FindingContext = { workspaceId: template.workspaceId, characterId: null, templateId: template.id };
  const [nodes, effects, slots] = await Promise.all([
    db.templateNode.findMany({ where: { templateId }, select: templateNodeSelect }),
    db.effect.findMany({ where: { templateId }, select: effectSelect }),
    db.templateSlot.findMany({ where: { templateId }, select: { id: true, key: true, acceptedTypes: true } }),
  ]);

  const findings = collectObjectFieldFinding("EntityTemplate", template.id, template.name, "metadata", template.metadata, context);
  for (const node of nodes) {
    findings.push(...collectNodeFindings("TemplateNode", node, context));
  }
  for (const effect of effects) {
    const finding = toFinding(
      "Effect",
      effect.id,
      effect.name,
      "definition",
      inspectEffectRecord(effect),
      { condition: effect.condition, target: effect.target, source: effect.source, payload: effect.payload },
      context,
    );
    if (finding) findings.push(finding);
  }
  for (const slot of slots) {
    const finding = toFinding(
      "TemplateSlot",
      slot.id,
      slot.key,
      "acceptedTypes",
      inspectNodeTypeArrayField("acceptedTypes", slot.acceptedTypes),
      slot.acceptedTypes,
      context,
    );
    if (finding) findings.push(finding);
  }
  return findings;
}

export async function collectScopeFindings(db: Db, scope: JsonIntegrityScope): Promise<InternalFinding[]> {
  return scope.kind === "character"
    ? collectCharacterFindings(db, scope.characterId)
    : collectTemplateFindings(db, scope.templateId);
}

function collectObjectFieldFinding(
  entityType: JsonIntegrityEntityType,
  entityId: string,
  entityName: string,
  field: string,
  value: unknown,
  context: FindingContext,
) {
  const finding = toFinding(entityType, entityId, entityName, field, inspectJsonObjectField(field, value), value, context);
  return finding ? [finding] : [];
}

function collectNodeFindings(
  entityType: "CharacterNode" | "TemplateNode",
  node: { id: string; type: string; name: string; data: unknown; computed?: unknown },
  context: FindingContext,
) {
  const dataFinding = inspectNodeRecord({ entityType, type: node.type, data: node.data });
  if (dataFinding.strategy !== "valid") {
    const finding = toFinding(entityType, node.id, node.name, "data", dataFinding, node.data, context);
    return finding ? [finding] : [];
  }

  const computedFinding = inspectNodeRecord({ entityType, type: node.type, data: node.data, computed: node.computed });
  const finding = toFinding(entityType, node.id, node.name, "computed", computedFinding, node.computed, context);
  return finding ? [finding] : [];
}

export async function getJsonIntegrityQuarantine(scope: JsonIntegrityScope): Promise<JsonIntegrityQuarantineView[]> {
  return loadQuarantineViews(prisma, scope);
}

export async function getJsonIntegrityReport(scope: JsonIntegrityScope): Promise<JsonIntegrityReport> {
  const findings = await collectScopeFindings(prisma, scope);
  const [workspaceId, quarantine] = await Promise.all([
    getScopeWorkspaceId(prisma, scope),
    loadQuarantineViews(prisma, scope),
  ]);
  return buildReport(scope, workspaceId, findings, quarantine);
}

export async function applyJsonIntegrityPolicy(
  scope: JsonIntegrityScope,
  actorId: string | null,
  action: "repair" | "quarantine",
): Promise<JsonIntegrityApplyResult> {
  const result = await prisma.$transaction(async (tx) => {
    const findings = await collectScopeFindings(tx, scope);
    let repaired = 0;
    let quarantined = 0;

    for (const finding of findings) {
      const outcome = await applyFindingPolicy(tx, finding, actorId, action);
      if (outcome === "repaired") repaired += 1;
      else quarantined += 1;
    }

    await writeAudit({
      actorId,
      workspaceId: findings[0]?.context.workspaceId ?? null,
      characterId: scope.kind === "character" ? scope.characterId : null,
      entityType: "JsonIntegrityQuarantine",
      entityId: scope.kind === "character" ? scope.characterId : scope.templateId,
      action: action === "repair" ? "UPDATE" : "CREATE",
      metadata: { policy: "json-integrity", action, repaired, quarantined },
    }, tx);

    return { findings, repaired, quarantined };
  }, { timeout: 20_000 });

  revalidateScope(scope);
  return {
    scope,
    action,
    repaired: result.repaired,
    quarantined: result.quarantined,
    entries: result.findings.map(toEntry),
  };
}

export async function resolveJsonIntegrityEntry(
  input: { entryId: string; resolution: "repair" | "release" },
  actorId: string | null,
): Promise<JsonIntegrityReport> {
  const row = await prisma.jsonIntegrityQuarantine.findUnique({ where: { id: input.entryId } });
  if (!row) throw appError("JSON_INTEGRITY_ENTRY_NOT_FOUND", "Integrity entry was not found", 404);

  const scope: JsonIntegrityScope | null = row.characterId
    ? { kind: "character", characterId: row.characterId }
    : row.templateId
      ? { kind: "template", templateId: row.templateId }
      : null;
  if (!scope) throw appError("BAD_REQUEST", "Integrity entry is not scoped to a character or template");

  await prisma.$transaction(async (tx) => {
    if (input.resolution === "release") {
      await tx.jsonIntegrityQuarantine.update({
        where: { id: row.id },
        data: { status: "RELEASED", resolvedAt: new Date(), resolvedById: actorId },
      });
      await writeAudit({
        actorId,
        workspaceId: row.workspaceId,
        characterId: row.characterId,
        entityType: "JsonIntegrityQuarantine",
        entityId: row.id,
        action: "UPDATE",
        fieldPath: "status",
        oldValue: { status: row.status, entityType: row.entityType, entityId: row.entityId },
        newValue: { status: "RELEASED" },
        metadata: { policy: "json-integrity", resolution: "release" },
      }, tx);
      return;
    }

    const findings = await collectScopeFindings(tx, scope);
    const finding = findings.find((item) => item.entityType === row.entityType && item.entityId === row.entityId && item.field === row.field);
    if (!finding || finding.strategy !== "repair" || finding.repairedValue === undefined) {
      throw appError("JSON_INTEGRITY_REPAIR_FAILED", "This record has no deterministic repair and needs a manual fix", 409);
    }
    const outcome = await applyFindingPolicy(tx, finding, actorId, "repair");
    if (outcome !== "repaired") {
      throw appError("JSON_INTEGRITY_REPAIR_FAILED", "This record has no deterministic repair and needs a manual fix", 409);
    }
  }, { timeout: 20_000 });

  revalidateScope(scope);
  return getJsonIntegrityReport(scope);
}

export type WorkspaceJsonIntegrityScanEntry = {
  scopeKind: "character" | "template";
  scopeId: string;
  scopeName: string;
  entries: JsonIntegrityEntry[];
  repaired: number;
  quarantined: number;
};

/**
 * Admin/import entry point: scans every character and template in a workspace,
 * including `Workspace.metadata`, and optionally applies the repair policy.
 */
export async function scanWorkspaceJsonIntegrity(input: {
  workspaceId: string;
  actorId: string | null;
  apply?: boolean;
}): Promise<WorkspaceJsonIntegrityScanEntry[]> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, name: true, metadata: true },
  });
  if (!workspace) throw appError("NOT_FOUND", "Workspace not found", 404);

  const [characters, templates] = await Promise.all([
    prisma.character.findMany({ where: { workspaceId: input.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.entityTemplate.findMany({ where: { workspaceId: input.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const results: WorkspaceJsonIntegrityScanEntry[] = [];
  const workspaceFinding = toFinding(
    "Workspace",
    workspace.id,
    workspace.name,
    "metadata",
    inspectJsonObjectField("metadata", workspace.metadata),
    workspace.metadata,
    { workspaceId: workspace.id, characterId: null, templateId: null },
  );
  if (workspaceFinding) {
    const outcomes = input.apply ? [await applyFindingPolicy(prisma, workspaceFinding, input.actorId, "repair")] : [];
    results.push({
      scopeKind: "character",
      scopeId: workspace.id,
      scopeName: `${workspace.name} (workspace metadata)`,
      entries: [toEntry(workspaceFinding)],
      repaired: outcomes.filter((outcome) => outcome === "repaired").length,
      quarantined: outcomes.filter((outcome) => outcome === "quarantined").length,
    });
  }

  const scopes: Array<{ scope: JsonIntegrityScope; scopeKind: "character" | "template"; scopeId: string; scopeName: string }> = [
    ...characters.map((character) => ({
      scope: { kind: "character" as const, characterId: character.id },
      scopeKind: "character" as const,
      scopeId: character.id,
      scopeName: character.name,
    })),
    ...templates.map((template) => ({
      scope: { kind: "template" as const, templateId: template.id },
      scopeKind: "template" as const,
      scopeId: template.id,
      scopeName: template.name,
    })),
  ];

  for (const item of scopes) {
    if (input.apply) {
      const applied = await applyJsonIntegrityPolicy(item.scope, input.actorId, "repair");
      if (!applied.entries.length) continue;
      results.push({ ...item, entries: applied.entries, repaired: applied.repaired, quarantined: applied.quarantined });
      continue;
    }

    const report = await getJsonIntegrityReport(item.scope);
    if (!report.entries.length) continue;
    results.push({ ...item, entries: report.entries, repaired: 0, quarantined: 0 });
  }

  return results;
}

async function applyFindingPolicy(
  db: Db,
  finding: InternalFinding,
  actorId: string | null,
  action: "repair" | "quarantine",
): Promise<"repaired" | "quarantined"> {
  if (action === "repair" && finding.repairable && finding.repairedValue !== undefined) {
    const applied = await applyRecordRepair(db, finding, finding.repairedValue);
    if (applied) {
      const row = await upsertQuarantineEntry(db, finding, actorId, "REPAIRED");
      await writeAudit({
        actorId,
        workspaceId: finding.context.workspaceId,
        characterId: finding.context.characterId,
        entityType: finding.entityType,
        entityId: finding.entityId,
        action: "UPDATE",
        fieldPath: finding.field,
        oldValue: jsonSnapshot(finding.rawValue),
        newValue: jsonSnapshot(finding.repairedValue),
        metadata: { policy: "json-integrity", repairs: finding.repairs, quarantineEntryId: row.id },
      }, db);
      return "repaired";
    }
  }
  await upsertQuarantineEntry(db, finding, actorId, "ACTIVE");
  return "quarantined";
}

async function applyRecordRepair(db: Db, finding: InternalFinding, repairedValue: unknown): Promise<boolean> {
  const value = jsonSnapshot(repairedValue);
  switch (`${finding.entityType}:${finding.field}`) {
    case "CharacterNode:data":
      await db.characterNode.update({ where: { id: finding.entityId }, data: { data: value } });
      return true;
    case "TemplateNode:data":
      await db.templateNode.update({ where: { id: finding.entityId }, data: { data: value } });
      return true;
    case "Character:metadata":
      await db.character.update({ where: { id: finding.entityId }, data: { metadata: value } });
      return true;
    case "EntityTemplate:metadata":
      await db.entityTemplate.update({ where: { id: finding.entityId }, data: { metadata: value } });
      return true;
    case "Workspace:metadata":
      await db.workspace.update({ where: { id: finding.entityId }, data: { metadata: value } });
      return true;
    case "TemplateSlot:acceptedTypes":
      await db.templateSlot.update({ where: { id: finding.entityId }, data: { acceptedTypes: value } });
      return true;
    default:
      // Effect DSL, audit metadata and generated-node provenance have no
      // deterministic repair, so they stay quarantined for a manual fix.
      return false;
  }
}

async function upsertQuarantineEntry(
  db: Db,
  finding: InternalFinding,
  actorId: string | null,
  status: "ACTIVE" | "REPAIRED",
): Promise<{ id: string }> {
  const snapshot = jsonSnapshot(finding.rawValue);
  const where = {
    entityType_entityId_field: {
      entityType: finding.entityType,
      entityId: finding.entityId,
      field: finding.field,
    },
  };

  const existing = await db.jsonIntegrityQuarantine.findUnique({ where, select: { id: true, status: true, rawValue: true } });
  // A GM decision (released/repairable) stays valid until the persisted JSON
  // changes, so repeated scans do not resurrect an accepted finding.
  if (existing && existing.status !== "ACTIVE" && JSON.stringify(existing.rawValue) === JSON.stringify(snapshot)) {
    return { id: existing.id };
  }

  const now = new Date();
  const values = {
    workspaceId: finding.context.workspaceId,
    characterId: finding.context.characterId,
    templateId: finding.context.templateId,
    entityName: finding.entityName,
    strategy: finding.strategy,
    status,
    repairable: finding.repairable,
    reasons: finding.issues,
    repairs: finding.repairs,
    rawValue: jsonSnapshot(finding.rawValue),
    detectedById: actorId,
    detectedAt: now,
    resolvedAt: status === "REPAIRED" ? now : null,
    resolvedById: status === "REPAIRED" ? actorId : null,
  };

  return db.jsonIntegrityQuarantine.upsert({
    where,
    create: { entityType: finding.entityType, entityId: finding.entityId, field: finding.field, ...values },
    update: values,
  });
}

async function getScopeWorkspaceId(db: Db, scope: JsonIntegrityScope): Promise<string | null> {
  if (scope.kind === "character") {
    const character = await db.character.findUnique({ where: { id: scope.characterId }, select: { workspaceId: true } });
    if (!character) throw appError("NOT_FOUND", "Character not found", 404);
    return character.workspaceId;
  }
  const template = await db.entityTemplate.findUnique({ where: { id: scope.templateId }, select: { workspaceId: true } });
  if (!template) throw appError("TEMPLATE_NOT_FOUND", "Template not found", 404);
  return template.workspaceId;
}

async function loadQuarantineViews(db: Db, scope: JsonIntegrityScope): Promise<JsonIntegrityQuarantineView[]> {
  const rows = await db.jsonIntegrityQuarantine.findMany({
    where: scope.kind === "character" ? { characterId: scope.characterId } : { templateId: scope.templateId },
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: row.entityName,
    field: row.field,
    strategy: row.strategy,
    status: row.status,
    repairable: row.repairable,
    reasons: readStringArray(row.reasons),
    repairs: readStringArray(row.repairs),
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  }));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildReport(
  scope: JsonIntegrityScope,
  workspaceId: string | null,
  findings: InternalFinding[],
  quarantine: JsonIntegrityQuarantineView[],
): JsonIntegrityReport {
  const entries = findings.map(toEntry);
  const repairable = entries.filter((entry) => entry.strategy === "repair").length;
  return {
    scope,
    workspaceId,
    entries,
    quarantine,
    summary: {
      invalid: entries.length,
      repairable,
      manual: entries.length - repairable,
      activeQuarantine: quarantine.filter((entry) => entry.status === "ACTIVE").length,
    },
  };
}

function revalidateScope(scope: JsonIntegrityScope) {
  if (scope.kind === "character") {
    revalidatePath("/");
    revalidatePath(`/characters/${scope.characterId}`);
    return;
  }
  revalidatePath("/templates");
  revalidatePath(`/templates/${scope.templateId}`);
}


