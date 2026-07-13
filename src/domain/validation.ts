import { z } from "zod";
import type { CreateNodePayload, EffectCondition, EffectDefinition, EffectSource, EffectTarget, FormulaExpression } from "@/domain/effects";
import { NODE_ICON_NAMES, type NodeData, type NodeType, type TableColumnType } from "@/domain/nodes";
import { TEMPLATE_TAG_COLOR_NAMES } from "@/domain/template-tags";

const idSchema = z.string().trim().min(1, "Identifier is required");
const nameSchema = z.string().trim().min(1, "Name is required").max(200);
const descriptionSchema = z.string().max(10_000).optional();
const iconSchema = z.enum(NODE_ICON_NAMES).optional();
const finiteNumberSchema = z.number().finite();
const usernameSchema = z.string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9_]+$/, "Username can contain only latin letters, numbers, and underscores");
const accountIdentifierSchema = z.string().trim().toLowerCase().min(3).max(320);

const described = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    ...shape,
    description: descriptionSchema,
    icon: iconSchema,
    collapsedByDefault: z.boolean().optional(),
    hiddenFromPlayer: z.boolean().optional(),
  }).strict();

export const numberNodeDataSchema = described({
  value: finiteNumberSchema,
  min: finiteNumberSchema.nullable().optional(),
  max: finiteNumberSchema.nullable().optional(),
  allowNegative: z.boolean().optional(),
}).superRefine((data, context) => {
  if (data.min != null && data.max != null && data.min > data.max) {
    context.addIssue({ code: "custom", path: ["min"], message: "Minimum cannot exceed maximum" });
  }
  if (!data.allowNegative && data.value < 0) {
    context.addIssue({ code: "custom", path: ["value"], message: "Negative values are not allowed" });
  }
});

export const barNodeDataSchema = described({
  current: finiteNumberSchema,
  min: finiteNumberSchema.nullable().optional(),
  max: finiteNumberSchema.nonnegative(),
}).superRefine((data, context) => {
  if (data.min != null && data.min > data.max) {
    context.addIssue({ code: "custom", path: ["min"], message: "Minimum cannot exceed maximum" });
  }
});

export const textNodeDataSchema = described({ text: z.string().max(100_000) });

const tableColumnSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(200),
  type: z.enum(["number", "text", "boolean", "bar"]),
}).strict();

export const tableNodeDataSchema = described({
  columns: z.array(tableColumnSchema).max(200),
  rows: z.array(z.record(z.string(), z.json())).max(10_000),
}).superRefine((data, context) => {
  const columnIds = new Set<string>();
  for (const [index, column] of data.columns.entries()) {
    if (columnIds.has(column.id)) {
      context.addIssue({ code: "custom", path: ["columns", index, "id"], message: "Column IDs must be unique" });
    }
    columnIds.add(column.id);
  }

  const columnsById = new Map(data.columns.map((column) => [column.id, column.type]));
  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [columnId, value] of Object.entries(row)) {
      const type = columnsById.get(columnId);
      if (!type) {
        context.addIssue({ code: "custom", path: ["rows", rowIndex, columnId], message: "Row contains a value for an unknown column" });
        continue;
      }
      if (!isValidTableCell(value, type)) {
        context.addIssue({ code: "custom", path: ["rows", rowIndex, columnId], message: `Invalid ${type} table cell` });
      }
    }
  }
});

export const containerNodeDataSchema = described({});
export const groupNodeDataSchema = described({
  color: z.string().trim().max(100).optional(),
});

export const nodeTypeSchema = z.enum(["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"]);

const nodeDataSchemas = {
  NUMBER: numberNodeDataSchema,
  BAR: barNodeDataSchema,
  TEXT: textNodeDataSchema,
  TABLE: tableNodeDataSchema,
  CONTAINER: containerNodeDataSchema,
  GROUP: groupNodeDataSchema,
} satisfies Record<NodeType, z.ZodType>;

