"use client";

import { useState } from "react";
import type { EffectCondition, EffectSource } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Input } from "@/components/ui/input";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function EffectConditionBuilder({ nodes, slots = [], prefix = "condition" }: { nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[]; prefix?: string }) {
  const { t } = useI18n();
  const [join, setJoin] = useState("single");
  const [firstKind, setFirstKind] = useState("always");
  const [secondKind, setSecondKind] = useState("exists");
  const slotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select name={`${prefix}Join`} value={join} onChange={(event) => setJoin(event.target.value)} className={selectClass}>
          <option value="single">{t("effect.singleCondition")}</option>
          <option value="and">{t("effect.conditionAnd")}</option>
          <option value="or">{t("effect.conditionOr")}</option>
          <option value="not">{t("effect.conditionNot")}</option>
        </select>
        <ConditionKind name={`${prefix}FirstKind`} value={firstKind} onChange={setFirstKind} />
      </div>
      <ConditionFields kind={firstKind} prefix={`${prefix}First`} nodes={nodes} slotOptions={slotOptions} />
      {(join === "and" || join === "or") && (
        <div className="space-y-2 rounded-md border border-dashed p-2">
          <p className="text-xs text-muted-foreground">{t("effect.conditionAdditional")}</p>
          <ConditionKind name={`${prefix}SecondKind`} value={secondKind} onChange={setSecondKind} />
          <ConditionFields kind={secondKind} prefix={`${prefix}Second`} nodes={nodes} slotOptions={slotOptions} />
        </div>
      )}
    </div>
  );
}

export function readEffectCondition(data: FormData, prefix = "condition"): EffectCondition {
  const join = String(data.get(`${prefix}Join`) ?? "single");
  const first = readConditionLeaf(data, `${prefix}First`);
  if (join === "not") return { kind: "not", condition: first };
  if (join === "and" || join === "or") {
    return { kind: join, conditions: [first, readConditionLeaf(data, `${prefix}Second`)] };
  }
  return first;
}

function ConditionKind({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
      <option value="always">{t("effect.conditionAlways")}</option>
      <option value="exists">{t("effect.conditionExists")}</option>
      <option value="gt">{t("effect.conditionGt")}</option>
      <option value="lt">{t("effect.conditionLt")}</option>
      <option value="eq">{t("effect.conditionEq")}</option>
    </select>
  );
}

function ConditionFields({
  kind,
  prefix,
  nodes,
  slotOptions,
}: {
  kind: string;
  prefix: string;
  nodes: CharacterNodeModel[];
  slotOptions: Array<{ value: string; label: string }>;
}) {
  const { t } = useI18n();
  const [valueKind, setValueKind] = useState<"number" | "node">("number");
  if (kind === "always") return null;
  return (
    <div className="space-y-2">
      <NodePicker name={`${prefix}NodeId`} nodes={nodes} extraOptions={slotOptions} allowedTypes={["NUMBER", "BAR"]} required placeholder={t("effect.selectNode")} />
      {kind !== "exists" && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          <select name={`${prefix}ValueKind`} value={valueKind} onChange={(event) => setValueKind(event.target.value as "number" | "node")} className={selectClass}>
            <option value="number">{t("effect.sourceNumber")}</option>
            <option value="node">{t("effect.sourceNode")}</option>
          </select>
          {valueKind === "number" ? (
            <Input name={`${prefix}Value`} type="number" step="any" required placeholder={t("common.value")} />
          ) : (
            <div className="space-y-2">
              <NodePicker name={`${prefix}ValueNodeId`} nodes={nodes} extraOptions={slotOptions} allowedTypes={["NUMBER", "BAR"]} required placeholder={t("effect.selectNode")} />
              <select name={`${prefix}ValueField`} defaultValue="value" className={selectClass}>
                {numericFields.map((field) => <option key={field} value={field}>{fieldLabel(field, t)}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function readConditionLeaf(data: FormData, prefix: string): EffectCondition {
  const kind = String(data.get(`${prefix}Kind`) ?? "always");
  if (kind === "always") return { kind: "always" };
  const nodeId = String(data.get(`${prefix}NodeId`) ?? "");
  const parsed = parseTemplateSelectValue(nodeId);
  if (kind === "exists") return parsed.kind === "slot" ? { kind: "slotExists", slotId: parsed.id } : { kind: "fieldExists", nodeId: parsed.id };
  if (parsed.kind === "slot") {
    return {
      kind: "compareSlot",
      slotId: parsed.id,
      operator: kind as "gt" | "lt" | "eq",
      value: readCompareSource(data, prefix),
    };
  }
  return {
    kind: "compare",
    nodeId: parsed.id,
    operator: kind as "gt" | "lt" | "eq",
    value: readCompareSource(data, prefix),
  };
}

const numericFields = ["value", "min", "max"] as const;

function readCompareSource(data: FormData, prefix: string): EffectSource {
  const kind = String(data.get(`${prefix}ValueKind`) || "number");
  if (kind === "number") return { kind: "number", value: Number(data.get(`${prefix}Value`)) };
  const value = String(data.get(`${prefix}ValueNodeId`) ?? "");
  const field = String(data.get(`${prefix}ValueField`) || "value") as "value" | "current" | "min" | "max";
  const parsed = parseTemplateSelectValue(value);
  if (parsed.kind === "slot") return { kind: "templateSlot", slotId: parsed.id, field };
  return { kind: "node", nodeId: parsed.id, field };
}

function fieldLabel(field: (typeof numericFields)[number], t: ReturnType<typeof useI18n>["t"]) {
  if (field === "min") return t("node.minimum");
  if (field === "max") return t("node.maximum");
  return t("common.value");
}

function parseTemplateSelectValue(value: string) {
  return value.startsWith("slot:")
    ? { kind: "slot" as const, id: value.slice("slot:".length) }
    : { kind: "node" as const, id: value };
}
