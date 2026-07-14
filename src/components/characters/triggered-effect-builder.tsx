"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { EffectSource, TriggeredEffectAction } from "@/domain/effects";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { getNumericPatchFields, getStructuralPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { FormulaSourceFields, readFormulaExpression } from "@/components/characters/formula-source-fields";
import { NodeAccentColorPicker } from "@/components/characters/node-accent-color-picker";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { NodePicker } from "@/components/characters/node-picker";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type TriggeredEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

type ActionRow = {
  id: string;
  kind: "NUMERIC" | "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS";
  sourceKind: "number" | "node" | "formula";
  targetNodeId: string;
  createdType: NodeType;
  patchField: string;
};

type TriggerKind = "condition" | "nodeClick";

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

export function TriggeredEffectBuilder({ characterId, templateId, nodes, slots = [] }: TriggeredEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const numericNodes = nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR");
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  void slots;
  const numericSlotOptions: Array<{ value: string; label: string }> = [];
  const containerSlotOptions: Array<{ value: string; label: string }> = [];
  const allSlotOptions: Array<{ value: string; label: string }> = [];
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("condition");
  const [triggerNodeId, setTriggerNodeId] = useState("");
  const [rows, setRows] = useState<ActionRow[]>([newActionRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(data: FormData) {
    setPending(true);
    setError(null);
    const triggerCondition = readEffectCondition(data, "trigger");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        operation: "TRIGGERED",
        trigger: triggerKind === "nodeClick"
          ? { kind: "nodeClick", nodeId: data.get("triggerNodeId"), condition: triggerCondition }
          : { kind: "condition", condition: triggerCondition },
        actions: rows.map((row, index) => readAction(row, data, index)),
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-4">
      <Input name="name" required placeholder={t("effect.name")} />
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("effect.trigger")}</p>
        <select value={triggerKind} onChange={(event) => setTriggerKind(event.target.value as TriggerKind)} className={selectClass}>
          <option value="condition">{t("effect.triggerCondition")}</option>
          <option value="nodeClick">{t("effect.triggerNodeClick")}</option>
        </select>
        {triggerKind === "nodeClick" && (
          <NodePicker
            name="triggerNodeId"
            nodes={nodes}
            value={triggerNodeId}
            onChange={setTriggerNodeId}
            extraOptions={allSlotOptions}
            required
            placeholder={t("effect.triggerNode")}
          />
        )}
        <EffectConditionBuilder nodes={numericNodes} prefix="trigger" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{t("effect.triggerActions")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, newActionRow()])}>
            <Plus className="h-4 w-4" />{t("effect.addAction")}
          </Button>
        </div>
        {rows.map((row, index) => (
          <ActionEditor
            key={row.id}
            row={row}
            index={index}
            rowsCount={rows.length}
            nodes={nodes}
            numericNodes={numericNodes}
            containers={containers}
            numericSlotOptions={numericSlotOptions}
            containerSlotOptions={containerSlotOptions}
            allSlotOptions={allSlotOptions}
            rootLabel={templateId ? t("common.rootTemplate") : t("common.rootCharacter")}
            setRows={setRows}
          />
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending}><Plus className="h-4 w-4" />{pending ? t("effect.checking") : t("effect.addTriggeredEffect")}</Button>
    </form>
  );
}

function ActionEditor({
  row,
  index,
  rowsCount,
  nodes,
  numericNodes,
  containers,
  numericSlotOptions,
  containerSlotOptions,
  allSlotOptions,
  rootLabel,
  setRows,
}: {
  row: ActionRow;
  index: number;
  rowsCount: number;
  nodes: CharacterNodeModel[];
  numericNodes: CharacterNodeModel[];
  containers: CharacterNodeModel[];
  numericSlotOptions: Array<{ value: string; label: string }>;
  containerSlotOptions: Array<{ value: string; label: string }>;
  allSlotOptions: Array<{ value: string; label: string }>;
  rootLabel: string;
  setRows: React.Dispatch<React.SetStateAction<ActionRow[]>>;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{t("effect.actionNumber", { count: index + 1 })}</p>
        <Button type="button" variant="ghost" size="icon" disabled={rowsCount === 1} aria-label={t("effect.removeAction")} onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : current)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <select value={row.kind} onChange={(event) => updateRow(setRows, row.id, { kind: event.target.value as ActionRow["kind"], targetNodeId: "", patchField: "" })} className={selectClass}>
        <option value="NUMERIC">{t("effect.setNumericField")}</option>
        <option value="CREATE_NODE">{t("effect.createNode")}</option>
        <option value="CREATE_GROUP">{t("effect.createGroup")}</option>
        <option value="PATCH_NODE_PROPS">{t("effect.patchNode")}</option>
      </select>
      {row.kind === "NUMERIC" && <NumericActionFields row={row} index={index} numericNodes={numericNodes} numericSlotOptions={numericSlotOptions} setRows={setRows} />}
      {(row.kind === "CREATE_NODE" || row.kind === "CREATE_GROUP") && <CreateActionFields row={row} index={index} containers={containers} containerSlotOptions={containerSlotOptions} rootLabel={rootLabel} setRows={setRows} />}
      {row.kind === "PATCH_NODE_PROPS" && <PatchActionFields row={row} index={index} nodes={nodes} allSlotOptions={allSlotOptions} setRows={setRows} />}
    </div>
  );
}

