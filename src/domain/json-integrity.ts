import { NODE_ICON_NAMES, type NodeType, type TableColumnType } from "@/domain/nodes";
import { TEMPLATE_TAG_COLOR_NAMES } from "@/domain/template-tags";
import { effectDefinitionSchema, nodeTypeSchema, parseNodeData } from "@/domain/validation";

/**
 * Persisted JSON contracts (node `data`, node `computed`, effect DSL, audit
 * `metadata`) are open column values, so a record can degrade after an import,
 * a manual edit or an older schema version. This module is the single pure
 * contract that decides what happens to such a record:
 *
 * - `valid` вЂ” the record parses with the domain schema and is read normally.
 * - `repair` вЂ” the record is invalid, but a deterministic normalization
 *   (`repairedValue`) satisfies the same schema without inventing domain data.
 * - `quarantine` вЂ” no safe normalization exists (guessing would change meaning
 *   or silently drop structural information). The record stays untouched, is
 *   excluded from read paths and is registered for GM action.
 *
 * The module has no DB access: server services and admin scripts both use it.
 */

export const jsonIntegrityEntityTypes = [
  "CharacterNode",
  "TemplateNode",
  "TemplateSlot",
  "Effect",
  "AuditLog",
  "Character",
  "EntityTemplate",
  "Workspace",
] as const;

export type JsonIntegrityEntityType = (typeof jsonIntegrityEntityTypes)[number];

export const jsonIntegrityStrategies = ["valid", "repair", "quarantine"] as const;

export type JsonIntegrityStrategy = (typeof jsonIntegrityStrategies)[number];

export const jsonIntegrityRepairCodes = [
  "COERCED_NUMBER",
  "ADDED_DEFAULT_VALUE",
  "DROPPED_UNKNOWN_PROPERTY",
  "DROPPED_INVALID_PROPERTY",
  "TRUNCATED_TEXT_FIELD",
  "DROPPED_CONFLICTING_BOUND",
  "ENABLED_ALLOW_NEGATIVE",
  "DERIVED_BAR_MAX",
  "DROPPED_INVALID_COLUMN",
  "DROPPED_DUPLICATE_COLUMN",
  "DROPPED_INVALID_TABLE_ROW",
  "DROPPED_UNKNOWN_TABLE_COLUMN",
  "DROPPED_INVALID_TABLE_CELL",
  "FILTERED_INVALID_ENUM_VALUE",
  "RESET_NON_OBJECT_JSON_FIELD",
] as const;

export type JsonIntegrityRepairCode = (typeof jsonIntegrityRepairCodes)[number];

export type JsonIntegrityFinding = {
  strategy: JsonIntegrityStrategy;
  issues: string[];
  repairs: JsonIntegrityRepairCode[];
  repairedValue?: unknown;
};

export type NodeRecordForIntegrity = {
  entityType: "CharacterNode" | "TemplateNode";
  type: string;
  data: unknown;
  computed?: unknown;
};

export type EffectRecordForIntegrity = {
  id: string;
  name: string;
  enabled: unknown;
  operation: unknown;
  priority: unknown;
  sourceNodeId?: unknown;
  condition: unknown;
  target: unknown;
  source: unknown;
  payload?: unknown;
};

export type AuditRecordForIntegrity = {
  entityType?: unknown;
  metadata?: unknown;
};

export function isValidIntegrityStrategy(value: unknown): value is JsonIntegrityStrategy {
  return typeof value === "string" && (jsonIntegrityStrategies as readonly string[]).includes(value);
}

export function inspectNodeRecord(record: NodeRecordForIntegrity): JsonIntegrityFinding {
  const type = nodeTypeSchema.safeParse(record.type);
  if (!type.success) return quarantine([`Unsupported node type "${String(record.type)}"`]);

  const dataFinding = inspectNodeData(type.data, record.data);
  if (record.entityType === "CharacterNode" && record.computed !== undefined && !isPlainObject(record.computed)) {
    // `computed` carries generated-node provenance; resetting it could duplicate
    // structural nodes, so an unreadable provenance bag is quarantined.
    return quarantine([...dataFinding.issues, "computed must be a JSON object"]);
  }
  return dataFinding;
}

export function inspectNodeData(type: NodeType, value: unknown): JsonIntegrityFinding {
  const valid = safeParseNodeData(type, value);
  if (valid.ok) return { strategy: "valid", issues: [], repairs: [] };
  if (!isPlainObject(value)) return quarantine(["Saved node data must be a JSON object"]);

  const repairs: JsonIntegrityRepairCode[] = [];
  const repaired = normalizeNodeData(type, value, repairs);
  if (!repaired) return quarantine(valid.issues);

  const parsed = safeParseNodeData(type, repaired);
  if (!parsed.ok) return quarantine(parsed.issues);
  return { strategy: "repair", issues: valid.issues, repairs, repairedValue: parsed.data };
}

