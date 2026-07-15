"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { getNumericPatchFields, type PatchFieldDefinition } from "@/domain/node-patches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { EffectPreview } from "@/components/characters/effect-preview";
import { EffectSourceEditor, readEditableEffectSource, sourceKindLabel, type EditableEffectSourceKind } from "@/components/characters/effect-source-editor";
import { fieldLabel, nodeSummary } from "@/components/characters/effect-summary";
import { NodePicker } from "@/components/characters/node-picker";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type NumericEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

export function NumericEffectBuilder({ characterId, templateId, nodes, slots = [] }: NumericEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const numeric = nodes.filter((n) => n.type === "NUMBER" || n.type === "BAR");
  const numericSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "NUMBER" || type === "BAR"));
  const [targetNodeId, setTargetNodeId] = useState("");
  const [sourceKind, setSourceKind] = useState<EditableEffectSourceKind>("number");
  const [operation, setOperation] = useState("ADD");
  const [numericField, setNumericField] = useState("value");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const selectedTarget = parseTemplateSelectValue(targetNodeId);
  const targetNode = selectedTarget.kind === "node" ? numeric.find((node) => node.id === selectedTarget.id) ?? null : null;
  const targetSlot = selectedTarget.kind === "slot" ? numericSlots.find((slot) => slot.id === selectedTarget.id) ?? null : null;
  const targetFields = targetNode ? getNumericPatchFields(targetNode.type) : [];
  const targetFieldsForSelection = targetSlot ? commonNumericFields : targetFields;
  const slotOptions = numericSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const targetSummary = numericTargetSummary(nodeSummary(numeric, targetNodeId, numericSlots), numericField, operation, sourceKindLabel(sourceKind, t), t);

  async function submit(data: FormData) {
    setPending(true); setError(null);
    const source = readEditableEffectSource(data, sourceKind);
    const finalCondition = readEffectCondition(data);
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), operation: data.get("operation"), targetNodeId: data.get("targetNodeId"), numericField: data.get("numericField"), source, condition: finalCondition }) });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return;
    }
    setTargetNodeId("");
    setSourceKind("number");
    setOperation("ADD");
    setNumericField("value");
    setFormKey((current) => current + 1);
    router.refresh();
  }

  return (
    <form key={formKey} action={submit} className="space-y-3">
      <Input name="name" required placeholder={t("effect.name")} />
      <EffectEditorSection title={t("effect.condition")} summary={t("effect.conditionAlways")}>
        <EffectConditionBuilder nodes={numeric} slots={numericSlots} />
      </EffectEditorSection>
      <EffectEditorSection title={t("effect.target")} summary={targetSummary}>
        <NodePicker
          name="targetNodeId"
          nodes={numeric}
          value={targetNodeId}
          onChange={setTargetNodeId}
          extraOptions={slotOptions}
          allowedTypes={["NUMBER", "BAR"]}
          required
          placeholder={t("effect.selectTarget")}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select name="numericField" placeholder={t("effect.numericField")} value={numericField} onChange={setNumericField}>
            {targetFieldsForSelection.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}
          </Select>
          <Select name="operation" value={operation} onChange={setOperation}><option value="ADD">{t("effect.add")}</option><option value="SUBTRACT">{t("effect.subtract")}</option><option value="MULTIPLY">{t("effect.multiply")}</option><option value="PERCENT_BONUS">{t("effect.percentBonus")}</option><option value="SET_BAR_MAX">{t("effect.setNumericField")}</option></Select>
        </div>
      </EffectEditorSection>
      <EffectEditorSection title={t("effect.source")} summary={sourceKindLabel(sourceKind, t)}>
        <EffectSourceEditor kind={sourceKind} onKindChange={setSourceKind} nodes={numeric} slots={numericSlots} />
      </EffectEditorSection>
      <EffectPreview
        lines={[targetNodeId ? targetSummary : t("effect.previewSelectTarget"), `${t("effect.source")}: ${sourceKindLabel(sourceKind, t)}`]}
        warnings={!targetNodeId ? [t("effect.inlineTargetRequired")] : []}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}<Button disabled={pending}><Plus className="h-4 w-4" />{pending ? t("effect.checking") : t("effect.addEffect")}</Button>
    </form>
  );
}
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
function Select({ name, placeholder, children, value, onChange }: { name: string; placeholder?: string; children: React.ReactNode; value?: string; onChange?: (value: string) => void }) { return <select name={name} required value={value} onChange={(event) => onChange?.(event.target.value)} className={selectClass}>{placeholder && <option value="">{placeholder}</option>}{children}</select>; }

const commonNumericFields: PatchFieldDefinition[] = [
  { field: "value", labelKey: "common.value", kind: "number", derived: false },
  { field: "min", labelKey: "node.minimum", kind: "number", derived: false },
  { field: "max", labelKey: "node.maximum", kind: "number", derived: false },
];

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:")
    ? { kind: "slot" as const, id: value.slice("slot:".length) }
    : { kind: "node" as const, id: value };
}

function numericTargetSummary(target: string, field: string, operation: string, source: string, t: ReturnType<typeof useI18n>["t"]) {
  if (!target) return t("effect.selectTarget");
  const left = `${target}.${fieldLabel(field, t)}`;
  if (operation === "SUBTRACT") return `${left} - ${source}`;
  if (operation === "MULTIPLY") return `${left} x ${source}`;
  if (operation === "PERCENT_BONUS") return `${left} + ${source}%`;
  if (operation === "SET_BAR_MAX") return `${left} = ${source}`;
  return `${left} + ${source}`;
}