function NumericActionFields({ row, index, numericNodes, numericSlotOptions, setRows }: { row: ActionRow; index: number; numericNodes: CharacterNodeModel[]; numericSlotOptions: Array<{ value: string; label: string }>; setRows: React.Dispatch<React.SetStateAction<ActionRow[]>> }) {
  const { t } = useI18n();
  const selected = parseTemplateSelectValue(row.targetNodeId);
  const target = selected.kind === "node" ? numericNodes.find((node) => node.id === selected.id) ?? null : null;
  const fields = target ? getNumericPatchFields(target.type) : commonNumericFields;
  return (
    <>
      <NodePicker name={`action-${index}-targetNodeId`} nodes={numericNodes} value={row.targetNodeId} onChange={(value) => updateRow(setRows, row.id, { targetNodeId: value })} extraOptions={numericSlotOptions} allowedTypes={["NUMBER", "BAR"]} required placeholder={t("effect.selectTarget")} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name={`action-${index}-field`} required className={selectClass}>{fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select>
        <select name={`action-${index}-operation`} required className={selectClass}>{numericActions.map((operation) => <option key={operation} value={operation}>{triggerActionLabel(operation, t)}</option>)}</select>
      </div>
      <SourceFields row={row} index={index} numericNodes={numericNodes} numericSlotOptions={numericSlotOptions} setRows={setRows} />
    </>
  );
}

function SourceFields({ row, index, numericNodes, numericSlotOptions, setRows }: { row: ActionRow; index: number; numericNodes: CharacterNodeModel[]; numericSlotOptions: Array<{ value: string; label: string }>; setRows: React.Dispatch<React.SetStateAction<ActionRow[]>> }) {
  const { t } = useI18n();
  return (
    <>
      <select value={row.sourceKind} onChange={(event) => updateRow(setRows, row.id, { sourceKind: event.target.value as ActionRow["sourceKind"] })} className={selectClass}>
        <option value="number">{t("effect.sourceNumber")}</option>
        <option value="node">{t("effect.sourceNode")}</option>
        <option value="formula">{t("effect.sourceFormula")}</option>
      </select>
      {row.sourceKind === "number" && <Input name={`action-${index}-sourceValue`} type="number" step="any" required placeholder={t("common.value")} />}
      {row.sourceKind === "node" && <NodePicker name={`action-${index}-sourceNodeId`} nodes={numericNodes} extraOptions={numericSlotOptions} allowedTypes={["NUMBER", "BAR"]} required placeholder={t("effect.selectNode")} />}
      {row.sourceKind === "formula" && <FormulaSourceFields nodes={numericNodes} prefix={`action-${index}-formula`} />}
    </>
  );
}

function CreateActionFields({ row, index, containers, containerSlotOptions, rootLabel, setRows }: { row: ActionRow; index: number; containers: CharacterNodeModel[]; containerSlotOptions: Array<{ value: string; label: string }>; rootLabel: string; setRows: React.Dispatch<React.SetStateAction<ActionRow[]>> }) {
  const { t } = useI18n();
  const type = row.kind === "CREATE_GROUP" ? "GROUP" : row.createdType;
  return (
    <div className="space-y-3">
      <NodePicker name={`action-${index}-parentNodeId`} nodes={containers} value={row.targetNodeId || "__ROOT__"} onChange={(value) => updateRow(setRows, row.id, { targetNodeId: value })} extraOptions={containerSlotOptions} allowedTypes={["CONTAINER", "GROUP"]} includeRoot rootValue="__ROOT__" rootLabel={rootLabel} required placeholder={t("effect.place")} />
      <Input name={`action-${index}-createdName`} required placeholder={t("effect.createdNodeName")} />
      {row.kind === "CREATE_NODE" && <select value={row.createdType} onChange={(event) => updateRow(setRows, row.id, { createdType: event.target.value as NodeType })} className={selectClass}>{creatableNodeTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
      <Input name={`action-${index}-createdDescription`} placeholder={t("common.description")} />
      <NodeIconPicker type={type} name={`action-${index}-icon`} />
      <NodeAccentColorPicker name={`action-${index}-accentColor`} />
      {type === "NUMBER" && <Input name={`action-${index}-createdValue`} type="number" step="any" placeholder={t("common.value")} />}
      {type === "BAR" && <div className="grid grid-cols-2 gap-2"><Input name={`action-${index}-createdCurrent`} type="number" step="any" placeholder={t("node.current")} /><Input name={`action-${index}-createdMax`} type="number" step="any" placeholder={t("node.maximum")} /></div>}
      {type === "TEXT" && <textarea name={`action-${index}-createdText`} className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm" placeholder={t("node.text")} />}
    </div>
  );
}

function PatchActionFields({ row, index, nodes, allSlotOptions, setRows }: { row: ActionRow; index: number; nodes: CharacterNodeModel[]; allSlotOptions: Array<{ value: string; label: string }>; setRows: React.Dispatch<React.SetStateAction<ActionRow[]>> }) {
  const { t } = useI18n();
  const selected = parseTemplateSelectValue(row.targetNodeId);
  const target = selected.kind === "node" ? nodes.find((node) => node.id === selected.id) ?? null : null;
  const fields = target ? getStructuralPatchFields(target.type) : commonStructuralFields;
  const selectedField = fields.find((field) => field.field === row.patchField) ?? fields[0] ?? null;
  return (
    <div className="space-y-3">
      <NodePicker name={`action-${index}-patchTargetNodeId`} nodes={nodes} value={row.targetNodeId} onChange={(value) => updateRow(setRows, row.id, { targetNodeId: value, patchField: "" })} extraOptions={allSlotOptions} required placeholder={t("effect.patchTarget")} />
      <select name={`action-${index}-patchField`} required value={selectedField?.field ?? ""} onChange={(event) => updateRow(setRows, row.id, { patchField: event.target.value })} className={selectClass}>{fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select>
      {selectedField?.field === "icon" && target && <NodeIconPicker type={target.type} name={`action-${index}-patchIcon`} />}
      {selectedField?.field === "accentColor" && <NodeAccentColorPicker name={`action-${index}-patchTextValue`} />}
      {selectedField && !["icon", "accentColor"].includes(selectedField.field) && selectedField.kind === "boolean" && <label className="flex items-center gap-2 text-sm"><input name={`action-${index}-patchBooleanValue`} type="checkbox" />{t(selectedField.labelKey)}</label>}
      {selectedField && !["icon", "accentColor"].includes(selectedField.field) && selectedField.kind === "text" && <Input name={`action-${index}-patchTextValue`} placeholder={t(selectedField.labelKey)} />}
    </div>
  );
}

function readAction(row: ActionRow, data: FormData, index: number): TriggeredEffectAction {
  if (row.kind === "NUMERIC") return { kind: "NUMERIC", targetNodeId: String(data.get(`action-${index}-targetNodeId`) ?? ""), field: String(data.get(`action-${index}-field`) ?? "value") as "value" | "current" | "min" | "max", operation: String(data.get(`action-${index}-operation`) ?? "ADD") as "SET" | "ADD" | "SUBTRACT" | "MULTIPLY", source: readSource(row.sourceKind, data, index) };
  if (row.kind === "PATCH_NODE_PROPS") return { kind: "PATCH_NODE_PROPS", targetNodeId: String(data.get(`action-${index}-patchTargetNodeId`) ?? ""), patch: readPatch(row, data, index) };
  const parentNodeId = String(data.get(`action-${index}-parentNodeId`) ?? "");
  const type = row.kind === "CREATE_GROUP" ? "GROUP" : row.createdType;
  return { kind: row.kind, parentNodeId: parentNodeId === "__ROOT__" ? null : parentNodeId, createNode: { type, name: String(data.get(`action-${index}-createdName`) ?? ""), data: readCreatedData(type, data, index) } };
}

function readSource(kind: ActionRow["sourceKind"], data: FormData, index: number): EffectSource {
  if (kind === "number") return { kind: "number", value: Number(data.get(`action-${index}-sourceValue`)) };
  if (kind === "node") return readNodeOrSlotSource(String(data.get(`action-${index}-sourceNodeId`) ?? ""));
  return { kind: "formula", expression: readFormulaExpression(data, `action-${index}-formula`) };
}

function readCreatedData(type: NodeType, data: FormData, index: number) {
  const icon = String(data.get(`action-${index}-icon`) ?? "");
  const accentColor = String(data.get(`action-${index}-accentColor`) ?? "");
  const common = { description: String(data.get(`action-${index}-createdDescription`) ?? ""), ...(icon ? { icon } : {}), ...(accentColor ? { accentColor } : {}) };
  if (type === "NUMBER") return { ...common, value: nullableNumber(data.get(`action-${index}-createdValue`)) ?? 0, min: null, max: null, allowNegative: true };
  if (type === "BAR") return { ...common, current: nullableNumber(data.get(`action-${index}-createdCurrent`)) ?? 0, max: nullableNumber(data.get(`action-${index}-createdMax`)) ?? 10 };
  if (type === "TEXT") return { ...common, text: String(data.get(`action-${index}-createdText`) ?? "") };
  if (type === "TABLE") return { ...common, columns: [], rows: [] };
  if (type === "LINK") return { ...common, targetType: "node", targetNodeId: "" };
  if (type === "GROUP") return { ...common, color: "teal" };
  return common;
}

function readPatch(row: ActionRow, data: FormData, index: number) {
  const field = String(data.get(`action-${index}-patchField`) || row.patchField);
  if (field === "icon") return { icon: String(data.get(`action-${index}-patchIcon`) ?? "") || undefined };
  if (field === "accentColor") return { accentColor: String(data.get(`action-${index}-patchTextValue`) ?? "") || undefined };
  const definition = commonStructuralFields.find((candidate) => candidate.field === field);
  if (definition?.kind === "boolean") return { [field]: data.get(`action-${index}-patchBooleanValue`) === "on" };
  return { [field]: String(data.get(`action-${index}-patchTextValue`) ?? "") };
}

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:") ? { kind: "slot" as const, id: value.slice("slot:".length) } : { kind: "node" as const, id: value };
}

function readNodeOrSlotSource(value: string): EffectSource {
  const parsed = parseTemplateSelectValue(value);
  if (parsed.kind === "slot") return { kind: "templateSlot", slotId: parsed.id, field: "value" };
  return { kind: "node", nodeId: parsed.id, field: "value" };
}

function triggerActionLabel(operation: (typeof numericActions)[number], t: ReturnType<typeof useI18n>["t"]) {
  return ({ SET: t("effect.triggerSet"), ADD: t("effect.add"), SUBTRACT: t("effect.subtract"), MULTIPLY: t("effect.multiply") } satisfies Record<(typeof numericActions)[number], string>)[operation];
}

function nullableNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  return raw === "" ? null : Number(raw);
}

function newActionRow(): ActionRow {
  return { id: crypto.randomUUID(), kind: "NUMERIC", sourceKind: "number", targetNodeId: "", createdType: "NUMBER", patchField: "" };
}

function updateRow(setRows: React.Dispatch<React.SetStateAction<ActionRow[]>>, id: string, patch: Partial<ActionRow>) {
  setRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
}