export function inspectEffectRecord(record: EffectRecordForIntegrity): JsonIntegrityFinding {
  const payload = isPlainObject(record.payload) ? record.payload : {};
  const parsed = effectDefinitionSchema.safeParse({
    id: record.id,
    name: record.name,
    enabled: record.enabled,
    operation: record.operation,
    priority: record.priority,
    sourceNodeId: typeof record.sourceNodeId === "string" ? record.sourceNodeId : undefined,
    condition: record.condition,
    target: record.target,
    source: record.source,
    // An empty Prisma JSON payload reads as "no payload", not as corruption.
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  });

  if (parsed.success) return { strategy: "valid", issues: [], repairs: [] };

  // Effects describe causally ordered rules; rewriting a broken condition,
  // target or source would change game meaning, so there is no auto-repair.
  return quarantine(parsed.error.issues.map(formatZodIssue));
}

export function inspectAuditRecord(record: AuditRecordForIntegrity): JsonIntegrityFinding {
  const issues: string[] = [];
  if (!isPlainObject(record.metadata)) issues.push("Audit metadata must be a JSON object");
  if (record.entityType !== undefined && (typeof record.entityType !== "string" || !record.entityType.trim())) {
    issues.push("Audit entity type must be a non-empty string");
  }
  // AuditLog is append-only: findings are quarantined for review and can only
  // be released, never rewritten.
  return issues.length ? quarantine(issues) : { strategy: "valid", issues: [], repairs: [] };
}

export function inspectJsonObjectField(field: string, value: unknown): JsonIntegrityFinding {
  if (isPlainObject(value)) return { strategy: "valid", issues: [], repairs: [] };
  return {
    strategy: "repair",
    issues: [`${field} must be a JSON object`],
    repairs: ["RESET_NON_OBJECT_JSON_FIELD"],
    repairedValue: {},
  };
}

/**
 * JSON columns that persist a list of node types (for example
 * `TemplateSlot.acceptedTypes`). Unsupported entries are filtered out; an
 * empty result has no meaning, so it is quarantined instead.
 */
export function inspectNodeTypeArrayField(field: string, value: unknown): JsonIntegrityFinding {
  const items = Array.isArray(value) ? value : null;
  const filtered = (items ?? []).filter((item) => typeof item === "string" && nodeTypeSchema.safeParse(item).success);
  if (items && filtered.length === items.length) return { strategy: "valid", issues: [], repairs: [] };
  if (!filtered.length) return quarantine([`${field} must be a non-empty list of node types`]);
  return {
    strategy: "repair",
    issues: [`${field} contains unsupported node types`],
    repairs: ["FILTERED_INVALID_ENUM_VALUE"],
    repairedValue: filtered,
  };
}


type NodeRecordParsing = { ok: true; data: unknown; issues: string[] } | { ok: false; issues: string[] };

function safeParseNodeData(type: NodeType, value: unknown): NodeRecordParsing {
  try {
    return { ok: true, data: parseNodeData(type, value), issues: [] };
  } catch (error) {
    return { ok: false, issues: formatIssues(error) };
  }
}

function quarantine(issues: string[]): JsonIntegrityFinding {
  return { strategy: "quarantine", issues: issues.length ? issues : ["Persisted JSON is invalid"], repairs: [] };
}

const typeKeys: Record<NodeType, string[]> = {
  NUMBER: ["value", "min", "max", "allowNegative"],
  BAR: ["current", "min", "max"],
  TEXT: ["text"],
  TABLE: ["columns", "rows"],
  CONTAINER: [],
  GROUP: ["color"],
  LINK: ["targetKind", "targetNodeId", "targetCharacterId"],
};

function normalizeNodeData(
  type: NodeType,
  raw: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  copyPresentation(raw, result, repairs);

  const allowed = allowedKeysFor(type, raw);
  for (const key of Object.keys(raw)) {
    if (key !== "description" && key !== "icon" && key !== "accentColor" && key !== "collapsedByDefault" && key !== "hiddenFromPlayer" && !allowed.includes(key)) {
      repairs.push("DROPPED_UNKNOWN_PROPERTY");
    }
  }

  switch (type) {
    case "NUMBER": return normalizeNumber(raw, result, repairs);
    case "BAR": return normalizeBar(raw, result, repairs);
    case "TEXT": return normalizeText(raw, result, repairs);
    case "TABLE": return normalizeTable(raw, result, repairs);
    case "GROUP": return normalizeGroup(raw, result, repairs);
    case "LINK": return normalizeLink(raw, result);
    default: return result;
  }
}

function allowedKeysFor(type: NodeType, raw: Record<string, unknown>) {
  if (type !== "LINK") return typeKeys[type];
  return raw.targetKind === "character" ? ["targetKind", "targetCharacterId"] : ["targetKind", "targetNodeId"];
}

