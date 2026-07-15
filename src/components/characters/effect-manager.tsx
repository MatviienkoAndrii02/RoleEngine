"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Save, Trash2, X } from "lucide-react";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { getNumericPatchFields, getStructuralPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import {
  diagnoseEffectReferences,
  type EffectCondition,
  type EffectDefinition,
  type EffectSource,
  type FormulaExpression,
  type TriggeredEffectAction,
} from "@/domain/effects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { EffectSourceEditor, readEditableEffectSource, type EditableEffectSourceKind } from "@/components/characters/effect-source-editor";
import {
  conditionExpressionSummary,
  nodeSummary,
  numericEffectSummary,
  sourceSummary,
  targetSummary,
  triggeredActionSummary,
} from "@/components/characters/effect-summary";
import { NodeAccentColorPicker } from "@/components/characters/node-accent-color-picker";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { NodePicker } from "@/components/characters/node-picker";
import {
  newTriggeredActionRow,
  readTriggeredAction,
  TriggeredActionEditor,
  triggeredActionToRow,
  type TriggeredActionRow,
} from "@/components/characters/triggered-action-editor";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type EffectItem = EffectDefinition & { createdAt?: string | Date; updatedAt?: string | Date };
type Operation = EffectDefinition["operation"];
type TriggerKind = "condition" | "nodeClick";

