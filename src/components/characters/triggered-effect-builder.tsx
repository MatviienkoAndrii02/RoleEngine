"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { NodePicker } from "@/components/characters/node-picker";
import {
  newTriggeredActionRow,
  readTriggeredAction,
  TriggeredActionEditor,
  type TriggeredActionRow,
} from "@/components/characters/triggered-action-editor";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type TriggeredEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

type TriggerKind = "condition" | "nodeClick";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function TriggeredEffectBuilder({ characterId, templateId, nodes, slots = [] }: TriggeredEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const numericNodes = nodes.filter((node) => node.type === "NUMBER" || node.type === "BAR");
  const containers = nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP");
  const numericSlots = slots.filter((slot) => slot.acceptedTypes.some((type) => type === "NUMBER" || type === "BAR"));
  const numericSlotOptions = numericSlots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const containerSlotOptions = slots
    .filter((slot) => slot.acceptedTypes.some((type) => type === "CONTAINER" || type === "GROUP"))
    .map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const allSlotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("condition");
  const [triggerNodeId, setTriggerNodeId] = useState("");
  const [rows, setRows] = useState<TriggeredActionRow[]>([newTriggeredActionRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);

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
        actions: rows.map((row, index) => readTriggeredAction(row, data, index, nodes, "action")),
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return;
    }
    setTriggerKind("condition");
    setTriggerNodeId("");
    setRows([newTriggeredActionRow()]);
    setFormKey((current) => current + 1);
    router.refresh();
  }

  return (
    <form key={formKey} action={submit} className="space-y-4">
      <Input name="name" required placeholder={t("effect.name")} />
      <EffectEditorSection title={t("effect.trigger")} summary={triggerKind === "nodeClick" ? t("effect.triggerNodeClick") : t("effect.triggerCondition")}>
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
        <EffectConditionBuilder nodes={numericNodes} slots={numericSlots} prefix="trigger" />
      </EffectEditorSection>
      <EffectEditorSection title={t("effect.triggerActions")} summary={t("effect.actionsCount", { count: rows.length })}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("effect.actionsCount", { count: rows.length })}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, newTriggeredActionRow()])}>
            <Plus className="h-4 w-4" />{t("effect.addAction")}
          </Button>
        </div>
        {rows.map((row, index) => (
          <TriggeredActionEditor
            key={row.id}
            row={row}
            index={index}
            rowsCount={rows.length}
            nodes={nodes}
            slots={slots}
            numericNodes={numericNodes}
            containers={containers}
            numericSlotOptions={numericSlotOptions}
            containerSlotOptions={containerSlotOptions}
            allSlotOptions={allSlotOptions}
            rootLabel={templateId ? t("common.rootTemplate") : t("common.rootCharacter")}
            fieldNamespace="action"
            setRows={setRows}
          />
        ))}
      </EffectEditorSection>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending}><Plus className="h-4 w-4" />{pending ? t("effect.checking") : t("effect.addTriggeredEffect")}</Button>
    </form>
  );
}