function normalizeNumber(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  const coerced = coerceFiniteNumber(raw.value);
  let value: number;
  if (coerced !== undefined) {
    value = coerced;
    if (typeof raw.value !== "number") repairs.push("COERCED_NUMBER");
  } else if (raw.value === undefined || raw.value === null) {
    value = 0;
    repairs.push("ADDED_DEFAULT_VALUE");
  } else {
    return null;
  }
  result.value = value;

  const min = normalizeBound(raw.min, repairs);
  const max = normalizeBound(raw.max, repairs);
  if (typeof min === "number" && typeof max === "number" && min > max) {
    repairs.push("DROPPED_CONFLICTING_BOUND");
  } else if (min !== undefined) {
    result.min = min;
  }
  if (max !== undefined) result.max = max;

  if (typeof raw.allowNegative === "boolean") {
    result.allowNegative = raw.allowNegative;
  } else if (raw.allowNegative !== undefined) {
    repairs.push("DROPPED_INVALID_PROPERTY");
  }
  if (value < 0 && result.allowNegative !== true) {
    // Clamping would destroy the saved number, so the bound is relaxed instead.
    result.allowNegative = true;
    repairs.push("ENABLED_ALLOW_NEGATIVE");
  }
  return result;
}

function normalizeBar(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  const current = coerceFiniteNumber(raw.current);
  if (current === undefined) return null;
  if (typeof raw.current !== "number") repairs.push("COERCED_NUMBER");
  result.current = current;

  const max = coerceFiniteNumber(raw.max);
  if (max === undefined || max < 0) {
    // Bar max is required and non-negative; derive the smallest valid value.
    result.max = Math.max(current, 0);
    repairs.push("DERIVED_BAR_MAX");
  } else {
    if (typeof raw.max !== "number") repairs.push("COERCED_NUMBER");
    result.max = max;
  }

  const min = normalizeBound(raw.min, repairs);
  if (typeof min === "number" && min > (result.max as number)) {
    repairs.push("DROPPED_CONFLICTING_BOUND");
  } else if (min !== undefined) {
    result.min = min;
  }
  return result;
}

function normalizeText(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  if (typeof raw.text === "string") {
    if (raw.text.length > 100_000) {
      result.text = raw.text.slice(0, 100_000);
      repairs.push("TRUNCATED_TEXT_FIELD");
    } else {
      result.text = raw.text;
    }
    return result;
  }
  if (raw.text === undefined || raw.text === null) {
    result.text = "";
    repairs.push("ADDED_DEFAULT_VALUE");
    return result;
  }
  return null;
}

function normalizeBound(value: unknown, repairs: JsonIntegrityRepairCode[]) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const coerced = coerceFiniteNumber(value);
  if (coerced === undefined) {
    repairs.push("DROPPED_INVALID_PROPERTY");
    return undefined;
  }
  if (typeof value !== "number") repairs.push("COERCED_NUMBER");
  return coerced;
}

function normalizeTable(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  if (!Array.isArray(raw.columns)) return null;

  const columns: Array<{ id: string; label: string; type: TableColumnType }> = [];
  const seenIds = new Set<string>();
  for (const entry of raw.columns.slice(0, 200)) {
    const column = normalizeColumn(entry, repairs);
    if (!column) continue;
    if (seenIds.has(column.id)) {
      repairs.push("DROPPED_DUPLICATE_COLUMN");
      continue;
    }
    seenIds.add(column.id);
    columns.push(column);
  }
  if (raw.columns.length > 200) repairs.push("DROPPED_INVALID_COLUMN");
  result.columns = columns;

  if (!Array.isArray(raw.rows)) {
    result.rows = [];
    if (raw.rows !== undefined) repairs.push("ADDED_DEFAULT_VALUE");
    return result;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const entry of raw.rows.slice(0, 10_000)) {
    if (!isPlainObject(entry)) {
      repairs.push("DROPPED_INVALID_TABLE_ROW");
      continue;
    }
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      const type = columns.find((column) => column.id === key)?.type;
      if (!type) {
        repairs.push("DROPPED_UNKNOWN_TABLE_COLUMN");
        continue;
      }
      if (!isValidCell(value, type)) {
        repairs.push("DROPPED_INVALID_TABLE_CELL");
        continue;
      }
      row[key] = value;
    }
    rows.push(row);
  }
  if (raw.rows.length > 10_000) repairs.push("DROPPED_INVALID_TABLE_ROW");
  result.rows = rows;
  return result;
}