export function parseNodeData(type: NodeType, value: unknown): NodeData {
  return nodeDataSchemas[type].parse(value) as NodeData;
}

function isValidTableCell(value: unknown, type: TableColumnType) {
  if (type === "text") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "bar") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.current === "number" && Number.isFinite(record.current)
      && typeof record.max === "number" && Number.isFinite(record.max);
  }
  return false;
}

export const createNodeCommandSchema = z.discriminatedUnion("type", [
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("NUMBER"), name: nameSchema, data: numberNodeDataSchema }).strict(),
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("BAR"), name: nameSchema, data: barNodeDataSchema }).strict(),
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("TEXT"), name: nameSchema, data: textNodeDataSchema }).strict(),
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("TABLE"), name: nameSchema, data: tableNodeDataSchema }).strict(),
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("CONTAINER"), name: nameSchema, data: containerNodeDataSchema }).strict(),
  z.object({ parentId: idSchema.nullable().optional(), type: z.literal("GROUP"), name: nameSchema, data: groupNodeDataSchema }).strict(),
]);

export const updateNodeCommandSchema = z.object({
  name: nameSchema.optional(),
  parentId: idSchema.nullable().optional(),
  data: z.unknown().optional(),
}).strict().refine((value) => value.name !== undefined || value.parentId !== undefined || value.data !== undefined, {
  message: "At least one field must be provided",
});

export const formulaExpressionSchema: z.ZodType<FormulaExpression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("const"), value: finiteNumberSchema }).strict(),
    z.object({ kind: z.literal("ref"), nodeId: idSchema, field: z.enum(["value", "current", "min", "max"]).optional() }).strict(),
    z.object({ kind: z.literal("slotRef"), slotId: idSchema, field: z.enum(["value", "current", "min", "max"]).optional() }).strict(),
    z.object({
      kind: z.enum(["add", "subtract", "multiply", "divide"]),
      left: formulaExpressionSchema,
      right: formulaExpressionSchema,
    }).strict(),
  ]),
);

export const effectSourceSchema: z.ZodType<EffectSource> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), value: finiteNumberSchema }).strict(),
  z.object({ kind: z.literal("node"), nodeId: idSchema, field: z.enum(["value", "current", "min", "max"]).optional() }).strict(),
  z.object({ kind: z.literal("templateSlot"), slotId: idSchema, field: z.enum(["value", "current", "min", "max"]).optional() }).strict(),
  z.object({ kind: z.literal("formula"), expression: formulaExpressionSchema }).strict(),
]);

export const effectConditionSchema: z.ZodType<EffectCondition> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("always") }).strict(),
    z.object({ kind: z.literal("fieldExists"), nodeId: idSchema }).strict(),
    z.object({ kind: z.literal("slotExists"), slotId: idSchema }).strict(),
    z.object({
      kind: z.literal("compare"),
      nodeId: idSchema,
      operator: z.enum(["gt", "lt", "eq"]),
      value: effectSourceSchema,
    }).strict(),
    z.object({
      kind: z.literal("compareSlot"),
      slotId: idSchema,
      operator: z.enum(["gt", "lt", "eq"]),
      value: effectSourceSchema,
    }).strict(),
    z.object({ kind: z.literal("and"), conditions: z.array(effectConditionSchema).min(1).max(20) }).strict(),
    z.object({ kind: z.literal("or"), conditions: z.array(effectConditionSchema).min(1).max(20) }).strict(),
    z.object({ kind: z.literal("not"), condition: effectConditionSchema }).strict(),
  ]),
);

export const effectTargetSchema: z.ZodType<EffectTarget> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("node"), nodeId: idSchema }).strict(),
  z.object({ kind: z.literal("templateSlot"), slotId: idSchema }).strict(),
  z.object({ kind: z.literal("path"), path: z.string().trim().min(1).max(2_000) }).strict(),
  z.object({ kind: z.literal("parent"), parentNodeId: idSchema }).strict(),
  z.object({ kind: z.literal("root") }).strict(),
]);

