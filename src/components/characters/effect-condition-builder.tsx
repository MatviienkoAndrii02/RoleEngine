"use client";

import { useState } from "react";
import type { EffectCondition } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function EffectConditionBuilder({ nodes, prefix = "condition" }: { nodes: CharacterNodeModel[]; prefix?: string }) {
  const { t } = useI18n();
  const [join, setJoin] = useState("single");
  const [firstKind, setFirstKind] = useState("always");
  const [secondKind, setSecondKind] = useState("exists");
  const options = nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>);

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
      <ConditionFields kind={firstKind} prefix={`${prefix}First`} options={options} />
      {(join === "and" || join === "or") && (
        <div className="space-y-2 rounded-md border border-dashed p-2">
          <p className="text-xs text-muted-foreground">{t("effect.conditionAdditional")}</p>
          <ConditionKind name={`${prefix}SecondKind`} value={secondKind} onChange={setSecondKind} />
          <ConditionFields kind={secondKind} prefix={`${prefix}Second`} options={options} />
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
  options,
}: {
  kind: string;
  prefix: string;
  options: React.ReactNode;
}) {
  const { t } = useI18n();
  if (kind === "always") return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <select name={`${prefix}NodeId`} className={selectClass}>
        <option value="">{t("effect.selectNode")}</option>
        {options}
      </select>
      {kind !== "exists" && <Input name={`${prefix}Value`} type="number" step="any" required placeholder={t("common.value")} />}
    </div>
  );
}

function readConditionLeaf(data: FormData, prefix: string): EffectCondition {
  const kind = String(data.get(`${prefix}Kind`) ?? "always");
  if (kind === "always") return { kind: "always" };
  const nodeId = String(data.get(`${prefix}NodeId`) ?? "");
  if (kind === "exists") return { kind: "fieldExists", nodeId };
  return {
    kind: "compare",
    nodeId,
    operator: kind as "gt" | "lt" | "eq",
    value: { kind: "number", value: Number(data.get(`${prefix}Value`)) },
  };
}