const numericOperations: Operation[] = ["ADD", "SUBTRACT", "MULTIPLY", "PERCENT_BONUS", "SET_BAR_MAX"];
const structuralOperations: Operation[] = ["CREATE_NODE", "CREATE_GROUP", "PATCH_NODE_PROPS"];
const nodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function EffectManager({ nodes, effects, rootLabel, slots = [] }: { nodes: CharacterNodeModel[]; effects: EffectItem[]; title?: string; rootLabel?: string; slots?: TemplateSlotModel[] }) {
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
            slots={slots}
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

function EffectEditor({ effect, nodes, slots, pending, rootLabel, onCancel, onDelete, onSave }: {
  effect: EffectItem;
  nodes: CharacterNodeModel[];
  slots: TemplateSlotModel[];
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
  const initialTargetId = targetNodeId(effect) ?? "";
  const [selectedTargetId, setSelectedTargetId] = useState(initialTargetId);
  const [patchMode, setPatchMode] = useState<"static" | "source">(effect.payload?.patchFromSource ? "source" : "static");
  const initialPayload = effect.payload?.createNode;
  const [createdType, setCreatedType] = useState<NodeType>(initialPayload?.type ?? "NUMBER");
  const triggeredPayload = effect.payload?.triggered;
  const [triggerKind, setTriggerKind] = useState<TriggerKind>(triggeredPayload?.trigger.kind ?? "condition");
  const [triggerNodeId, setTriggerNodeId] = useState(triggeredPayload?.trigger.kind === "nodeClick" ? triggeredPayload.trigger.nodeId : "");
  const triggerCondition = triggeredPayload?.trigger.condition ?? { kind: "always" as const };
  const [triggerRows, setTriggerRows] = useState<TriggeredActionRow[]>(() => triggeredPayload?.actions.length ? triggeredPayload.actions.map(triggeredActionToRow) : [newTriggeredActionRow()]);
  const numericNodes = nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR");
  const numericSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "NUMBER" || type === "BAR"));
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  const containerSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP"));
  const numericSlotOptions = numericSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const containerSlotOptions = containerSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const allSlotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const isNumeric = numericOperations.includes(operation);
  const isPatch = operation === "PATCH_NODE_PROPS";
  const selectedTargetValue = parseTemplateSelectValue(selectedTargetId);
  const selectedTarget = selectedTargetValue.kind === "node" ? nodes.find((node) => node.id === selectedTargetValue.id) ?? null : null;
  const selectedTargetSlot = selectedTargetValue.kind === "slot" ? slots.find((slot) => slot.id === selectedTargetValue.id) ?? null : null;
  const patchFields = useMemo(() => selectedTarget ? getStructuralPatchFields(selectedTarget.type) : selectedTargetSlot ? commonStructuralFields : [], [selectedTarget, selectedTargetSlot]);
  const numericFields = useMemo(() => selectedTarget ? getNumericPatchFields(selectedTarget.type) : selectedTargetSlot ? commonNumericFields : [], [selectedTarget, selectedTargetSlot]);
  const [numericField, setNumericField] = useState(initialNumericField(effect, numericFields));
  const [patchField, setPatchField] = useState(initialPatchField(effect, patchFields));
  const selectedPatchField = patchFields.find((field) => field.field === patchField) ?? patchFields[0] ?? null;
  const actualSelectedTargetId = selectedTargetId || (effect.target.kind === "root" ? "__ROOT__" : "");

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
    if (effect.operation === "TRIGGERED") {
      const triggerConditionValue = readEffectCondition(formData, "triggerEdit", triggerCondition);
      onSave({
        name: String(formData.get("name")),
        enabled: formData.get("enabled") === "on",
        priority: Number(formData.get("priority")),
        operation: "TRIGGERED",
        trigger: triggerKind === "nodeClick"
          ? { kind: "nodeClick", nodeId: String(formData.get("triggerNodeId") ?? ""), condition: triggerConditionValue }
          : { kind: "condition", condition: triggerConditionValue },
        actions: triggerRows.map((row, index) => readTriggeredAction(row, formData, index, nodes, "edit-action")),
      });
      return;
    }
    const condition = readEffectCondition(formData, "condition", effect.condition);
    const common = {
      name: String(formData.get("name")),
      enabled: formData.get("enabled") === "on",
      priority: Number(formData.get("priority")),
      operation,
      targetNodeId: actualSelectedTargetId === "__ROOT__" ? null : actualSelectedTargetId,
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
      <EffectEditorSection title={t("effect.basics")} summary={effect.name}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px]">
          <Field label={t("common.name")} name="name" required defaultValue={effect.name} />
          <Field label={t("effect.priority")} name="priority" type="number" required defaultValue={effect.priority} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={effect.enabled} />{t("effect.enabled")}</label>
      </EffectEditorSection>
      {effect.operation !== "TRIGGERED" && (
        <EffectEditorSection title={t("effect.condition")} summary={conditionExpressionSummary(effect.condition, nodes, slots, t)} defaultOpen={false}>
          <EffectConditionBuilder nodes={nodes} slots={slots} condition={effect.condition} allowCurrent />
        </EffectEditorSection>
      )}
      {effect.operation === "TRIGGERED" ? (
        <>
        <EffectEditorSection title={t("effect.trigger")} summary={triggerSummary(triggerKind, triggerNodeId, triggerCondition, nodes, slots, t)}>
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
              required
              placeholder={t("effect.triggerNode")}
            />
          )}
          <EffectConditionBuilder nodes={numericNodes} slots={numericSlots} prefix="triggerEdit" condition={triggerCondition} allowCurrent />
        </EffectEditorSection>
        <EffectEditorSection title={t("effect.triggerActions")} summary={triggeredActionsSummary(triggeredPayload?.actions ?? [], triggerRows.length, nodes, slots, t, rootLabel)}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("effect.actionsCount", { count: triggerRows.length })}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setTriggerRows((current) => [...current, newTriggeredActionRow()])}>
              {t("effect.addAction")}
            </Button>
          </div>
          {triggerRows.map((row, index) => (
            <TriggeredActionEditor
              key={row.id}
              row={row}
              index={index}
              rowsCount={triggerRows.length}
              nodes={nodes}
              slots={slots}
              numericNodes={numericNodes}
              containers={containers}
              numericSlotOptions={numericSlotOptions}
              containerSlotOptions={containerSlotOptions}
              allSlotOptions={allSlotOptions}
              rootLabel={rootLabel}
              fieldNamespace="edit-action"
              originalAction={triggeredPayload?.actions[index]}
              setRows={setTriggerRows}
              defaultOpen={index === 0}
            />
          ))}
        </EffectEditorSection>
        </>
      ) : (
        <EffectEditorSection title={t("effect.definition")} summary={definitionSummary(effect, operation, selectedTargetId, nodes, slots, rootLabel, t)}>
          <Labeled label={t("effect.operation")}>
            <select
              value={operation}
              onChange={(event) => {
                const nextOperation = event.target.value as Operation;
                if (nextOperation === operation) return;
                if (!window.confirm(t("effect.changeOperationConfirm"))) {
                  event.target.value = operation;
                  return;
                }
                setOperation(nextOperation);
                setSelectedTargetId("");
                setPatchField("");
                setPatchMode("static");
              }}
              className={selectClass}
            >
              {[...numericOperations, ...structuralOperations].map((item) => <option key={item} value={item}>{operationLabel(item, t)}</option>)}
            </select>
          </Labeled>
          <Labeled label={t("effect.target")}>
            <NodePicker
              name="targetNodeId"
              nodes={isNumeric ? numericNodes : isPatch ? nodes : containers}
              value={actualSelectedTargetId}
              onChange={setSelectedTargetId}
              extraOptions={isNumeric ? numericSlotOptions : isPatch ? allSlotOptions : containerSlotOptions}
              allowedTypes={isNumeric ? ["NUMBER", "BAR"] : isPatch ? undefined : ["CONTAINER", "GROUP"]}
              includeRoot={!isNumeric && !isPatch}
              rootValue="__ROOT__"
              rootLabel={rootLabel}
              required
              placeholder={t("effect.selectTarget")}
            />
          </Labeled>
          {isNumeric && <Labeled label={t("effect.numericField")}><select name="numericField" required value={numericField} onChange={(event) => setNumericField(event.target.value)} className={selectClass}><option value="">{t("effect.numericField")}</option>{numericFields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}</select></Labeled>}
        </EffectEditorSection>
      )}
      {effect.operation !== "TRIGGERED" && (
      <EffectEditorSection title={payloadSectionTitle(isNumeric, isPatch, t)} summary={payloadSummary(effect, isNumeric, isPatch, sourceKind, selectedPatchField, operation, nodes, slots, rootLabel, t)}>
        {isNumeric && <SourceFields effect={effect} nodes={numericNodes} slots={numericSlots} kind={sourceKind} setKind={setSourceKind} />}
        {!isNumeric && !isPatch && <CreatedNodeFields payload={initialPayload} operation={operation} type={createdType} setType={setCreatedType} />}
        {isPatch && <PatchFields fields={patchFields} selectedField={selectedPatchField} value={patchField} setValue={setPatchField} patch={effect.payload?.patch} mode={patchMode} setMode={setPatchMode} targetType={selectedTarget?.type} />}
        {isPatch && patchMode === "source" && selectedPatchField?.derived && <SourceFields effect={effect} nodes={numericNodes} slots={numericSlots} kind={sourceKind} setKind={setSourceKind} />}
      </EffectEditorSection>
      )}

      <div className="flex w-full flex-wrap gap-2"><Button type="submit" disabled={pending}><Save className="h-4 w-4" />{pending ? t("common.saving") : t("common.save")}</Button><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}><X className="h-4 w-4" />{t("common.cancel")}</Button><Button type="button" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={onDelete}><Trash2 className="h-4 w-4" />{t("effect.delete")}</Button></div>
    </form>
  );
}

