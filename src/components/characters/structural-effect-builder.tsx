"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { EffectSource } from "@/domain/effects";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import { getStructuralPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { EffectPreview } from "@/components/characters/effect-preview";
import { EffectSourceEditor, readEditableEffectSource, type EditableEffectSourceKind } from "@/components/characters/effect-source-editor";
import { conditionExpressionSummary, fieldLabel, nodeSummary, sourceSummary } from "@/components/characters/effect-summary";
import { NodeAccentColorPicker } from "@/components/characters/node-accent-color-picker";
import { NodeIconPicker } from "@/components/characters/node-icons";
import { NodePicker } from "@/components/characters/node-picker";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type StructuralEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

const nodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function StructuralEffectBuilder({ characterId, templateId, nodes, slots = [] }: StructuralEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [operation, setOperation] = useState<"CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS">("CREATE_NODE");
  const [nodeType, setNodeType] = useState<NodeType>("NUMBER");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [patchField, setPatchField] = useState("");
  const [patchMode, setPatchMode] = useState<"static" | "source">("static");
  const [sourceKind, setSourceKind] = useState<EditableEffectSourceKind>("node");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ condition: string; actions: string[]; warnings: string[] }>(() => ({
    condition: t("effect.conditionAlways"),
    actions: [t("effect.previewSelectTarget")],
    warnings: [t("effect.inlineTargetRequired")],
  }));

  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const rootLabel = characterId ? t("common.rootCharacter") : t("common.rootTemplate");
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  const containerSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP"));
  const patchSlots = slots;
  const containerSlotOptions = containerSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const patchSlotOptions = patchSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const selectedTarget = parseTemplateSelectValue(targetNodeId);
  const patchTarget = selectedTarget.kind === "node" ? nodes.find((node) => node.id === selectedTarget.id) ?? null : null;
  const patchSlot = selectedTarget.kind === "slot" ? patchSlots.find((slot) => slot.id === selectedTarget.id) ?? null : null;
  const patchFields = useMemo(() => patchTarget ? getStructuralPatchFields(patchTarget.type) : [], [patchTarget]);
  const patchFieldsForSelection = patchSlot ? commonStructuralFields : patchFields;
  const selectedPatchField = patchFieldsForSelection.find((field) => field.field === patchField) ?? patchFieldsForSelection[0] ?? null;
  const actionSummary = structuralActionSummary(operation, nodeSummary(nodes, targetNodeId, slots, rootLabel), t);

  useEffect(() => {
    refreshPreview();
  }, [operation, nodeType, targetNodeId, patchField, patchMode, sourceKind, formKey, selectedPatchField]);

  function refreshPreview() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const condition = readEffectCondition(data);
    const currentTargetValue = String(data.get("targetNodeId") ?? targetNodeId);
    const target = currentTargetValue === "__ROOT__" ? rootLabel : nodeSummary(nodes, currentTargetValue, slots, rootLabel);
    const currentOperation = operation;
    const warnings = currentTargetValue ? [] : [t("effect.inlineTargetRequired")];
    let action = t("effect.previewSelectTarget");

    if (currentOperation === "PATCH_NODE_PROPS") {
      const field = String(data.get("patchField") || selectedPatchField?.field || "");
      const label = fieldLabel(field, t);
      const value = selectedPatchField?.derived && patchMode === "source"
        ? sourceSummary(readSource(sourceKind, data), nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR"), slots, t)
        : staticPatchPreviewValue(selectedPatchField, data, t);
      action = target ? `${target}.${label} = ${value}` : t("effect.previewSelectTarget");
    } else {
      const createdName = String(data.get("createdNodeName") || "");
      const createdType = currentOperation === "CREATE_GROUP" ? "GROUP" : nodeType;
      action = target ? `${operationLabel(currentOperation, t)}: ${createdName || createdType} -> ${target}` : t("effect.previewSelectTarget");
    }

    setPreview({
      condition: conditionExpressionSummary(condition, nodes, slots, t),
      actions: [action],
      warnings,
    });
  }

  useEffect(() => {
    if (!selectedPatchField) {
      setPatchField("");
      setPatchMode("static");
      return;
    }
    if (!patchFields.some((field) => field.field === patchField)) setPatchField(selectedPatchField.field);
    if (!selectedPatchField.derived) setPatchMode("static");
  }, [patchField, patchFields, selectedPatchField]);

  async function submit(data: FormData) {
    setPending(true);
    setError(null);
    const targetValue = String(data.get("targetNodeId") ?? "");
    const targetNodeIdValue = targetValue === "__ROOT__" ? null : targetValue;
    const condition = readEffectCondition(data);
    const createType = operation === "CREATE_GROUP" ? "GROUP" : nodeType;
    const base = { name: data.get("name"), operation, targetNodeId: targetNodeIdValue, condition };

    const body = operation === "PATCH_NODE_PROPS"
      ? {
          ...base,
          patch: selectedPatchField && patchMode === "static" ? readStaticPatch(selectedPatchField, data) : {},
          ...(selectedPatchField && patchMode === "source"
            ? { source: readSource(sourceKind, data), patchFromSource: { field: selectedPatchField.field } }
            : {}),
        }
      : {
          ...base,
          createNode: {
            type: createType,
            name: String(data.get("createdNodeName")),
            data: defaultData(
              createType,
              String(data.get("description") || ""),
              String(data.get("icon") || ""),
              String(data.get("accentColor") || ""),
              data.get("collapsedByDefault") === "on",
              data.get("hiddenFromPlayer") === "on",
            ),
          },
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return;
    }
    setOperation("CREATE_NODE");
    setNodeType("NUMBER");
    setTargetNodeId("");
    setPatchField("");
    setPatchMode("static");
    setSourceKind("node");
    setFormKey((current) => current + 1);
    router.refresh();
  }

  return (
    <form key={formKey} ref={formRef} action={submit} className="space-y-3">
      <Input name="name" required placeholder={t("effect.name")} />
      <EffectEditorSection title={t("effect.condition")} summary={t("effect.conditionAlways")}>
        <EffectConditionBuilder nodes={nodes} slots={slots} onConditionChange={refreshPreview} />
      </EffectEditorSection>
      <EffectEditorSection title={t("effect.action")} summary={actionSummary}>
        <select value={operation} onChange={(event) => setOperation(event.target.value as typeof operation)} className={selectClass}>
          <option value="CREATE_NODE">{t("effect.createNode")}</option>
          <option value="CREATE_GROUP">{t("effect.createGroup")}</option>
          <option value="PATCH_NODE_PROPS">{t("effect.patchNode")}</option>
        </select>
        <NodePicker
          name="targetNodeId"
          nodes={operation === "PATCH_NODE_PROPS" ? nodes : containers}
          value={targetNodeId}
          onChange={setTargetNodeId}
          extraOptions={operation === "PATCH_NODE_PROPS" ? patchSlotOptions : containerSlotOptions}
          allowedTypes={operation === "PATCH_NODE_PROPS" ? undefined : ["CONTAINER", "GROUP"]}
          includeRoot={operation !== "PATCH_NODE_PROPS"}
          rootValue="__ROOT__"
          rootLabel={rootLabel}
          required
          placeholder={operation === "PATCH_NODE_PROPS" ? t("effect.patchTarget") : t("effect.place")}
        />
      </EffectEditorSection>

      {operation !== "PATCH_NODE_PROPS" ? (
        <EffectEditorSection title={t("effect.createdNodeName")} summary={`${operation === "CREATE_GROUP" ? "GROUP" : nodeType} -> ${nodeSummary(nodes, targetNodeId, slots, rootLabel) || rootLabel}`}>
          <Input name="createdNodeName" required placeholder={t("effect.createdNodeName")} />
          {operation === "CREATE_NODE" && (
            <select value={nodeType} onChange={(event) => setNodeType(event.target.value as NodeType)} className={selectClass}>
              {nodeTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          )}
          <Input name="description" placeholder={t("common.description")} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input name="collapsedByDefault" type="checkbox" />
              {t("node.collapsedDefault")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="hiddenFromPlayer" type="checkbox" />
              {t("node.hiddenFromPlayer")}
            </label>
          </div>
          <NodeIconPicker type={operation === "CREATE_GROUP" ? "GROUP" : nodeType} />
          <NodeAccentColorPicker />
        </EffectEditorSection>
      ) : (
        <EffectEditorSection title={t("effect.patchNode")} summary={selectedPatchField ? t(selectedPatchField.labelKey) : t("effect.selectPatchTargetFirst")}>
          <PatchControls
            fields={patchFields}
            selectedField={selectedPatchField}
            value={patchField}
            onFieldChange={setPatchField}
            mode={patchMode}
            onModeChange={setPatchMode}
            sourceKind={sourceKind}
            onSourceKindChange={setSourceKind}
            numericNodes={nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR")}
            numericSlots={slots.filter((slot) => slot.acceptedTypes.some((type) => type === "NUMBER" || type === "BAR"))}
            targetType={patchTarget?.type}
          />
        </EffectEditorSection>
      )}

      <EffectPreview condition={preview.condition} actions={preview.actions} warnings={preview.warnings} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? t("effect.creating") : t("effect.addStructural")}
      </Button>
    </form>
  );
}

function PatchControls({
  fields,
  selectedField,
  value,
  onFieldChange,
  mode,
  onModeChange,
  sourceKind,
  onSourceKindChange,
  numericNodes,
  numericSlots,
  targetType,
}: {
  fields: PatchFieldDefinition[];
  selectedField: PatchFieldDefinition | null;
  value: string;
  onFieldChange: (field: string) => void;
  mode: "static" | "source";
  onModeChange: (mode: "static" | "source") => void;
  sourceKind: EditableEffectSourceKind;
  onSourceKindChange: (kind: EditableEffectSourceKind) => void;
  numericNodes: CharacterNodeModel[];
  numericSlots: TemplateSlotModel[];
  targetType?: NodeType;
}) {
  const { t } = useI18n();
  if (!selectedField) return <p className="text-sm text-muted-foreground">{t("effect.selectPatchTargetFirst")}</p>;

  return (
    <div className="space-y-3">
      <select name="patchField" required value={value} onChange={(event) => onFieldChange(event.target.value)} className={selectClass}>
        {fields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}
      </select>
      {selectedField.derived && (
        <select value={mode} onChange={(event) => onModeChange(event.target.value as "static" | "source")} className={selectClass}>
          <option value="static">{t("effect.patchModeStatic")}</option>
          <option value="source">{t("effect.patchModeSource")}</option>
        </select>
      )}
      {mode === "source" && selectedField.derived
        ? <EffectSourceEditor kind={sourceKind} onKindChange={onSourceKindChange} nodes={numericNodes} slots={numericSlots} />
        : <StaticPatchField field={selectedField} targetType={targetType} />}
    </div>
  );
}

function StaticPatchField({ field, targetType }: { field: PatchFieldDefinition; targetType?: NodeType }) {
  const { t } = useI18n();
  if (field.field === "icon" && targetType) return <NodeIconPicker type={targetType} />;
  if (field.field === "accentColor") return <NodeAccentColorPicker name="patchTextValue" />;
  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input name="patchBooleanValue" type="checkbox" />
        {t(field.labelKey)}
      </label>
    );
  }
  if (field.kind === "text") {
    return <Input name="patchTextValue" placeholder={t(field.labelKey)} />;
  }
  return <Input name="patchNumberValue" type="number" step="any" required placeholder={t(field.labelKey)} />;
}

