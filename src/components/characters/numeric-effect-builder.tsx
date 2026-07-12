"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import { getNumericPatchFields } from "@/domain/node-patches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type NumericEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[] }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[] };

export function NumericEffectBuilder({ characterId, templateId, nodes }: NumericEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const numeric = nodes.filter((n) => n.type === "NUMBER" || n.type === "BAR");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [sourceKind, setSourceKind] = useState("number");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const targetNode = numeric.find((node) => node.id === targetNodeId) ?? null;
  const targetFields = targetNode ? getNumericPatchFields(targetNode.type) : [];
  const options = numeric.map((n) => <option key={n.id} value={n.id}>{n.name}</option>);

  async function submit(data: FormData) {
    setPending(true); setError(null);
    const source = sourceKind === "number" ? { kind: "number", value: Number(data.get("sourceValue")) } : sourceKind === "node" ? { kind: "node", nodeId: String(data.get("sourceNodeId")), field: "value" } : { kind: "formula", expression: { kind: String(data.get("formulaOperator")), left: { kind: "ref", nodeId: String(data.get("formulaNodeId")), field: "value" }, right: { kind: "const", value: Number(data.get("formulaValue")) } } };
    const finalCondition = readEffectCondition(data);
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), operation: data.get("operation"), targetNodeId: data.get("targetNodeId"), numericField: data.get("numericField"), source, condition: finalCondition }) });
    setPending(false); if (!response.ok) { setError(await localizedApiError(response, t, "effect.saveFailed")); return; } router.refresh();
  }

  return (
    <form action={submit} className="space-y-3">
      <Input name="name" required placeholder={t("effect.name")} />
      <select name="targetNodeId" required value={targetNodeId} onChange={(event) => setTargetNodeId(event.target.value)} className={selectClass}>
        <option value="">{t("effect.selectTarget")}</option>
        {options}
      </select>
      <Select name="numericField" placeholder={t("effect.numericField")}>
        {targetFields.map((field) => <option key={field.field} value={field.field}>{t(field.labelKey)}</option>)}
      </Select>
      <Select name="operation"><option value="ADD">{t("effect.add")}</option><option value="SUBTRACT">{t("effect.subtract")}</option><option value="MULTIPLY">{t("effect.multiply")}</option><option value="PERCENT_BONUS">{t("effect.percentBonus")}</option><option value="SET_BAR_MAX">{t("effect.setNumericField")}</option></Select>
      <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} className={selectClass}><option value="number">{t("effect.sourceNumber")}</option><option value="node">{t("effect.sourceNode")}</option><option value="formula">{t("effect.sourceFormula")}</option></select>
      {sourceKind === "number" ? <Input name="sourceValue" type="number" step="any" required placeholder={t("common.value")} /> : sourceKind === "node" ? <Select name="sourceNodeId">{options}</Select> : <div className="grid grid-cols-[1fr_auto_100px] gap-2"><Select name="formulaNodeId">{options}</Select><Select name="formulaOperator"><option value="add">+</option><option value="subtract">-</option><option value="multiply">x</option><option value="divide">/</option></Select><Input name="formulaValue" type="number" step="any" required /></div>}
      <EffectConditionBuilder nodes={numeric} />
      {error && <p className="text-sm text-destructive">{error}</p>}<Button disabled={pending}><Plus className="h-4 w-4" />{pending ? t("effect.checking") : t("effect.addEffect")}</Button>
    </form>
  );
}
const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
function Select({ name, placeholder, children }: { name: string; placeholder?: string; children: React.ReactNode }) { return <select name={name} required className={selectClass}>{placeholder && <option value="">{placeholder}</option>}{children}</select>; }
