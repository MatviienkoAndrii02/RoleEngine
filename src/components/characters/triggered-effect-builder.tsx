"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EffectConditionBuilder, readEffectCondition } from "@/components/characters/effect-condition-builder";
import { EffectEditorSection } from "@/components/characters/effect-editor-section";
import { EffectPreview } from "@/components/characters/effect-preview";
import { conditionExpressionSummary, nodeSummary, triggeredActionSummary } from "@/components/characters/effect-summary";
import { NodePicker } from "@/components/characters/node-picker";
import { clearFormDraft, stringDraftValue, useFormDraft, type FormDraftValues } from "@/components/forms/use-form-draft";
import {
  newTriggeredActionRow,
  readTriggeredAction,
  TriggeredActionEditor,
  type TriggeredActionRow,
} from "@/components/characters/triggered-action-editor";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { useCharacterUiStore } from "@/store/character-ui-store";

type TriggeredEffectBuilderProps =
  | { characterId: string; templateId?: never; nodes: CharacterNodeModel[]; slots?: never }
  | { templateId: string; characterId?: never; nodes: CharacterNodeModel[]; slots?: TemplateSlotModel[] };

type TriggerKind = "condition" | "nodeClick";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function TriggeredEffectBuilder({ characterId, templateId, nodes, slots = [] }: TriggeredEffectBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const trackImpact = useCharacterUiStore((state) => state.trackImpact);
  const endpoint = characterId ? `/api/characters/${characterId}/effects` : `/api/templates/${templateId}/effects`;
  const draftKey = `effect:triggered:${characterId ? `character:${characterId}` : `template:${templateId}`}`;
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
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const { restored, clearDraft, formDraftProps } = useFormDraft({
    draftKey,
    formRef,
    enabled: !pending,
    onRestore: (values) => {
      setTriggerKind(readDraftTriggerKind(values, "triggerKind", "condition"));
      setTriggerNodeId(stringDraftValue(values, "triggerNodeId"));
      const restoredRows = readDraftActionRows(values);
      if (restoredRows.length > 0) setRows(restoredRows);
    },
  });
  const [preview, setPreview] = useState<{ condition: string; actions: string[]; warnings: string[] }>(() => ({
    condition: t("effect.conditionAlways"),
    actions: [t("effect.actionsCount", { count: 1 })],
    warnings: [],
  }));
  const triggerError = validationAttempted && triggerKind === "nodeClick" && !triggerNodeId ? t("effect.inlineTriggerNodeRequired") : undefined;
  const actionError = validationAttempted && rows.some((row) => actionRequiresTarget(row) && !row.targetNodeId) ? t("effect.inlineTargetRequired") : undefined;

  useEffect(() => {
    refreshPreview();
  }, [triggerKind, triggerNodeId, rows, formKey]);

  function refreshPreview() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const triggerCondition = readEffectCondition(data, "trigger");
    const triggerNode = nodeSummary(nodes, String(data.get("triggerNodeId") ?? triggerNodeId), slots);
    const condition = triggerKind === "nodeClick"
      ? `${t("effect.triggerNodeClick")}: ${triggerNode || t("effect.previewSelectTarget")}\n${conditionExpressionSummary(triggerCondition, numericNodes, numericSlots, t)}`
      : conditionExpressionSummary(triggerCondition, numericNodes, numericSlots, t);
    const rootLabel = templateId ? t("common.rootTemplate") : t("common.rootCharacter");
    const actions = rows.map((row, index) => {
      try {
        return `${index + 1}. ${triggeredActionSummary(readTriggeredAction(row, data, index, nodes, "action"), nodes, slots, t, rootLabel)}`;
      } catch {
        return `${index + 1}. ${triggeredActionKindLabel(row.kind, t)}`;
      }
    });
    setPreview({
      condition,
      actions,
      warnings: triggerKind === "nodeClick" && !String(data.get("triggerNodeId") ?? triggerNodeId) ? [t("effect.inlineTriggerNodeRequired")] : [],
    });
  }

  async function submit(data: FormData) {
    setValidationAttempted(true);
    setPending(true);
    setError(null);
    const triggerCondition = readEffectCondition(data, "trigger");
    const response = await trackImpact(characterId, t("impact.effectCreated"), () =>
      fetch(endpoint, {
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
      })
    );
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "effect.saveFailed"));
      return;
    }
    clearFormDraft(draftKey);
    setTriggerKind("condition");
    setTriggerNodeId("");
    setRows([newTriggeredActionRow()]);
    setValidationAttempted(false);
    setFormKey((current) => current + 1);
    router.refresh();
  }

  return (
    <form key={formKey} ref={formRef} action={submit} onSubmitCapture={() => setValidationAttempted(true)} onInvalidCapture={() => setValidationAttempted(true)} className="space-y-4" {...formDraftProps}>
      {restored && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary">
          <span>{t("draft.restored")}</span>
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={clearDraft}>
            {t("draft.discard")}
          </button>
        </div>
      )}
      <Input name="name" required placeholder={t("effect.name")} />
      <EffectEditorSection title={t("effect.trigger")} summary={triggerKind === "nodeClick" ? t("effect.triggerNodeClick") : t("effect.triggerCondition")} error={triggerError}>
        <select name="triggerKind" value={triggerKind} onChange={(event) => setTriggerKind(event.target.value as TriggerKind)} className={selectClass}>
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
        <EffectConditionBuilder nodes={numericNodes} slots={numericSlots} prefix="trigger" onConditionChange={refreshPreview} />
      </EffectEditorSection>
      <EffectEditorSection title={t("effect.triggerActions")} summary={t("effect.actionsCount", { count: rows.length })} error={actionError}>
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
            showValidationErrors={validationAttempted}
          />
        ))}
      </EffectEditorSection>
      <EffectPreview condition={preview.condition} actions={preview.actions} warnings={validationAttempted ? preview.warnings : []} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending}><Plus className="h-4 w-4" />{pending ? t("effect.checking") : t("effect.addTriggeredEffect")}</Button>
    </form>
  );
}