function defaultData(type: NodeType, description: string, icon: string, accentColor: string, collapsedByDefault = false, hiddenFromPlayer = false) {
  const common = {
    description,
    ...(icon ? { icon } : {}),
    ...(accentColor ? { accentColor } : {}),
    collapsedByDefault,
    hiddenFromPlayer,
  };
  if (type === "NUMBER") return { ...common, value: 0 };
  if (type === "BAR") return { ...common, current: 0, min: null, max: 10 };
  if (type === "TEXT") return { ...common, text: "" };
  if (type === "TABLE") return { ...common, columns: [], rows: [] };
  if (type === "CONTAINER") return common;
  return { ...common, color: "teal" };
}

function readStaticPatch(field: PatchFieldDefinition, data: FormData) {
  if (field.field === "icon") return { icon: String(data.get("icon") ?? "") || undefined };
  if (field.kind === "number") return { [field.field]: Number(data.get("patchNumberValue")) };
  if (field.kind === "boolean") return { [field.field]: data.get("patchBooleanValue") === "on" };
  return { [field.field]: String(data.get("patchTextValue") ?? "") };
}

function readSource(kind: EditableEffectSourceKind, data: FormData): EffectSource {
  return readEditableEffectSource(data, kind);
}

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


function operationLabel(operation: "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS", t: ReturnType<typeof useI18n>["t"]) {
  if (operation === "CREATE_GROUP") return t("effect.createGroup");
  if (operation === "PATCH_NODE_PROPS") return t("effect.patchNode");
  return t("effect.createNode");
}

function structuralActionSummary(operation: "CREATE_NODE" | "CREATE_GROUP" | "PATCH_NODE_PROPS", target: string, t: ReturnType<typeof useI18n>["t"]) {
  const action = operationLabel(operation, t);
  return target ? `${action}: ${target}` : action;
}

function staticPatchPreviewValue(field: PatchFieldDefinition | null, data: FormData, t: ReturnType<typeof useI18n>["t"]) {
  if (!field) return "...";
  if (field.field === "icon") return String(data.get("icon") ?? "") || t("icons.label");
  if (field.field === "accentColor") return String(data.get("patchTextValue") ?? "") || t("node.noAccentColor");
  if (field.kind === "boolean") return data.get("patchBooleanValue") === "on" ? "true" : "false";
  if (field.kind === "number") return String(data.get("patchNumberValue") ?? "") || "0";
  return String(data.get("patchTextValue") ?? "") || "...";
}