export const createNodePayloadSchema: z.ZodType<CreateNodePayload> = z.lazy(() =>
  z.object({
    type: nodeTypeSchema,
    name: nameSchema,
    data: z.record(z.string(), z.json()),
    children: z.array(createNodePayloadSchema).max(100).optional(),
  }).strict().superRefine((value, context) => {
    const result = nodeDataSchemas[value.type].safeParse(value.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: ["data", ...issue.path],
          message: issue.message,
        });
      }
    }
  }),
);

export const effectOperationSchema = z.enum([
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "PERCENT_BONUS",
  "CREATE_NODE",
  "CREATE_GROUP",
  "SET_BAR_MAX",
  "PATCH_NODE_PROPS",
]);

export const effectPayloadSchema: z.ZodType<NonNullable<EffectDefinition["payload"]>> = z.object({
  createNode: createNodePayloadSchema.optional(),
  patch: z.record(z.string(), z.json()).optional(),
  patchFromSource: z.object({ field: idSchema }).strict().optional(),
  numericField: idSchema.optional(),
}).strict();

export const effectDefinitionSchema: z.ZodType<EffectDefinition> = z.object({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  operation: effectOperationSchema,
  priority: z.number().int(),
  sourceNodeId: idSchema.nullable().optional(),
  condition: effectConditionSchema,
  target: effectTargetSchema,
  source: effectSourceSchema,
  payload: effectPayloadSchema.optional(),
}).strict();

export const numericEffectCommandSchema = z.object({
  name: nameSchema,
  operation: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "PERCENT_BONUS", "SET_BAR_MAX"]),
  targetNodeId: idSchema,
  numericField: idSchema.optional(),
  source: effectSourceSchema,
  condition: effectConditionSchema,
}).strict();

export const structuralEffectCommandSchema = z.object({
  name: nameSchema,
  operation: z.enum(["CREATE_NODE", "CREATE_GROUP", "PATCH_NODE_PROPS"]),
  targetNodeId: idSchema.nullable().optional(),
  source: effectSourceSchema.optional(),
  condition: effectConditionSchema,
  createNode: createNodePayloadSchema.optional(),
  patch: z.record(z.string(), z.json()).optional(),
  patchFromSource: z.object({ field: idSchema }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.operation !== "PATCH_NODE_PROPS" && !value.createNode) {
    context.addIssue({ code: "custom", path: ["createNode"], message: "Node payload is required" });
  }
  if (value.operation === "PATCH_NODE_PROPS" && !value.patch) {
    context.addIssue({ code: "custom", path: ["patch"], message: "Patch payload is required" });
  }
  if (value.operation === "PATCH_NODE_PROPS" && !value.targetNodeId) {
    context.addIssue({ code: "custom", path: ["targetNodeId"], message: "Patch target is required" });
  }
});

export const createEffectCommandSchema = z.union([numericEffectCommandSchema, structuralEffectCommandSchema]);

const updateEffectMetadataSchema = z.object({
  name: nameSchema.optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-10_000).max(10_000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

const effectReplacementFields = {
  enabled: z.boolean().optional(),
  priority: z.number().int().min(-10_000).max(10_000).optional(),
};

const replaceEffectCommandSchema = z.union([
  numericEffectCommandSchema.extend(effectReplacementFields),
  structuralEffectCommandSchema.safeExtend(effectReplacementFields),
]);

export const updateEffectCommandSchema = z.union([replaceEffectCommandSchema, updateEffectMetadataSchema]);

export const createCharacterCommandSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  ownerId: idSchema.optional(),
  templateId: idSchema.optional(),
}).strict();

export const updateCharacterCommandSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  ownerId: idSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export const characterAssignmentCommandSchema = z.object({
  userId: idSchema,
}).strict();

export const applyTemplateCommandSchema = z.object({
  templateId: idSchema,
  parentNodeId: idSchema.nullable().optional(),
  bindings: z.record(idSchema, idSchema).optional(),
}).strict();