function normalizeColumn(entry: unknown, repairs: JsonIntegrityRepairCode[]): { id: string; label: string; type: TableColumnType } | null {
  if (!isPlainObject(entry)) {
    repairs.push("DROPPED_INVALID_COLUMN");
    return null;
  }
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const rawLabel = typeof entry.label === "string" ? entry.label.trim() : "";
  const type = entry.type === "number" || entry.type === "text" || entry.type === "boolean" || entry.type === "bar" ? entry.type : null;
  if (!id || !rawLabel || !type) {
    repairs.push("DROPPED_INVALID_COLUMN");
    return null;
  }
  if (rawLabel.length > 200) repairs.push("TRUNCATED_TEXT_FIELD");
  return { id, label: rawLabel.slice(0, 200), type };
}

function normalizeGroup(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  if (raw.color === undefined) return result;
  const color = typeof raw.color === "string" ? raw.color.trim() : "";
  if (color && color.length <= 100) {
    result.color = color;
    return result;
  }
  repairs.push("DROPPED_INVALID_PROPERTY");
  return result;
}

function normalizeLink(raw: Record<string, unknown>, result: Record<string, unknown>) {
  const targetId = raw.targetKind === "node"
    ? raw.targetNodeId
    : raw.targetKind === "character"
      ? raw.targetCharacterId
      : undefined;
  if (raw.targetKind !== "node" && raw.targetKind !== "character") return null;
  if (typeof targetId !== "string" || !targetId.trim()) return null;

  result.targetKind = raw.targetKind;
  if (raw.targetKind === "node") result.targetNodeId = targetId.trim();
  else result.targetCharacterId = targetId.trim();
  return result;
}

function copyPresentation(
  raw: Record<string, unknown>,
  result: Record<string, unknown>,
  repairs: JsonIntegrityRepairCode[],
) {
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") {
      repairs.push("DROPPED_INVALID_PROPERTY");
    } else if (raw.description.length > 10_000) {
      result.description = raw.description.slice(0, 10_000);
      repairs.push("TRUNCATED_TEXT_FIELD");
    } else {
      result.description = raw.description;
    }
  }

  if (raw.icon !== undefined) {
    if (typeof raw.icon === "string" && (NODE_ICON_NAMES as readonly string[]).includes(raw.icon)) result.icon = raw.icon;
    else repairs.push("DROPPED_INVALID_PROPERTY");
  }

  if (raw.accentColor !== undefined) {
    if (typeof raw.accentColor === "string" && (TEMPLATE_TAG_COLOR_NAMES as readonly string[]).includes(raw.accentColor)) {
      result.accentColor = raw.accentColor;
    } else {
      repairs.push("DROPPED_INVALID_PROPERTY");
    }
  }

  for (const key of ["collapsedByDefault", "hiddenFromPlayer"] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === "boolean") result[key] = raw[key];
    else repairs.push("DROPPED_INVALID_PROPERTY");
  }
}

function isValidCell(value: unknown, type: TableColumnType) {
  if (type === "text") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (!isPlainObject(value)) return false;
  return typeof value.current === "number" && Number.isFinite(value.current)
    && typeof value.max === "number" && Number.isFinite(value.max);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatIssues(error: unknown): string[] {
  if (isZodError(error)) return error.issues.map(formatZodIssue);
  if (error instanceof Error) return [error.message];
  return ["Persisted JSON is invalid"];
}

function formatZodIssue(issue: { path: ReadonlyArray<PropertyKey>; message: string }) {
  const path = issue.path.length ? `${issue.path.map(String).join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function isZodError(error: unknown): error is { issues: Array<{ path: ReadonlyArray<PropertyKey>; message: string }> } {
  return typeof error === "object"
    && error !== null
    && "issues" in error
    && Array.isArray((error as { issues?: unknown }).issues);
}

/** Read-only views shared by the server service, API contract and UI. */
export type JsonIntegrityScope =
  | { kind: "character"; characterId: string }
  | { kind: "template"; templateId: string };

export type JsonIntegrityEntry = {
  entityType: JsonIntegrityEntityType;
  entityId: string;
  entityName: string;
  field: string;
  strategy: Exclude<JsonIntegrityStrategy, "valid">;
  repairable: boolean;
  issues: string[];
  repairs: JsonIntegrityRepairCode[];
};

export type JsonIntegrityQuarantineView = {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  field: string;
  strategy: string;
  status: string;
  repairable: boolean;
  reasons: string[];
  repairs: string[];
  detectedAt: string;
  resolvedAt: string | null;
};

export type JsonIntegrityReport = {
  scope: JsonIntegrityScope;
  workspaceId: string | null;
  entries: JsonIntegrityEntry[];
  quarantine: JsonIntegrityQuarantineView[];
  summary: {
    invalid: number;
    repairable: number;
    manual: number;
    activeQuarantine: number;
  };
};

export type JsonIntegrityApplyResult = {
  scope: JsonIntegrityScope;
  action: "repair" | "quarantine";
  repaired: number;
  quarantined: number;
  entries: JsonIntegrityEntry[];
};

