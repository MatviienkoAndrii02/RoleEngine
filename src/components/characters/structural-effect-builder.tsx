"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { EffectSource } from "@/domain/effects";
import type { CharacterNodeModel, NodeType } from "@/domain/nodes";
import { getStructuralPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { NodeIconPicker } from "@/components/characters/node-icons";
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
  const [sourceKind, setSourceKind] = useState("node");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const rootLabel = characterId ? t("common.rootCharacter") : t("common.rootTemplate");
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  const containerSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP"));
  const patchSlots = slots;
  const selectedTarget = parseTemplateSelectValue(targetNodeId);
  const patchTarget = selectedTarget.kind === "node" ? nodes.find((node) => node.id === selectedTarget.id) ?? null : null;
  const patchSlot = selectedTarget.kind === "slot" ? patchSlots.find((slot) => slot.id === selectedTarget.id) ?? null : null;
  const patchFields = useMemo(() => patchTarget ? getStructuralPatchFields(patchTarget.type) : [], [patchTarget]);
  const patchFieldsForSelection = patchSlot ? commonStructuralFields : patchFields;
  const selectedPatchField = patchFieldsForSelection.find((field) => field.field === patchField) ?? patchFieldsForSelection[0] ?? null;

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
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-3">
      <Input name="name" required placeholder={t("effect.name")} />
      <select value={operation} onChange={(event) => setOperation(event.target.value as typeof operation)} className={selectClass}>
        <option value="CREATE_NODE">{t("effect.createNode")}</option>
        <option value="CREATE_GROUP">{t("effect.createGroup")}</option>
        <option value="PATCH_NODE_PROPS">{t("effect.patchNode")}</option>
      </select>
      <select name="targetNodeId" required value={targetNodeId} onChange={(event) => setTargetNodeId(event.target.value)} className={selectClass}>
        <option value="">{operation === "PATCH_NODE_PROPS" ? t("effect.patchTarget") : t("effect.place")}</option>
        {operation !== "PATCH_NODE_PROPS" && <option value="__ROOT__">{rootLabel}</option>}
        {(operation === "PATCH_NODE_PROPS" ? nodes : containers).map((node) => (
          <option key={node.id} value={node.id}>{node.name}</option>
        ))}
        {(operation === "PATCH_NODE_PROPS" ? patchSlots : containerSlots).map((slot) => (
          <option key={slot.id} value={`slot:${slot.id}`}>{t("templateSlot.option", { label: slot.label })}</option>
        ))}
      </select>

      {operation !== "PATCH_NODE_PROPS" ? (
        <>
          <Input name="createdNodeName" required placeholder={t("effect.createdNodeName")} />
          {operation === "CREATE_NODE" && (
            <select value={nodeType} onChange={(event) => setNodeType(event.target.value as NodeType)} className={selectClass}>
              {nodeTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          )}
          <Input name="description" placeholder={t("common.description")} />
          <label className="flex items-center gap-2 text-sm">
            <input name="collapsedByDefault" type="checkbox" />
            {t("node.collapsedDefault")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="hiddenFromPlayer" type="checkbox" />
            {t("node.hiddenFromPlayer")}
          </label>
          <NodeIconPicker type={operation === "CREATE_GROUP" ? "GROUP" : nodeType} />
        </>
      ) : (
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
      )}

      <EffectConditionBuilder nodes={nodes} slots={slots} />
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
  sourceKind: string;
  onSourceKindChange: (kind: string) => void;
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
        ? <SourceFields nodes={numericNodes} slots={numericSlots} kind={sourceKind} setKind={onSourceKindChange} />
        : <StaticPatchField field={selectedField} targetType={targetType} />}
    </div>
  );
}

function StaticPatchField({ field, targetType }: { field: PatchFieldDefinition; targetType?: NodeType }) {
  const { t } = useI18n();
  if (field.field === "icon" && targetType) return <NodeIconPicker type={targetType} />;
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

function SourceFields({ nodes, slots, kind, setKind }: { nodes: CharacterNodeModel[]; slots: TemplateSlotModel[]; kind: string; setKind: (kind: string) => void }) {
  const { t } = useI18n();
  const options = [
    ...nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>),
    ...slots.map((slot) => <option key={slot.id} value={`slot:${slot.id}`}>{t("templateSlot.option", { label: slot.label })}</option>),
  ];
  return (
    <div className="space-y-2">
      <select value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}>
        <option value="number">{t("effect.sourceNumber")}</option>
        <option value="node">{t("effect.sourceNode")}</option>
        <option value="formula">{t("effect.sourceFormula")}</option>
      </select>
      {kind === "number" ? (
        <Input name="sourceValue" type="number" step="any" required placeholder={t("common.value")} />
      ) : kind === "node" ? (
        <select name="sourceNodeId" required className={selectClass}><option value="">{t("effect.selectNode")}</option>{options}</select>
      ) : (
        <div className="grid grid-cols-[1fr_auto_100px] gap-2">
          <select name="formulaNodeId" required className={selectClass}><option value="">{t("effect.selectNode")}</option>{options}</select>
          <select name="formulaOperator" className={selectClass}><option value="add">+</option><option value="subtract">-</option><option value="multiply">x</option><option value="divide">/</option></select>
          <Input name="formulaValue" type="number" step="any" required defaultValue={10} />
        </div>
      )}
    </div>
  );
}

function defaultData(type: NodeType, description: string, icon: string, collapsedByDefault = false, hiddenFromPlayer = false) {
  const common = { description, icon, collapsedByDefault, hiddenFromPlayer };
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

function readSource(kind: string, data: FormData): EffectSource {
  if (kind === "number") return { kind: "number", value: Number(data.get("sourceValue")) };
  if (kind === "node") return readNodeOrSlotSource(String(data.get("sourceNodeId")));
  return {
    kind: "formula",
    expression: readNodeOrSlotFormulaRef(String(data.get("formulaNodeId")), String(data.get("formulaOperator")), Number(data.get("formulaValue"))),
  };
}

const commonStructuralFields: PatchFieldDefinition[] = [
  { field: "collapsedByDefault", labelKey: "node.collapsedDefault", kind: "boolean", derived: false },
  { field: "hiddenFromPlayer", labelKey: "node.hiddenFromPlayer", kind: "boolean", derived: false },
  { field: "description", labelKey: "common.description", kind: "text", derived: false },
  { field: "icon", labelKey: "icons.label", kind: "text", derived: false },
];

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:")
    ? { kind: "slot" as const, id: value.slice("slot:".length) }
    : { kind: "node" as const, id: value };
}

function readNodeOrSlotSource(value: string): EffectSource {
  const parsed = parseTemplateSelectValue(value);
  if (parsed.kind === "slot") return { kind: "templateSlot", slotId: parsed.id, field: "value" };
  return { kind: "node", nodeId: parsed.id, field: "value" };
}

function readNodeOrSlotFormulaRef(value: string, operator: string, amount: number) {
  const parsed = parseTemplateSelectValue(value);
  return {
    kind: operator as "add" | "subtract" | "multiply" | "divide",
    left: parsed.kind === "slot"
      ? { kind: "slotRef" as const, slotId: parsed.id, field: "value" as const }
      : { kind: "ref" as const, nodeId: parsed.id, field: "value" as const },
    right: { kind: "const" as const, value: amount },
  };
}