export const applyTemplateToTemplateCommandSchema = z.object({
  sourceTemplateId: idSchema,
  parentNodeId: idSchema.nullable().optional(),
}).strict();

export const templateSlotDirectionSchema = z.enum(["INPUT", "OUTPUT", "BIDIRECTIONAL"]);

export const createTemplateSlotCommandSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Slot key must start with a latin letter and contain only latin letters, numbers, and underscores"),
  label: nameSchema,
  description: descriptionSchema,
  direction: templateSlotDirectionSchema,
  acceptedTypes: z.array(nodeTypeSchema).min(1).max(6),
  required: z.boolean().optional(),
}).strict();

export const updateTemplateSlotCommandSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  label: nameSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  direction: templateSlotDirectionSchema.optional(),
  acceptedTypes: z.array(nodeTypeSchema).min(1).max(6).optional(),
  required: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export const templateKindSchema = z.enum(["CHARACTER", "ITEM", "SKILL", "PASSIVE_TALENT", "MUTATION", "BODY_PART", "OTHER"]);

export const createTemplateCommandSchema = z.object({
  kind: templateKindSchema.optional(),
  name: nameSchema,
  description: descriptionSchema,
  isDefaultCharacter: z.boolean().optional(),
}).strict();

export const updateTemplateCommandSchema = z.object({
  name: nameSchema.optional(),
  description: z.string().max(10_000).optional(),
  isDefaultCharacter: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export const templateTagColorSchema = z.enum(TEMPLATE_TAG_COLOR_NAMES);

export const createTemplateTagCommandSchema = z.object({
  templateId: idSchema,
  name: nameSchema,
  color: templateTagColorSchema.optional(),
}).strict();

export const updateTemplateTagCommandSchema = z.object({
  templateId: idSchema,
  tagId: idSchema,
  name: nameSchema.optional(),
  color: templateTagColorSchema.optional(),
}).strict().refine((value) => value.name !== undefined || value.color !== undefined, { message: "At least one field must be provided" });

export const updateTemplateTagBodyCommandSchema = z.object({
  name: nameSchema.optional(),
  color: templateTagColorSchema.optional(),
}).strict().refine((value) => value.name !== undefined || value.color !== undefined, { message: "At least one field must be provided" });

export const deleteTemplateTagCommandSchema = z.object({
  templateId: idSchema,
  tagId: idSchema,
}).strict();

export const assignTemplateTagCommandSchema = z.object({
  templateId: idSchema,
  tagId: idSchema,
}).strict();

export const unassignTemplateTagCommandSchema = assignTemplateTagCommandSchema;

export const recalculateCommandSchema = z.object({ changedNodeIds: z.array(idSchema).max(10_000).optional() }).strict();

export const selectWorkspaceCommandSchema = z.object({
  workspaceId: idSchema,
}).strict();

export const createWorkspaceCommandSchema = z.object({
  name: nameSchema,
}).strict();

export const updateWorkspaceCommandSchema = z.object({
  workspaceId: idSchema,
  name: nameSchema,
}).strict();

export const deleteWorkspaceCommandSchema = z.object({
  workspaceId: idSchema,
}).strict();

export const workspaceRoleSchema = z.enum(["OWNER", "GM", "PLAYER"]);

export const addWorkspaceMemberCommandSchema = z.object({
  workspaceId: idSchema,
  identifier: accountIdentifierSchema,
  role: workspaceRoleSchema,
}).strict();

export const updateWorkspaceMemberCommandSchema = z.object({
  workspaceId: idSchema,
  membershipId: idSchema,
  role: workspaceRoleSchema,
}).strict();

export const removeWorkspaceMemberCommandSchema = z.object({
  workspaceId: idSchema,
  membershipId: idSchema,
}).strict();

export const registerAccountCommandSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  username: usernameSchema,
  password: z.string().trim().min(8).max(200),
}).strict();
