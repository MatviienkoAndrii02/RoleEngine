"use client";

import { useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import type { EffectSource, TriggeredEffectAction } from "@/domain/effects";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { getPatchFields, getNumericPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { EffectSourceEditor, readEditableEffectSource, type EditableEffectSourceKind } from "@/components/characters/effect-source-editor";
import { nodeSummary, numericActionSummary, triggeredActionSummary } from "@/components/characters/effect-summary";
import { NodeAccentColorPicker } from "@/components/characters/node-accent-color-picker";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

export type TriggeredActionRow = {
  id: string;
  kind: "NUMERIC" | "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS";
  sourceKind: EditableEffectSourceKind;
  targetNodeId: string;
  createdType: NodeType;
  patchField: string;
};

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const numericActions = ["SET", "ADD", "SUBTRACT", "MULTIPLY"] as const;
const creatableNodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP", "LINK"];
const commonNumericFields: PatchFieldDefinition[] = [
  { field: "value", labelKey: "common.value", kind: "number", derived: false },
  { field: "min", labelKey: "node.minimum", kind: "number", derived: false },
  { field: "max", labelKey: "node.maximum", kind: "number", derived: false },
];
const commonStructuralFields: PatchFieldDefinition[] = [
  { field: "collapsedByDefault", labelKey: "node.collapsedDefault", kind: "boolean", derived: false },
  { field: "hiddenFromPlayer", labelKey: "node.hiddenFromPlayer", kind: "boolean", derived: false },
  { field: "description", labelKey: "common.description", kind: "text", derived: false },
  { field: "icon", labelKey: "icons.label", kind: "text", derived: false },
  { field: "accentColor", labelKey: "node.accentColor", kind: "text", derived: false },
];
const commonPatchFields = uniquePatchFields([...commonNumericFields, ...commonStructuralFields]);

export function TriggeredActionEditor({
  row,
  index,
  rowsCount,
  nodes,
  slots = [],
  numericNodes,
  containers,
  numericSlotOptions,
  containerSlotOptions,
  allSlotOptions,
  rootLabel,
  fieldNamespace,
  originalAction,
  setRows,
  defaultOpen,
  showValidationErrors = false,
}: {
  row: TriggeredActionRow;
  index: number;
  rowsCount: number;
  nodes: CharacterNodeModel[];
  slots?: TemplateSlotModel[];
  numericNodes: CharacterNodeModel[];
  containers: CharacterNodeModel[];
  numericSlotOptions: Array<{ value: string; label: string }>;
  containerSlotOptions: Array<{ value: string; label: string }>;
  allSlotOptions: Array<{ value: string; label: string }>;
  rootLabel: string;
  fieldNamespace: "action" | "edit-action";
  originalAction?: TriggeredEffectAction;
  setRows: Dispatch<SetStateAction<TriggeredActionRow[]>>;
  defaultOpen?: boolean;
  showValidationErrors?: boolean;
}) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);
  const rowError = showValidationErrors && actionRequiresTarget(row) && !row.targetNodeId ? t("effect.inlineTargetRequired") : undefined;

  function dropAction(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const draggedId = event.dataTransfer.getData("application/x-role-engine-action-id");
    if (!draggedId || draggedId === row.id) return;
    moveTriggeredActionRow(setRows, draggedId, row.id);
  }

  return (
    <div
      className={dragOver ? "rounded-md ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={dropAction}
    >
      <EffectEditorSection
        title={t("effect.actionNumber", { count: index + 1 })}
        summary={actionRowSummary(row, originalAction, nodes, numericNodes, containers, slots, rootLabel, t)}
        defaultOpen={defaultOpen}
        error={rowError}
      >
        <div className="flex items-start gap-2">
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-role-engine-action-id", row.id);
              }}
              aria-label={t("effect.reorderAction")}
              title={t("effect.reorderAction")}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === 0}
                onClick={() => moveTriggeredActionByOffset(setRows, row.id, -1)}
                aria-label={t("effect.moveActionUp")}
                title={t("effect.moveActionUp")}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={index === rowsCount - 1}
                onClick={() => moveTriggeredActionByOffset(setRows, row.id, 1)}
                aria-label={t("effect.moveActionDown")}
                title={t("effect.moveActionDown")}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <select
                value={row.kind}
                onChange={(event) => {
                  const nextKind = event.target.value as TriggeredActionRow["kind"];
                  if (nextKind === row.kind) return;
                  if (hasActionDraftData(row) && !window.confirm(t("effect.changeActionTypeConfirm"))) {
                    event.target.value = row.kind;
                    return;
                  }
                  updateTriggeredActionRow(setRows, row.id, { kind: nextKind, targetNodeId: "", patchField: "" });
                }}
                className={selectClass}
              >
                <option value="NUMERIC">{t("effect.setNumericField")}</option>
                <option value="CREATE_NODE">{t("effect.createNode")}</option>
                <option value="CREATE_GROUP">{t("effect.createGroup")}</option>
                <option value="PATCH_NODE_PROPS">{t("effect.patchNode")}</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rowsCount === 1}
                className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : current)}
              >
                <Trash2 className="h-4 w-4" />
                {t("effect.removeAction")}
              </Button>
            </div>
            {row.kind === "NUMERIC" && (
              <NumericActionFields row={row} index={index} numericNodes={numericNodes} numericSlotOptions={numericSlotOptions} originalAction={originalAction?.kind === "NUMERIC" ? originalAction : undefined} fieldNamespace={fieldNamespace} setRows={setRows} />
            )}
            {(row.kind === "CREATE_NODE" || row.kind === "CREATE_GROUP") && (
              <CreateActionFields row={row} index={index} containers={containers} containerSlotOptions={containerSlotOptions} rootLabel={rootLabel} originalAction={originalAction?.kind === "CREATE_NODE" || originalAction?.kind === "CREATE_GROUP" ? originalAction : undefined} fieldNamespace={fieldNamespace} setRows={setRows} />
            )}
            {row.kind === "PATCH_NODE_PROPS" && (
              <PatchActionFields row={row} index={index} nodes={nodes} slots={slots} allSlotOptions={allSlotOptions} originalAction={originalAction?.kind === "PATCH_NODE_PROPS" ? originalAction : undefined} fieldNamespace={fieldNamespace} setRows={setRows} />
            )}
          </div>
        </div>
      </EffectEditorSection>
    </div>
  );
}