function triggeredActionKindLabel(kind: TriggeredActionRow["kind"], t: ReturnType<typeof useI18n>["t"]) {
  if (kind === "CREATE_NODE") return t("effect.createNode");
  if (kind === "CREATE_GROUP") return t("effect.createGroup");
  if (kind === "PATCH_NODE_PROPS") return t("effect.patchNode");
  return t("effect.setNumericField");
}

function actionRequiresTarget(row: TriggeredActionRow) {
  return row.kind === "NUMERIC" || row.kind === "PATCH_NODE_PROPS";
}

function readDraftTriggerKind(values: FormDraftValues, name: string, fallback: TriggerKind): TriggerKind {
  const value = stringDraftValue(values, name);
  return value === "condition" || value === "nodeClick" ? value : fallback;
}

function readDraftActionRows(values: FormDraftValues): TriggeredActionRow[] {
  const indexes = Object.keys(values)
    .map((key) => /^action-(\d+)-kind$/.exec(key)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
  return indexes.map((index) => {
    const kind = readDraftActionKind(values, `action-${index}-kind`);
    return {
      id: newTriggeredActionRow().id,
      kind,
      sourceKind: readDraftSourceKind(values, `action-${index}-sourceKind`, "number"),
      targetNodeId: readDraftActionTarget(values, index, kind),
      createdType: readDraftNodeType(values, `action-${index}-createdType`, "NUMBER"),
      patchField: stringDraftValue(values, `action-${index}-patchField`),
    };
  });
}

function readDraftActionKind(values: FormDraftValues, name: string): TriggeredActionRow["kind"] {
  const value = stringDraftValue(values, name);
  return value === "CREATE_NODE" || value === "CREATE_GROUP" || value === "PATCH_NODE_PROPS" || value === "NUMERIC" ? value : "NUMERIC";
}

function readDraftActionTarget(values: FormDraftValues, index: number, kind: TriggeredActionRow["kind"]) {
  if (kind === "PATCH_NODE_PROPS") return stringDraftValue(values, `action-${index}-patchTargetNodeId`);
  if (kind === "CREATE_NODE" || kind === "CREATE_GROUP") return stringDraftValue(values, `action-${index}-parentNodeId`);
  return stringDraftValue(values, `action-${index}-targetNodeId`);
}

function readDraftSourceKind(values: FormDraftValues, name: string, fallback: TriggeredActionRow["sourceKind"]): TriggeredActionRow["sourceKind"] {
  const value = stringDraftValue(values, name);
  return value === "node" || value === "formula" || value === "number" ? value : fallback;
}

function readDraftNodeType(values: FormDraftValues, name: string, fallback: TriggeredActionRow["createdType"]): TriggeredActionRow["createdType"] {
  const value = stringDraftValue(values, name);
  return value === "NUMBER" || value === "BAR" || value === "TEXT" || value === "TABLE" || value === "CONTAINER" || value === "GROUP" || value === "LINK" ? value : fallback;
}
