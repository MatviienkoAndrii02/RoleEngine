import type { z } from "zod";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { EffectDefinition } from "@/domain/effects";
import { effectDefinitionSchema, parseNodeData } from "@/domain/validation";

export type PersistedJsonDiagnostic = {
  entityType: "CharacterNode" | "TemplateNode" | "Effect";
  entityId: string;
  entityName: string;
  field: string;
  issues: string[];
};

type NodeRecord = {
  id: string;
  parentId: string | null;
  type: CharacterNodeModel["type"];
  name: string;
  path: string;
  order: number;
  data: unknown;
  computed?: unknown;
};

type EffectRecord = {
  id: string;
  name: string;
  enabled: boolean;
  operation: string;
  priority: number;
  sourceNodeId?: string | null;
  condition: unknown;
  target: unknown;
  source: unknown;
  payload?: unknown;
};

export function parseCharacterNodeModels(records: NodeRecord[]) {
  return parseNodeModels(records, "CharacterNode");
}

export function parseTemplateNodeModels(records: NodeRecord[]) {
  return parseNodeModels(records, "TemplateNode");
}

export function parseEffectDefinitions(records: EffectRecord[]) {
  const effects: EffectDefinition[] = [];
  const diagnostics: PersistedJsonDiagnostic[] = [];

  for (const record of records) {
    const parsed = effectDefinitionSchema.safeParse({
      id: record.id,
      name: record.name,
      enabled: record.enabled,
      operation: record.operation,
      priority: record.priority,
      sourceNodeId: record.sourceNodeId,
      condition: record.condition,
      target: record.target,
      source: record.source,
      payload: isPlainObject(record.payload) && Object.keys(record.payload).length > 0 ? record.payload : undefined,
    });

    if (parsed.success) {
      effects.push(parsed.data);
      continue;
    }

    diagnostics.push({
      entityType: "Effect",
      entityId: record.id,
      entityName: record.name,
      field: "definition",
      issues: formatIssues(parsed.error),
    });
  }

  return { effects, diagnostics };
}

function parseNodeModels(records: NodeRecord[], entityType: "CharacterNode" | "TemplateNode") {
  const nodes: CharacterNodeModel[] = [];
  const diagnostics: PersistedJsonDiagnostic[] = [];

  for (const record of records) {
    const parsed = safeParseNodeData(record);
    if (!parsed.success) {
      diagnostics.push({
        entityType,
        entityId: record.id,
        entityName: record.name,
        field: "data",
        issues: formatIssues(parsed.error),
      });
      continue;
    }

    nodes.push({
      id: record.id,
      parentId: record.parentId,
      type: record.type,
      name: record.name,
      path: record.path,
      order: record.order,
      data: parsed.data,
      ...(isPlainObject(record.computed) ? { computed: record.computed } : {}),
    });
  }

  return { nodes, diagnostics };
}

function safeParseNodeData(record: NodeRecord) {
  try {
    return { success: true as const, data: parseNodeData(record.type, record.data) };
  } catch (error) {
    return { success: false as const, error };
  }
}

function formatIssues(error: unknown) {
  if (isZodError(error)) {
    return error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
  }
  if (error instanceof Error) return [error.message];
  return ["Invalid persisted JSON"];
}

function isZodError(error: unknown): error is z.ZodError {
  return typeof error === "object"
    && error !== null
    && "issues" in error
    && Array.isArray((error as { issues?: unknown }).issues);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