function NumericActionFields({ row, index, numericNodes, numericSlotOptions, originalAction, fieldNamespace, setRows }: { row: TriggeredActionRow; index: number; numericNodes: CharacterNodeModel[]; numericSlotOptions: Array<{ value: string; label: string }>; originalAction?: Extract<TriggeredEffectAction, { kind: "NUMERIC" }>; fieldNamespace: string; setRows: Dispatch<SetStateAction<TriggeredActionRow[]>> }) {
  const { t } = useI18n();
  const prefix = fieldPrefix(fieldNamespace, index);
  const selected = parseTemplateSelectValue(row.targetNodeId);
  const target = selected.kind === "node" ? numericNodes.find((node) => node.id === selected.id) ?? null : null;
  const fields = target ? getNumericPatchFields(target.type) : commonNumericFields;
  return (
    <div className="space-y-3">
      <NodePicker name={`${prefix}-targetNodeId`} nodes={numericNodes} value={row.targetNodeId} onChange={(value) => updateTriggeredActionRow(setRows, row.id, { targetNodeId: value })} extraOptions={numericSlotOptions} allowedTypes={["NUMBER", "BAR"]} required placeholder={t("effect.selectTarget")} compact />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name={`${prefix}-field`} required defaultValue={originalAction?.field ?? "value"} className={selectClass}>{fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select>
        <select name={`${prefix}-operation`} required defaultValue={originalAction?.operation ?? "ADD"} className={selectClass}>{numericActions.map((operation) => <option key={operation} value={operation}>{triggerActionLabel(operation, t)}</option>)}</select>
      </div>
      <EffectSourceEditor
        kind={row.sourceKind}
        onKindChange={(sourceKind) => updateTriggeredActionRow(setRows, row.id, { sourceKind })}
        nodes={numericNodes}
        extraOptions={numericSlotOptions}
        prefix={prefix}
        defaultSource={originalAction?.source}
      />
    </div>
  );
}

function CreateActionFields({ row, index, containers, containerSlotOptions, rootLabel, originalAction, fieldNamespace, setRows }: { row: TriggeredActionRow; index: number; containers: CharacterNodeModel[]; containerSlotOptions: Array<{ value: string; label: string }>; rootLabel: string; originalAction?: Extract<TriggeredEffectAction, { kind: "CREATE_NODE" | "CREATE_GROUP" }>; fieldNamespace: string; setRows: Dispatch<SetStateAction<TriggeredActionRow[]>> }) {
  const { t } = useI18n();
  const prefix = fieldPrefix(fieldNamespace, index);
  const type = row.kind === "CREATE_GROUP" ? "GROUP" : row.createdType;
  const data = originalAction?.createNode.data ?? {};
  return (
    <div className="space-y-3">
      <NodePicker name={`${prefix}-parentNodeId`} nodes={containers} value={row.targetNodeId || "__ROOT__"} onChange={(value) => updateTriggeredActionRow(setRows, row.id, { targetNodeId: value })} extraOptions={containerSlotOptions} allowedTypes={["CONTAINER", "GROUP"]} includeRoot rootValue="__ROOT__" rootLabel={rootLabel} required placeholder={t("effect.place")} compact />
      <Input name={`${prefix}-createdName`} required defaultValue={originalAction?.createNode.name ?? ""} placeholder={t("effect.createdNodeName")} />
      {row.kind === "CREATE_NODE" && <select value={row.createdType} onChange={(event) => updateTriggeredActionRow(setRows, row.id, { createdType: event.target.value as NodeType })} className={selectClass}>{creatableNodeTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
      <Input name={`${prefix}-createdDescription`} defaultValue={String(data.description ?? "")} placeholder={t("common.description")} />
      <NodeIconPicker type={type} name={`${prefix}-icon`} defaultValue={typeof data.icon === "string" ? data.icon : undefined} />
      <NodeAccentColorPicker name={`${prefix}-accentColor`} defaultValue={typeof data.accentColor === "string" ? data.accentColor : undefined} />
      {type === "NUMBER" && <Input name={`${prefix}-createdValue`} type="number" step="any" defaultValue={String(data.value ?? "")} placeholder={t("common.value")} />}
      {type === "BAR" && <div className="grid grid-cols-2 gap-2"><Input name={`${prefix}-createdCurrent`} type="number" step="any" defaultValue={String(data.current ?? "")} placeholder={t("node.current")} /><Input name={`${prefix}-createdMax`} type="number" step="any" defaultValue={String(data.max ?? "")} placeholder={t("node.maximum")} /></div>}
      {type === "TEXT" && <textarea name={`${prefix}-createdText`} defaultValue={String(data.text ?? "")} className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm" placeholder={t("node.text")} />}
    </div>
  );
}

function PatchActionFields({ row, index, nodes, slots, allSlotOptions, originalAction, fieldNamespace, setRows }: { row: TriggeredActionRow; index: number; nodes: CharacterNodeModel[]; slots: TemplateSlotModel[]; allSlotOptions: Array<{ value: string; label: string }>; originalAction?: Extract<TriggeredEffectAction, { kind: "PATCH_NODE_PROPS" }>; fieldNamespace: string; setRows: Dispatch<SetStateAction<TriggeredActionRow[]>> }) {
  const { t } = useI18n();
  const prefix = fieldPrefix(fieldNamespace, index);
  const selected = parseTemplateSelectValue(row.targetNodeId);
  const target = selected.kind === "node" ? nodes.find((node) => node.id === selected.id) ?? null : null;
  const slot = selected.kind === "slot" ? slots.find((item) => item.id === selected.id) ?? null : null;
  const fields = target ? getPatchFields(target.type) : slot ? patchFieldsForSlot(slot) : commonPatchFields;
  const selectedField = fields.find((field) => field.field === row.patchField) ?? fields[0] ?? null;
  const patch = originalAction?.patch ?? {};
  return (
    <div className="space-y-3">
      <NodePicker name={`${prefix}-patchTargetNodeId`} nodes={nodes} value={row.targetNodeId} onChange={(value) => updateTriggeredActionRow(setRows, row.id, { targetNodeId: value, patchField: "" })} extraOptions={allSlotOptions} required placeholder={t("effect.patchTarget")} compact />
      <select name={`${prefix}-patchField`} required value={selectedField?.field ?? ""} onChange={(event) => updateTriggeredActionRow(setRows, row.id, { patchField: event.target.value })} className={selectClass}>{fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select>
      {selectedField && <PrefixedStaticPatchField field={selectedField} patch={patch} targetType={target?.type} prefix={prefix} />}
    </div>
  );
}

function PrefixedStaticPatchField({ field, patch, targetType, prefix }: { field: PatchFieldDefinition; patch: Record<string, unknown>; targetType?: NodeType; prefix: string }) {
  const { t } = useI18n();
  const value = patch[field.field];
  if (field.field === "icon" && targetType) return <NodeIconPicker type={targetType} name={`${prefix}-patchIcon`} defaultValue={typeof value === "string" ? value : undefined} />;
  if (field.field === "accentColor") return <NodeAccentColorPicker name={`${prefix}-patchTextValue`} defaultValue={typeof value === "string" ? value : undefined} />;
  if (field.kind === "boolean") {
    return <label className="flex items-center gap-2 text-sm"><input name={`${prefix}-patchBooleanValue`} type="checkbox" defaultChecked={Boolean(value)} />{t(field.labelKey)}</label>;
  }
  if (field.kind === "text") {
    return <Input name={`${prefix}-patchTextValue`} defaultValue={value == null ? "" : String(value)} placeholder={t(field.labelKey)} />;
  }
  return <Input name={`${prefix}-patchNumberValue`} type="number" step="any" defaultValue={value == null ? "" : String(value)} placeholder={t(field.labelKey)} />;
}

export function readTriggeredAction(row: TriggeredActionRow, data: FormData, index: number, nodes: CharacterNodeModel[], fieldNamespace: string): TriggeredEffectAction {
  const prefix = fieldPrefix(fieldNamespace, index);
  if (row.kind === "NUMERIC") {
    return {
      kind: "NUMERIC",
      targetNodeId: String(data.get(`${prefix}-targetNodeId`) ?? ""),
      field: String(data.get(`${prefix}-field`) ?? "value") as "value" | "current" | "min" | "max",
      operation: String(data.get(`${prefix}-operation`) ?? "ADD") as "SET" | "ADD" | "SUBTRACT" | "MULTIPLY",
      source: readEditableEffectSource(data, row.sourceKind, prefix),
    };
  }
  if (row.kind === "PATCH_NODE_PROPS") {
    return {
      kind: "PATCH_NODE_PROPS",
      targetNodeId: String(data.get(`${prefix}-patchTargetNodeId`) ?? ""),
      patch: readPrefixedPatch(row, data, nodes, prefix),
    };
  }
  const parentNodeId = String(data.get(`${prefix}-parentNodeId`) ?? "");
  const type = row.kind === "CREATE_GROUP" ? "GROUP" : row.createdType;
  return {
    kind: row.kind,
    parentNodeId: parentNodeId === "__ROOT__" ? null : parentNodeId,
    createNode: {
      type,
      name: String(data.get(`${prefix}-createdName`) ?? ""),
      data: readPrefixedCreatedData(type, data, prefix),
    },
  };
}

export function triggeredActionToRow(action: TriggeredEffectAction): TriggeredActionRow {
  if (action.kind === "NUMERIC") {
    return {
      id: createClientId(),
      kind: "NUMERIC",
      sourceKind: action.source.kind === "templateSlot" ? "node" : action.source.kind === "formula" ? "formula" : action.source.kind,
      targetNodeId: action.targetNodeId,
      createdType: "NUMBER",
      patchField: "",
    };
  }
  if (action.kind === "PATCH_NODE_PROPS") {
    return {
      id: createClientId(),
      kind: "PATCH_NODE_PROPS",
      sourceKind: "number",
      targetNodeId: action.targetNodeId,
      createdType: "NUMBER",
      patchField: Object.keys(action.patch)[0] ?? "",
    };
  }
  return {
    id: createClientId(),
    kind: action.kind,
    sourceKind: "number",
    targetNodeId: action.parentNodeId ?? "__ROOT__",
    createdType: action.createNode.type,
    patchField: "",
  };
}

export function newTriggeredActionRow(): TriggeredActionRow {
  return { id: createClientId(), kind: "NUMERIC", sourceKind: "number", targetNodeId: "", createdType: "NUMBER", patchField: "" };
}

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function updateTriggeredActionRow(setRows: Dispatch<SetStateAction<TriggeredActionRow[]>>, id: string, patch: Partial<TriggeredActionRow>) {
  setRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
}

export function moveTriggeredActionRow(setRows: Dispatch<SetStateAction<TriggeredActionRow[]>>, draggedId: string, targetId: string) {
  setRows((current) => {
    const from = current.findIndex((item) => item.id === draggedId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0 || from === to) return current;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
}

function moveTriggeredActionByOffset(setRows: Dispatch<SetStateAction<TriggeredActionRow[]>>, id: string, offset: -1 | 1) {
  setRows((current) => {
    const from = current.findIndex((item) => item.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= current.length) return current;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
}

function hasActionDraftData(row: TriggeredActionRow) {
  return Boolean(row.targetNodeId || row.patchField || row.sourceKind !== "number" || row.createdType !== "NUMBER");
}

function actionRowSummary(row: TriggeredActionRow, action: TriggeredEffectAction | undefined, nodes: CharacterNodeModel[], numericNodes: CharacterNodeModel[], containers: CharacterNodeModel[], slots: TemplateSlotModel[], rootLabel: string, t: ReturnType<typeof useI18n>["t"]) {
  if (action && action.kind === row.kind) return triggeredActionSummary(action, nodes, slots, t, rootLabel);
  if (row.kind === "NUMERIC") {
    const target = nodeSummary(numericNodes, row.targetNodeId, slots);
    return target ? numericActionSummary("ADD", target, "value", sourceKindSummary(row.sourceKind, t), t) : actionKindLabel(row.kind, t);
  }
  if (row.kind === "PATCH_NODE_PROPS") {
    const target = nodeSummary(nodes, row.targetNodeId, slots);
    return target ? `${target}: ${t("effect.patchNode")}` : t("effect.patchNode");
  }
  const parent = nodeSummary(containers, row.targetNodeId || "__ROOT__", slots, rootLabel) || rootLabel;
  return `${actionKindLabel(row.kind, t)} -> ${parent}`;
}

function actionKindLabel(kind: TriggeredActionRow["kind"], t: ReturnType<typeof useI18n>["t"]) {
  if (kind === "CREATE_NODE") return t("effect.createNode");
  if (kind === "CREATE_GROUP") return t("effect.createGroup");
  if (kind === "PATCH_NODE_PROPS") return t("effect.patchNode");
  return t("effect.setNumericField");
}

function actionRequiresTarget(row: TriggeredActionRow) {
  return row.kind === "NUMERIC" || row.kind === "PATCH_NODE_PROPS";
}

function sourceKindSummary(kind: TriggeredActionRow["sourceKind"], t: ReturnType<typeof useI18n>["t"]) {
  if (kind === "node") return t("effect.sourceNode");
  if (kind === "formula") return t("effect.sourceFormula");
  return t("effect.sourceNumber");
}

function triggerActionLabel(operation: (typeof numericActions)[number], t: ReturnType<typeof useI18n>["t"]) {
  return ({ SET: t("effect.triggerSet"), ADD: t("effect.add"), SUBTRACT: t("effect.subtract"), MULTIPLY: t("effect.multiply") } satisfies Record<(typeof numericActions)[number], string>)[operation];
}

function readPrefixedPatch(row: TriggeredActionRow, data: FormData, nodes: CharacterNodeModel[], prefix: string) {
  const fieldName = String(data.get(`${prefix}-patchField`) || row.patchField);
  const targetNodeIdValue = String(data.get(`${prefix}-patchTargetNodeId`) ?? "");
  const target = nodes.find((node) => node.id === targetNodeIdValue);
  const definition = (target ? getPatchFields(target.type) : commonPatchFields).find((field) => field.field === fieldName);
  if (fieldName === "icon") return { icon: String(data.get(`${prefix}-patchIcon`) ?? "") || undefined };
  if (fieldName === "accentColor") return { accentColor: String(data.get(`${prefix}-patchTextValue`) ?? "") || undefined };
  if (definition?.kind === "boolean") return { [fieldName]: data.get(`${prefix}-patchBooleanValue`) === "on" };
  if (definition?.kind === "number") return { [normalizePatchFieldName(target ?? null, fieldName)]: Number(data.get(`${prefix}-patchNumberValue`)) };
  return { [fieldName]: String(data.get(`${prefix}-patchTextValue`) ?? "") };
}

function patchFieldsForSlot(slot: TemplateSlotModel) {
  return uniquePatchFields(slot.acceptedTypes.flatMap((type) => getPatchFields(type)));
}

function uniquePatchFields(fields: PatchFieldDefinition[]) {
  const byName = new Map<string, PatchFieldDefinition>();
  for (const field of fields) {
    if (!byName.has(field.field)) byName.set(field.field, field);
  }
  return [...byName.values()];
}

function normalizePatchFieldName(target: CharacterNodeModel | null, fieldName: string) {
  return target?.type === "BAR" && fieldName === "value" ? "current" : fieldName;
}

function readPrefixedCreatedData(type: NodeType, data: FormData, prefix: string) {
  const icon = String(data.get(`${prefix}-icon`) ?? "");
  const accentColor = String(data.get(`${prefix}-accentColor`) ?? "");
  const common = { description: String(data.get(`${prefix}-createdDescription`) ?? ""), ...(icon ? { icon } : {}), ...(accentColor ? { accentColor } : {}) };
  if (type === "NUMBER") return { ...common, value: nullableNumber(data.get(`${prefix}-createdValue`)) ?? 0, min: null, max: null, allowNegative: true };
  if (type === "BAR") return { ...common, current: nullableNumber(data.get(`${prefix}-createdCurrent`)) ?? 0, max: nullableNumber(data.get(`${prefix}-createdMax`)) ?? 10 };
  if (type === "TEXT") return { ...common, text: String(data.get(`${prefix}-createdText`) ?? "") };
  if (type === "TABLE") return { ...common, columns: [], rows: [] };
  if (type === "LINK") return { ...common, targetKind: "node", targetNodeId: "" };
  if (type === "GROUP") return { ...common, color: "teal" };
  return common;
}

function nullableNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  return raw === "" ? null : Number(raw);
}

function fieldPrefix(namespace: string, index: number) {
  return `${namespace}-${index}`;
}

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:") ? { kind: "slot" as const, id: value.slice("slot:".length) } : { kind: "node" as const, id: value };
}