function SourceFields({ effect, nodes, slots, kind, setKind }: { effect: EffectItem; nodes: CharacterNodeModel[]; slots: TemplateSlotModel[]; kind: string; setKind: (kind: string) => void }) {
  const { t } = useI18n();
  const source = effect.source;
  if (kind === "current") {
    return (
      <Labeled label={t("effect.source")}>
        <select value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>
          <option value="current">{t("effect.currentComplexSource")}</option>
          <option value="number">{t("effect.sourceNumber")}</option>
          <option value="node">{t("effect.sourceNode")}</option>
          <option value="formula">{t("effect.sourceFormula")}</option>
        </select>
      </Labeled>
    );
  }

  return (
    <Labeled label={t("effect.source")}>
      <EffectSourceEditor
        kind={kind as EditableEffectSourceKind}
        onKindChange={setKind}
        nodes={nodes}
        slots={slots}
        defaultSource={source}
      />
    </Labeled>
  );
}

function CreatedNodeFields({ payload, operation, type, setType }: { payload?: EffectDefinition["payload"] extends infer _ ? NonNullable<EffectDefinition["payload"]>["createNode"] : never; operation: Operation; type: NodeType; setType: (type: NodeType) => void }) {
  const { t } = useI18n();
  const data = payload?.data ?? {};
  const actualType = operation === "CREATE_GROUP" ? "GROUP" : type;
  return (
    <div className="space-y-3">
      <Field label={t("effect.createdNodeName")} name="createdName" required defaultValue={payload?.name ?? ""} />
      {operation === "CREATE_NODE" && (
        <Labeled label={t("common.type")}>
          <select value={type} onChange={(event) => setType(event.target.value as NodeType)} className={selectClass}>
            {nodeTypes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Labeled>
      )}
      <Field label={t("common.description")} name="createdDescription" defaultValue={String(data.description ?? "")} />
      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input name="createdCollapsed" type="checkbox" defaultChecked={Boolean(data.collapsedByDefault)} />
          {t("node.collapsedDefault")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="createdHiddenFromPlayer" type="checkbox" defaultChecked={Boolean(data.hiddenFromPlayer)} />
          {t("node.hiddenFromPlayer")}
        </label>
      </div>
      <NodeIconPicker type={actualType} defaultValue={data.icon} />
      <NodeAccentColorPicker name="createdAccentColor" defaultValue={typeof data.accentColor === "string" ? data.accentColor : undefined} />
      {actualType === "NUMBER" && (
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("common.value")} name="createdValue" type="number" step="any" defaultValue={String(data.value ?? 0)} />
          <Field label={t("node.minimum")} name="createdMin" type="number" step="any" defaultValue={data.min == null ? "" : String(data.min)} />
          <Field label={t("node.maximum")} name="createdMax" type="number" step="any" defaultValue={data.max == null ? "" : String(data.max)} />
        </div>
      )}
      {actualType === "BAR" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("node.current")} name="createdCurrent" type="number" step="any" defaultValue={String(data.current ?? 0)} />
          <Field label={t("node.maximum")} name="createdBarMax" type="number" step="any" defaultValue={String(data.max ?? 10)} />
        </div>
      )}
      {actualType === "TEXT" && (
        <Labeled label={t("node.text")}>
          <textarea name="createdText" defaultValue={String(data.text ?? "")} className="min-h-28 w-full resize-y rounded-md border bg-background p-3 text-sm" />
        </Labeled>
      )}
      {actualType === "GROUP" && <Field label={t("node.groupColor")} name="createdColor" defaultValue={String(data.color ?? "teal")} />}
    </div>
  );
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
  if (field.field === "accentColor") return <NodeAccentColorPicker name="patchTextValue" defaultValue={typeof value === "string" ? value : undefined} />;
  if (field.kind === "boolean") {
    return <label className="flex items-center gap-2 text-sm"><input name="patchBooleanValue" type="checkbox" defaultChecked={Boolean(value)} />{t(field.labelKey)}</label>;
  }
  if (field.kind === "text") {
    return <Field label={t(field.labelKey)} name="patchTextValue" defaultValue={value == null ? "" : String(value)} />;
  }
  return <Field label={t(field.labelKey)} name="patchNumberValue" type="number" step="any" defaultValue={value == null ? "" : String(value)} />;
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
    return <Field label={t(field.labelKey)} name={`${prefix}-patchTextValue`} defaultValue={value == null ? "" : String(value)} />;
  }
  return <Field label={t(field.labelKey)} name={`${prefix}-patchNumberValue`} type="number" step="any" defaultValue={value == null ? "" : String(value)} />;
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) { return <Labeled label={label}><Input {...props} /></Labeled>; }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>; }
function targetNodeId(effect: EffectDefinition) { if (effect.target.kind === "node") return effect.target.nodeId; if (effect.target.kind === "templateSlot") return `slot:${effect.target.slotId}`; if (effect.target.kind === "parent") return effect.target.parentNodeId; return null; }
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
function initialSourceKind(source: EffectSource) { if (source.kind === "templateSlot") return "node"; return isEditableSource(source) ? source.kind : "current"; }
function isEditableSource(source: EffectSource) { return source.kind !== "formula" || isSimpleFormula(source.expression); }
function isSimpleFormula(expression: FormulaExpression): expression is Extract<FormulaExpression, { kind: "add" | "subtract" | "multiply" | "divide" }> { return ["add", "subtract", "multiply", "divide"].includes(expression.kind) && "left" in expression && "right" in expression; }
function readSource(kind: string, data: FormData, current: EffectSource): EffectSource {
  if (kind === "current") return current;
  return readEditableEffectSource(data, kind as EditableEffectSourceKind);
}
function readStaticPatch(field: PatchFieldDefinition, data: FormData) {
  if (field.field === "icon") return { icon: String(data.get("icon") ?? "") || undefined };
  if (field.kind === "number") return { [field.field]: Number(data.get("patchNumberValue")) };
  if (field.kind === "boolean") return { [field.field]: data.get("patchBooleanValue") === "on" };
  return { [field.field]: String(data.get("patchTextValue") ?? "") };
}
function readCreatedData(type: NodeType, data: FormData, current: Record<string, unknown> | undefined) {
  const icon = String(data.get("icon") ?? "");
  const accentColor = String(data.get("createdAccentColor") ?? "");
  const common = {
    description: String(data.get("createdDescription") ?? ""),
    ...(icon ? { icon } : {}),
    ...(accentColor ? { accentColor } : {}),
    collapsedByDefault: data.get("createdCollapsed") === "on",
    hiddenFromPlayer: data.get("createdHiddenFromPlayer") === "on",
  };
  if (type === "NUMBER") return { ...common, value: Number(data.get("createdValue") ?? 0), min: nullableNumber(data.get("createdMin")), max: nullableNumber(data.get("createdMax")), allowNegative: Boolean(current?.allowNegative) };
  if (type === "BAR") return { ...common, current: Number(data.get("createdCurrent") ?? 0), max: Number(data.get("createdBarMax") ?? 10) };
  if (type === "TEXT") return { ...common, text: String(data.get("createdText") ?? "") };
  if (type === "TABLE") return { ...common, columns: Array.isArray(current?.columns) ? current.columns : [], rows: Array.isArray(current?.rows) ? current.rows : [] };
  if (type === "CONTAINER") return common;
  return { ...common, color: String(data.get("createdColor") ?? "teal") };
}
function nullableNumber(value: FormDataEntryValue | null) { const raw = String(value ?? ""); return raw === "" ? null : Number(raw); }
function operationLabel(operation: Operation, t: ReturnType<typeof useI18n>["t"]) { return ({ ADD: t("effect.add"), SUBTRACT: t("effect.subtract"), MULTIPLY: t("effect.multiply"), PERCENT_BONUS: t("effect.percentBonus"), SET_BAR_MAX: t("effect.setNumericField"), CREATE_NODE: t("effect.createNode"), CREATE_GROUP: t("effect.createGroup"), PATCH_NODE_PROPS: t("effect.patchNode"), TRIGGERED: t("effect.triggered") } as Record<Operation, string>)[operation]; }
function triggerSummary(kind: TriggerKind, nodeId: string, condition: EffectCondition, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: ReturnType<typeof useI18n>["t"]) {
  const conditionText = conditionExpressionSummary(condition, nodes, slots, t);
  if (kind === "nodeClick") {
    const node = nodeSummary(nodes, nodeId, slots);
    return node ? `${t("effect.triggerNodeClick")}: ${node}; ${conditionText}` : t("effect.triggerNodeClick");
  }
  return conditionText;
}
function triggeredActionsSummary(actions: TriggeredEffectAction[], rowCount: number, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], t: ReturnType<typeof useI18n>["t"], rootLabel: string) {
  if (!actions.length) return t("effect.actionsCount", { count: rowCount });
  const [first] = actions;
  const suffix = actions.length > 1 ? ` +${actions.length - 1}` : "";
  return `${triggeredActionSummary(first, nodes, slots, t, rootLabel)}${suffix}`;
}
function definitionSummary(effect: EffectDefinition, operation: Operation, selectedTargetId: string, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], rootLabel: string, t: ReturnType<typeof useI18n>["t"]) {
  const target = selectedTargetId ? nodeSummary(nodes, selectedTargetId, slots, rootLabel) : targetSummary(effect, nodes, slots, rootLabel);
  return `${operationLabel(operation, t)}: ${target}`;
}
function payloadSectionTitle(isNumeric: boolean, isPatch: boolean, t: ReturnType<typeof useI18n>["t"]) {
  if (isNumeric) return t("effect.source");
  if (isPatch) return t("effect.patchNode");
  return t("effect.createdNodeName");
}
function payloadSummary(effect: EffectDefinition, isNumeric: boolean, isPatch: boolean, sourceKind: string, selectedPatchField: PatchFieldDefinition | null, operation: Operation, nodes: CharacterNodeModel[], slots: TemplateSlotModel[], rootLabel: string, t: ReturnType<typeof useI18n>["t"]) {
  if (isNumeric) {
    if (sourceKind === initialSourceKind(effect.source)) {
      return numericEffectSummary(operation, targetSummary(effect, nodes, slots, rootLabel), effect.payload?.numericField ?? "value", sourceSummary(effect.source, nodes, slots, t), t);
    }
    if (sourceKind === "node") return t("effect.sourceNode");
    if (sourceKind === "formula") return t("effect.sourceFormula");
    if (sourceKind === "current") return t("effect.currentComplexSource");
    return t("effect.sourceNumber");
  }
  if (isPatch) return selectedPatchField ? t(selectedPatchField.labelKey) : t("effect.selectPatchTargetFirst");
  return operationLabel(operation, t);
}
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

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:")
    ? { kind: "slot" as const, id: value.slice("slot:".length) }
    : { kind: "node" as const, id: value };
}
