"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Save, Trash2, X } from "lucide-react";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import { getNumericPatchFields, getStructuralPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import {
  diagnoseEffectReferences,
  type EffectCondition,
  type EffectDefinition,
  type EffectSource,
  type FormulaExpression,
} from "@/domain/effects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type EffectItem = EffectDefinition & { createdAt?: string | Date; updatedAt?: string | Date };
type Operation = EffectDefinition["operation"];

const numericOperations: Operation[] = ["ADD", "SUBTRACT", "MULTIPLY", "PERCENT_BONUS", "SET_BAR_MAX"];
const structuralOperations: Operation[] = ["CREATE_NODE", "CREATE_GROUP", "PATCH_NODE_PROPS"];
const nodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function EffectManager({ nodes, effects, rootLabel }: { nodes: CharacterNodeModel[]; effects: EffectItem[]; title?: string; rootLabel?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const resolvedRootLabel = rootLabel ?? t("common.rootCharacter");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function patch(id: string, body: object) {
    setPendingId(id);
    setError(null);
    const response = await fetch(`/api/effects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPendingId(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return false;
    }
    router.refresh();
    return true;
  }

  async function remove(effect: EffectItem) {
    if (!window.confirm(t("effect.deleteConfirm", { name: effect.name }))) return;
    setPendingId(effect.id);
    const response = await fetch(`/api/effects/${effect.id}`, { method: "DELETE" });
    setPendingId(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.deleteFailed"));
      return;
    }
    if (editingId === effect.id) setEditingId(null);
    router.refresh();
  }

  const editing = effects.find((effect) => effect.id === editingId) ?? null;

  return (
    <div className="space-y-3">
        {effects.length === 0 && <p className="text-sm text-muted-foreground">{t("effect.noEffects")}</p>}
        {effects.map((effect) => {
          const diagnostic = diagnoseEffectReferences(effect, nodes);
          const broken = diagnostic.missingNodeIds.length > 0 || diagnostic.missingPaths.length > 0;
          return (
            <div key={effect.id} className="rounded-md border p-3">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <input
                  type="checkbox"
                  checked={effect.enabled}
                  disabled={pendingId === effect.id}
                  onChange={(event) => patch(effect.id, { enabled: event.target.checked })}
                  aria-label={t("effect.toggle", { name: effect.name })}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={effect.enabled ? "font-medium" : "font-medium text-muted-foreground line-through"}>{effect.name}</span>
                    <Badge>{effect.operation.toLowerCase()}</Badge>
                    {broken && <Badge className="border-destructive text-destructive">{t("effect.broken")}</Badge>}
                  </div>
                  {broken && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {t("effect.missingRefs", { refs: [...diagnostic.missingNodeIds, ...diagnostic.missingPaths].join(", ") })}
                    </p>
                  )}
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => { setEditingId(effect.id); setError(null); }} aria-label={t("effect.editNamed", { name: effect.name })}><Pencil className="h-4 w-4" /></Button>
              </div>
            </div>
          );
        })}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editing && (
          <EffectEditor
            key={editing.id}
            effect={editing}
            nodes={nodes}
            pending={pendingId === editing.id}
            rootLabel={resolvedRootLabel}
            onCancel={() => setEditingId(null)}
            onDelete={() => remove(editing)}
            onSave={async (body) => {
              if (await patch(editing.id, body)) setEditingId(null);
            }}
          />
        )}
    </div>
  );
}

function EffectEditor({ effect, nodes, pending, rootLabel, onCancel, onDelete, onSave }: {
  effect: EffectItem;
  nodes: CharacterNodeModel[];
  pending: boolean;
  rootLabel: string;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (body: object) => void;
}) {
  const { t } = useI18n();
  const initialOperation = effect.operation;
  const [operation, setOperation] = useState<Operation>(initialOperation);
  const [sourceKind, setSourceKind] = useState(initialSourceKind(effect.source));
  const [conditionKind, setConditionKind] = useState(initialConditionKind(effect.condition));
  const initialTargetId = targetNodeId(effect) ?? "";
  const [selectedTargetId, setSelectedTargetId] = useState(initialTargetId);
  const [patchMode, setPatchMode] = useState<"static" | "source">(effect.payload?.patchFromSource ? "source" : "static");
  const initialPayload = effect.payload?.createNode;
  const [createdType, setCreatedType] = useState<NodeType>(initialPayload?.type ?? "NUMBER");
  const numericNodes = nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR");
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  const isNumeric = numericOperations.includes(operation);
  const isPatch = operation === "PATCH_NODE_PROPS";
  const selectedTarget = nodes.find((node) => node.id === selectedTargetId) ?? null;
  const patchFields = useMemo(() => selectedTarget ? getStructuralPatchFields(selectedTarget.type) : [], [selectedTarget]);
  const numericFields = useMemo(() => selectedTarget ? getNumericPatchFields(selectedTarget.type) : [], [selectedTarget]);
  const [numericField, setNumericField] = useState(initialNumericField(effect, numericFields));
  const [patchField, setPatchField] = useState(initialPatchField(effect, patchFields));
  const selectedPatchField = patchFields.find((field) => field.field === patchField) ?? patchFields[0] ?? null;

  useEffect(() => {
    if (!numericFields.length) {
      setNumericField("");
      return;
    }
    if (!numericFields.some((field) => field.field === numericField)) setNumericField(numericFields[0].field);
  }, [numericField, numericFields]);

  useEffect(() => {
    if (!selectedPatchField) {
      setPatchField("");
      setPatchMode("static");
      return;
    }
    if (!patchFields.some((field) => field.field === patchField)) setPatchField(selectedPatchField.field);
    if (!selectedPatchField.derived) setPatchMode("static");
  }, [patchField, patchFields, selectedPatchField]);

  function submit(formData: FormData) {
    const condition = readCondition(conditionKind, formData, effect.condition);
    const common = {
      name: String(formData.get("name")),
      enabled: formData.get("enabled") === "on",
      priority: Number(formData.get("priority")),
      operation,
      targetNodeId: selectedTargetId === "__ROOT__" ? null : selectedTargetId,
      condition,
    };
    if (isNumeric) {
      onSave({ ...common, numericField, source: readSource(sourceKind, formData, effect.source) });
      return;
    }
    if (isPatch) {
      onSave({
        ...common,
        patch: selectedPatchField && patchMode === "static" ? readStaticPatch(selectedPatchField, formData) : {},
        ...(selectedPatchField && patchMode === "source"
          ? { source: readSource(sourceKind, formData, effect.source), patchFromSource: { field: selectedPatchField.field } }
          : {}),
      });
      return;
    }
    const type = operation === "CREATE_GROUP" ? "GROUP" : createdType;
    onSave({ ...common, createNode: { type, name: String(formData.get("createdName")), data: readCreatedData(type, formData, initialPayload?.data) } });
  }

  return (
    <form action={submit} className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{t("effect.edit")}</h3><Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label={t("effect.closeEditor")}><X className="h-4 w-4" /></Button></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px]">
        <Field label={t("common.name")} name="name" required defaultValue={effect.name} />
        <Field label={t("effect.priority")} name="priority" type="number" required defaultValue={effect.priority} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={effect.enabled} />{t("effect.enabled")}</label>
      <Labeled label={t("effect.operation")}><select value={operation} onChange={(event) => setOperation(event.target.value as Operation)} className={selectClass}>{[...numericOperations, ...structuralOperations].map((item) => <option key={item} value={item}>{operationLabel(item, t)}</option>)}</select></Labeled>
      <Labeled label={t("effect.target")}><select name="targetNodeId" required value={selectedTargetId || (effect.target.kind === "root" ? "__ROOT__" : "")} onChange={(event) => setSelectedTargetId(event.target.value)} className={selectClass}><option value="">{t("effect.selectTarget")}</option>{!isNumeric && !isPatch && <option value="__ROOT__">{rootLabel}</option>}{(isNumeric ? numericNodes : isPatch ? nodes : containers).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></Labeled>
      {isNumeric && <Labeled label={t("effect.numericField")}><select name="numericField" required value={numericField} onChange={(event) => setNumericField(event.target.value)} className={selectClass}><option value="">{t("effect.numericField")}</option>{numericFields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select></Labeled>}

      {isNumeric && <SourceFields effect={effect} nodes={numericNodes} kind={sourceKind} setKind={setSourceKind} />}
      <ConditionFields condition={effect.condition} nodes={nodes} kind={conditionKind} setKind={setConditionKind} />
      {!isNumeric && !isPatch && <CreatedNodeFields payload={initialPayload} operation={operation} type={createdType} setType={setCreatedType} />}
      {isPatch && <PatchFields fields={patchFields} selectedField={selectedPatchField} value={patchField} setValue={setPatchField} patch={effect.payload?.patch} mode={patchMode} setMode={setPatchMode} targetType={selectedTarget?.type} />}
      {isPatch && patchMode === "source" && selectedPatchField?.derived && <SourceFields effect={effect} nodes={numericNodes} kind={sourceKind} setKind={setSourceKind} />}

      <div className="flex w-full flex-wrap gap-2"><Button type="submit" disabled={pending}><Save className="h-4 w-4" />{pending ? t("common.saving") : t("common.save")}</Button><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}><X className="h-4 w-4" />{t("common.cancel")}</Button><Button type="button" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={onDelete}><Trash2 className="h-4 w-4" />{t("effect.delete")}</Button></div>
    </form>
  );
}

function SourceFields({ effect, nodes, kind, setKind }: { effect: EffectItem; nodes: CharacterNodeModel[]; kind: string; setKind: (kind: string) => void }) {
  const { t } = useI18n();
  const source = effect.source;
  const formula = source.kind === "formula" ? source.expression : null;
  const simpleFormula = formula && isSimpleFormula(formula) ? formula : null;
  return <div className="space-y-3"><Labeled label={t("effect.source")}><select value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>{!isEditableSource(source) && <option value="current">{t("effect.currentComplexSource")}</option>}<option value="number">{t("effect.number")}</option><option value="node">{t("effect.otherNode")}</option><option value="formula">{t("effect.formulaNodeNumber")}</option></select></Labeled>{kind === "number" && <Field label={t("common.value")} name="sourceValue" type="number" step="any" required defaultValue={source.kind === "number" ? source.value : 0} />}{kind === "node" && <NodeSelect label={t("effect.nodeSource")} name="sourceNodeId" nodes={nodes} defaultValue={source.kind === "node" ? source.nodeId : ""} />}{kind === "formula" && <div className="grid grid-cols-[minmax(0,1fr)_88px_100px] gap-2"><NodeSelect label={t("node.label")} name="formulaNodeId" nodes={nodes} defaultValue={simpleFormula?.left.nodeId ?? ""} compact /><Labeled label={t("effect.action")}><select name="formulaOperator" defaultValue={simpleFormula?.kind ?? "multiply"} className={selectClass}><option value="add">+</option><option value="subtract">-</option><option value="multiply">x</option><option value="divide">/</option></select></Labeled><Field label={t("effect.number")} name="formulaValue" type="number" step="any" required defaultValue={simpleFormula?.right.value ?? 1} /></div>}</div>;
}

function ConditionFields({ condition, nodes, kind, setKind }: { condition: EffectCondition; nodes: CharacterNodeModel[]; kind: string; setKind: (kind: string) => void }) {
  const { t } = useI18n();
  const editable = condition.kind === "always" || condition.kind === "fieldExists" || (condition.kind === "compare" && condition.value.kind === "number");
  const nodeId = condition.kind === "fieldExists" || condition.kind === "compare" ? condition.nodeId : "";
  const value = condition.kind === "compare" && condition.value.kind === "number" ? condition.value.value : 0;
  return <div className="space-y-3"><Labeled label={t("effect.condition")}><select value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>{!editable && <option value="current">{t("effect.currentComplexCondition")}</option>}<option value="always">{t("effect.conditionAlways")}</option><option value="exists">{t("effect.conditionExists")}</option><option value="gt">{t("effect.conditionGt")}</option><option value="lt">{t("effect.conditionLt")}</option><option value="eq">{t("effect.conditionEq")}</option></select></Labeled>{kind !== "always" && kind !== "current" && <div className="grid grid-cols-2 gap-2"><NodeSelect label={t("effect.field")} name="conditionNodeId" nodes={nodes} defaultValue={nodeId} />{kind !== "exists" && <Field label={t("common.value")} name="conditionValue" type="number" step="any" required defaultValue={value} />}</div>}</div>;
}

function CreatedNodeFields({ payload, operation, type, setType }: { payload?: EffectDefinition["payload"] extends infer _ ? NonNullable<EffectDefinition["payload"]>["createNode"] : never; operation: Operation; type: NodeType; setType: (type: NodeType) => void }) {
  const { t } = useI18n();
  const data = payload?.data ?? {};
  const actualType = operation === "CREATE_GROUP" ? "GROUP" : type;
  return <div className="space-y-3"><Field label={t("effect.createdNodeName")} name="createdName" required defaultValue={payload?.name ?? ""} />{operation === "CREATE_NODE" && <Labeled label={t("common.type")}><select value={type} onChange={(event) => setType(event.target.value as NodeType)} className={selectClass}>{nodeTypes.map((item) => <option key={item}>{item}</option>)}</select></Labeled>}<Field label={t("common.description")} name="createdDescription" defaultValue={String(data.description ?? "")} /><NodeIconPicker type={actualType} defaultValue={data.icon} />{actualType === "NUMBER" && <div className="grid grid-cols-3 gap-2"><Field label={t("common.value")} name="createdValue" type="number" step="any" defaultValue={String(data.value ?? 0)} /><Field label={t("node.minimum")} name="createdMin" type="number" step="any" defaultValue={data.min == null ? "" : String(data.min)} /><Field label={t("node.maximum")} name="createdMax" type="number" step="any" defaultValue={data.max == null ? "" : String(data.max)} /></div>}{actualType === "BAR" && <div className="grid grid-cols-2 gap-2"><Field label={t("node.current")} name="createdCurrent" type="number" step="any" defaultValue={String(data.current ?? 0)} /><Field label={t("node.maximum")} name="createdBarMax" type="number" step="any" defaultValue={String(data.max ?? 10)} /></div>}{actualType === "TEXT" && <Labeled label={t("node.text")}><textarea name="createdText" defaultValue={String(data.text ?? "")} className="min-h-28 w-full resize-y rounded-md border bg-background p-3 text-sm" /></Labeled>}{actualType === "GROUP" && <Field label={t("node.groupColor")} name="createdColor" defaultValue={String(data.color ?? "teal")} />}{actualType === "CONTAINER" && <label className="flex items-center gap-2 text-sm"><input name="createdCollapsed" type="checkbox" defaultChecked={Boolean(data.collapsedByDefault)} />{t("node.collapsedDefault")}</label>}</div>;
}

function PatchFields({
  fields,
  selectedField,
  value,
  setValue,
  patch = {},
  mode,
  setMode,
  targetType,
}: {
  fields: PatchFieldDefinition[];
  selectedField: PatchFieldDefinition | null;
  value: string;
  setValue: (field: string) => void;
  patch?: Record<string, unknown>;
  mode: "static" | "source";
  setMode: (mode: "static" | "source") => void;
  targetType?: NodeType;
}) {
  const { t } = useI18n();
  if (!selectedField) return <p className="text-sm text-muted-foreground">{t("effect.selectPatchTargetFirst")}</p>;
  return (
    <div className="space-y-3">
      <Labeled label={t("effect.patchField")}>
        <select name="patchField" required value={value} onChange={(event) => setValue(event.target.value)} className={selectClass}>
          {fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}
        </select>
      </Labeled>
      {selectedField.derived && (
        <Labeled label={t("effect.patchMode")}>
          <select value={mode} onChange={(event) => setMode(event.target.value as "static" | "source")} className={selectClass}>
            <option value="static">{t("effect.patchModeStatic")}</option>
            <option value="source">{t("effect.patchModeSource")}</option>
          </select>
        </Labeled>
      )}
      {mode === "source" && selectedField.derived ? null : <StaticPatchField field={selectedField} patch={patch} targetType={targetType} />}
    </div>
  );
}

function StaticPatchField({ field, patch, targetType }: { field: PatchFieldDefinition; patch: Record<string, unknown>; targetType?: NodeType }) {
  const { t } = useI18n();
  const value = patch[field.field];
  if (field.field === "icon" && targetType) return <NodeIconPicker type={targetType} defaultValue={typeof value === "string" ? value : undefined} />;
  if (field.kind === "boolean") {
    return <label className="flex items-center gap-2 text-sm"><input name="patchBooleanValue" type="checkbox" defaultChecked={Boolean(value)} />{t(field.labelKey)}</label>;
  }
  if (field.kind === "text") {
    return <Field label={t(field.labelKey)} name="patchTextValue" defaultValue={value == null ? "" : String(value)} />;
  }
  return <Field label={t(field.labelKey)} name="patchNumberValue" type="number" step="any" defaultValue={value == null ? "" : String(value)} />;
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) { return <Labeled label={label}><Input {...props} /></Labeled>; }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>; }
function NodeSelect({ label, name, nodes, defaultValue, compact = false }: { label: string; name: string; nodes: CharacterNodeModel[]; defaultValue: string; compact?: boolean }) { const { t } = useI18n(); return <Labeled label={label}><select name={name} required defaultValue={defaultValue} className={selectClass}><option value="">{t("effect.selectNode")}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select>{compact ? null : null}</Labeled>; }

function targetNodeId(effect: EffectDefinition) { if (effect.target.kind === "node") return effect.target.nodeId; if (effect.target.kind === "parent") return effect.target.parentNodeId; return null; }
function initialPatchField(effect: EffectDefinition, fields: PatchFieldDefinition[]) {
  if (effect.payload?.patchFromSource?.field) return effect.payload.patchFromSource.field;
  const patched = Object.keys(effect.payload?.patch ?? {}).find((field) => fields.some((candidate) => candidate.field === field));
  return patched ?? fields[0]?.field ?? "";
}
function initialNumericField(effect: EffectDefinition, fields: PatchFieldDefinition[]) {
  const field = effect.payload?.numericField;
  if (field && fields.some((candidate) => candidate.field === field)) return field;
  if (effect.operation === "SET_BAR_MAX" && fields.some((candidate) => candidate.field === "max")) return "max";
  return fields[0]?.field ?? "";
}
function initialSourceKind(source: EffectSource) { return isEditableSource(source) ? source.kind : "current"; }
function isEditableSource(source: EffectSource) { return source.kind !== "formula" || isSimpleFormula(source.expression); }
function isSimpleFormula(expression: FormulaExpression): expression is Extract<FormulaExpression, { kind: "add" | "subtract" | "multiply" | "divide" }> & { left: Extract<FormulaExpression, { kind: "ref" }>; right: Extract<FormulaExpression, { kind: "const" }> } { return ["add", "subtract", "multiply", "divide"].includes(expression.kind) && "left" in expression && expression.left.kind === "ref" && expression.right.kind === "const"; }
function initialConditionKind(condition: EffectCondition) { if (condition.kind === "always") return "always"; if (condition.kind === "fieldExists") return "exists"; if (condition.kind === "compare" && condition.value.kind === "number") return condition.operator; return "current"; }
function readCondition(kind: string, data: FormData, current: EffectCondition): EffectCondition { if (kind === "current") return current; if (kind === "always") return { kind: "always" }; const nodeId = String(data.get("conditionNodeId")); if (kind === "exists") return { kind: "fieldExists", nodeId }; return { kind: "compare", nodeId, operator: kind as "gt" | "lt" | "eq", value: { kind: "number", value: Number(data.get("conditionValue")) } }; }
function readSource(kind: string, data: FormData, current: EffectSource): EffectSource { if (kind === "current") return current; if (kind === "number") return { kind: "number", value: Number(data.get("sourceValue")) }; if (kind === "node") return { kind: "node", nodeId: String(data.get("sourceNodeId")), field: "value" }; return { kind: "formula", expression: { kind: String(data.get("formulaOperator")) as "add" | "subtract" | "multiply" | "divide", left: { kind: "ref", nodeId: String(data.get("formulaNodeId")), field: "value" }, right: { kind: "const", value: Number(data.get("formulaValue")) } } }; }
function readStaticPatch(field: PatchFieldDefinition, data: FormData) {
  if (field.field === "icon") return { icon: String(data.get("icon") ?? "") || undefined };
  if (field.kind === "number") return { [field.field]: Number(data.get("patchNumberValue")) };
  if (field.kind === "boolean") return { [field.field]: data.get("patchBooleanValue") === "on" };
  return { [field.field]: String(data.get("patchTextValue") ?? "") };
}
function readCreatedData(type: NodeType, data: FormData, current: Record<string, unknown> | undefined) { const description = String(data.get("createdDescription") ?? ""); const icon = String(data.get("icon") ?? ""); if (type === "NUMBER") return { value: Number(data.get("createdValue") ?? 0), min: nullableNumber(data.get("createdMin")), max: nullableNumber(data.get("createdMax")), allowNegative: Boolean(current?.allowNegative), description, icon }; if (type === "BAR") return { current: Number(data.get("createdCurrent") ?? 0), max: Number(data.get("createdBarMax") ?? 10), description, icon }; if (type === "TEXT") return { text: String(data.get("createdText") ?? ""), description, icon }; if (type === "TABLE") return { columns: Array.isArray(current?.columns) ? current.columns : [], rows: Array.isArray(current?.rows) ? current.rows : [], description, icon }; if (type === "CONTAINER") return { collapsedByDefault: data.get("createdCollapsed") === "on", description, icon }; return { color: String(data.get("createdColor") ?? "teal"), description, icon }; }
function nullableNumber(value: FormDataEntryValue | null) { const raw = String(value ?? ""); return raw === "" ? null : Number(raw); }
function operationLabel(operation: Operation, t: ReturnType<typeof useI18n>["t"]) { return ({ ADD: t("effect.add"), SUBTRACT: t("effect.subtract"), MULTIPLY: t("effect.multiply"), PERCENT_BONUS: t("effect.percentBonus"), SET_BAR_MAX: t("effect.setNumericField"), CREATE_NODE: t("effect.createNode"), CREATE_GROUP: t("effect.createGroup"), PATCH_NODE_PROPS: t("effect.patchNode") } as Record<Operation, string>)[operation]; }
