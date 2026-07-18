"use client";

import type { EffectSource } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Input } from "@/components/ui/input";
import { FormulaSourceFields, readFormulaExpression } from "@/components/characters/formula-source-fields";
import { NodePicker, type NodePickerExtraOption } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

export type EditableEffectSourceKind = "number" | "node" | "formula";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function EffectSourceEditor({
  kind,
  onKindChange,
  nodes,
  slots = [],
  extraOptions,
  prefix = "",
  defaultSource,
  compactNodePicker = true,
}: {
  kind: EditableEffectSourceKind;
  onKindChange: (kind: EditableEffectSourceKind) => void;
  nodes: CharacterNodeModel[];
  slots?: TemplateSlotModel[];
  extraOptions?: NodePickerExtraOption[];
  prefix?: string;
  defaultSource?: EffectSource | null;
  compactNodePicker?: boolean;
}) {
  const { t } = useI18n();
  const slotOptions = extraOptions ?? slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const simpleFormula = defaultSource?.kind === "formula" ? defaultSource.expression : null;

  return (
    <div className="space-y-3">
      <select name={sourceFieldName(prefix, "sourceKind")} value={kind} onChange={(event) => onKindChange(event.target.value as EditableEffectSourceKind)} className={selectClass}>
        <option value="number">{t("effect.sourceNumber")}</option>
        <option value="node">{t("effect.sourceNode")}</option>
        <option value="formula">{t("effect.sourceFormula")}</option>
      </select>
      {kind === "number" && <Input name={sourceFieldName(prefix, "sourceValue")} type="number" step="any" required defaultValue={defaultSource?.kind === "number" ? defaultSource.value : undefined} placeholder={t("common.value")} />}
      {kind === "node" && (
        <NodePicker
          name={sourceFieldName(prefix, "sourceNodeId")}
          nodes={nodes}
          extraOptions={slotOptions}
          allowedTypes={["NUMBER", "BAR"]}
          required
          defaultValue={sourceNodeValue(defaultSource)}
          placeholder={t("effect.selectNode")}
          compact={compactNodePicker}
        />
      )}
      {kind === "formula" && <FormulaSourceFields nodes={nodes} slots={slots} prefix={formulaPrefix(prefix)} defaultExpression={simpleFormula} />}
    </div>
  );
}

export function readEditableEffectSource(data: FormData, kind: EditableEffectSourceKind, prefix = ""): EffectSource {
  if (kind === "number") return { kind: "number", value: Number(data.get(sourceFieldName(prefix, "sourceValue"))) };
  if (kind === "node") return readNodeOrSlotSource(String(data.get(sourceFieldName(prefix, "sourceNodeId")) ?? ""));
  return { kind: "formula", expression: readFormulaExpression(data, formulaPrefix(prefix)) };
}

export function sourceKindLabel(kind: EditableEffectSourceKind, t: ReturnType<typeof useI18n>["t"]) {
  if (kind === "node") return t("effect.sourceNode");
  if (kind === "formula") return t("effect.sourceFormula");
  return t("effect.sourceNumber");
}

function sourceFieldName(prefix: string, name: string) {
  return prefix ? `${prefix}-${name}` : name;
}

function formulaPrefix(prefix: string) {
  return prefix ? `${prefix}-formula` : "formula";
}

function sourceNodeValue(source: EffectSource | null | undefined) {
  if (source?.kind === "templateSlot") return `slot:${source.slotId}`;
  if (source?.kind === "node") return source.nodeId;
  return "";
}

function readNodeOrSlotSource(value: string): EffectSource {
  if (value.startsWith("slot:")) return { kind: "templateSlot", slotId: value.slice("slot:".length), field: "value" };
  return { kind: "node", nodeId: value, field: "value" };
}
