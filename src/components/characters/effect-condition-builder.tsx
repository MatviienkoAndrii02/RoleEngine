"use client";

import { useEffect, useMemo, useState } from "react";
import type { EffectCondition, EffectSource } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { conditionExpressionSummary } from "@/components/characters/effect-summary";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export function EffectConditionBuilder({
  nodes,
  slots = [],
  prefix = "condition",
  condition,
  allowCurrent = false,
  onConditionChange,
  showValidationErrors = false,
}: {
  nodes: CharacterNodeModel[];
  slots?: TemplateSlotModel[];
  prefix?: string;
  condition?: EffectCondition;
  allowCurrent?: boolean;
  onConditionChange?: () => void;
  showValidationErrors?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EffectCondition>(() => condition ?? { kind: "always" });
  const slotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const summary = useMemo(() => conditionExpressionSummary(draft, nodes, slots, t), [draft, nodes, slots, t]);
  const validationErrors = showValidationErrors ? validateEffectCondition(draft, t) : [];

  useEffect(() => {
    notifyConditionChange(onConditionChange);
  }, [draft, onConditionChange]);

  return (
    <div className="space-y-2">
      <input type="hidden" name={`${prefix}Json`} value={JSON.stringify(draft)} />
      <div className={`rounded-md border bg-muted/20 p-3 ${validationErrors.length ? "border-destructive" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">{t("effect.condition")}</div>
            <div className="mt-1 line-clamp-2 break-words text-sm">{summary}</div>
            {validationErrors.length > 0 && <ValidationMessage message={validationErrors[0]} />}
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
            {t("effect.editCondition")}
          </Button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,520px)] max-w-full p-3 pointer-events-none">
          <div className="flex min-h-0 w-full flex-col rounded-md border bg-card shadow-lg pointer-events-auto">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <h3 className="font-medium">{t("effect.conditionBuilder")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.close")}</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <RecursiveConditionEditor
                condition={draft}
                nodes={nodes}
                slotOptions={slotOptions}
                slots={slots}
                onChange={setDraft}
                showValidationErrors={showValidationErrors}
              />
            </div>
            <div className="flex justify-between gap-2 border-t p-4">
              <Button type="button" variant="ghost" onClick={() => setDraft({ kind: "always" })}>
                {t("effect.clearCondition")}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("common.done")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function readEffectCondition(data: FormData, prefix = "condition", current?: EffectCondition): EffectCondition {
  const json = data.get(`${prefix}Json`);
  if (typeof json === "string" && json) {
    const parsed = parseConditionJson(json);
    if (parsed) return parsed;
  }
  const join = String(data.get(`${prefix}Join`) ?? "single");
  if (join === "current" && current) return current;
  const first = readConditionLeaf(data, `${prefix}First`);
  if (join === "not") return { kind: "not", condition: first };
  if (join === "and" || join === "or") {
    return { kind: join, conditions: [first, readConditionLeaf(data, `${prefix}Second`)] };
  }
  return first;
}

export function validateEffectCondition(condition: EffectCondition, t: ReturnType<typeof useI18n>["t"]): string[] {
  if (condition.kind === "always") return [];
  if (condition.kind === "fieldExists") return condition.nodeId ? [] : [t("effect.inlineNodeRequired")];
  if (condition.kind === "slotExists") return condition.slotId ? [] : [t("effect.inlineNodeRequired")];
  if (condition.kind === "compare") {
    return [
      ...(condition.nodeId ? [] : [t("effect.inlineNodeRequired")]),
      ...validateEffectSourceReference(condition.value, t),
    ];
  }
  if (condition.kind === "compareSlot") {
    return [
      ...(condition.slotId ? [] : [t("effect.inlineNodeRequired")]),
      ...validateEffectSourceReference(condition.value, t),
    ];
  }
  if (condition.kind === "not") return validateEffectCondition(condition.condition, t);
  if (condition.kind === "and" || condition.kind === "or") {
    if (!condition.conditions.length) return [t("effect.inlineConditionRequired")];
    return condition.conditions.flatMap((child) => validateEffectCondition(child, t));
  }
  return [];
}

function ConditionKind({ name, value, onChange }: { name?: string; value: string; onChange: (value: string) => void }) {
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
  condition,
  onConditionChange,
}: {
  kind: string;
  prefix: string;
  nodes: CharacterNodeModel[];
  slotOptions: Array<{ value: string; label: string }>;
  condition?: EffectCondition;
  onConditionChange?: () => void;
}) {
  const { t } = useI18n();
  const [valueKind, setValueKind] = useState<"number" | "node">(conditionValueKind(condition));
  if (kind === "always") return null;
  return (
    <div className="space-y-2">
      <NodePicker name={`${prefix}NodeId`} nodes={nodes} extraOptions={slotOptions} allowedTypes={["NUMBER", "BAR"]} required defaultValue={conditionNodeValue(condition)} onChange={() => notifyConditionChange(onConditionChange)} placeholder={t("effect.selectNode")} compact />
      {kind !== "exists" && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          <select name={`${prefix}ValueKind`} value={valueKind} onChange={(event) => { setValueKind(event.target.value as "number" | "node"); notifyConditionChange(onConditionChange); }} className={selectClass}>
            <option value="number">{t("effect.sourceNumber")}</option>
            <option value="node">{t("effect.sourceNode")}</option>
          </select>
          {valueKind === "number" ? (
            <Input name={`${prefix}Value`} type="number" step="any" required defaultValue={conditionNumberValue(condition)} onInput={() => notifyConditionChange(onConditionChange)} placeholder={t("common.value")} />
          ) : (
            <div className="space-y-2">
              <NodePicker name={`${prefix}ValueNodeId`} nodes={nodes} extraOptions={slotOptions} allowedTypes={["NUMBER", "BAR"]} required defaultValue={conditionSourceNodeValue(condition)} onChange={() => notifyConditionChange(onConditionChange)} placeholder={t("effect.selectNode")} compact />
              <select name={`${prefix}ValueField`} defaultValue={conditionSourceField(condition)} onChange={() => notifyConditionChange(onConditionChange)} className={selectClass}>
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

function initialJoin(condition: EffectCondition | undefined, allowCurrent: boolean) {
  if (!condition) return "single";
  if (!isEditableCondition(condition) && allowCurrent) return "current";
  if (condition.kind === "and" || condition.kind === "or" || condition.kind === "not") return condition.kind;
  return "single";
}

function firstCondition(condition: EffectCondition | undefined): EffectCondition | undefined {
  if (!condition) return undefined;
  if (condition.kind === "and" || condition.kind === "or") return condition.conditions[0];
  if (condition.kind === "not") return condition.condition;
  return condition;
}

function secondCondition(condition: EffectCondition | undefined): EffectCondition | undefined {
  if (condition?.kind === "and" || condition?.kind === "or") return condition.conditions[1];
  return undefined;
}

function conditionKind(condition: EffectCondition | undefined) {
  if (!condition) return "always";
  if (condition.kind === "always") return "always";
  if (condition.kind === "fieldExists" || condition.kind === "slotExists") return "exists";
  if (condition.kind === "compare" || condition.kind === "compareSlot") return condition.operator;
  return "always";
}

function conditionNodeValue(condition: EffectCondition | undefined) {
  if (condition?.kind === "slotExists") return `slot:${condition.slotId}`;
  if (condition?.kind === "fieldExists") return condition.nodeId;
  if (condition?.kind === "compareSlot") return `slot:${condition.slotId}`;
  if (condition?.kind === "compare") return condition.nodeId;
  return "";
}

function conditionValueKind(condition: EffectCondition | undefined): "number" | "node" {
  const source = compareSource(condition);
  if (!source) return "number";
  return source.kind === "number" ? "number" : "node";
}

function conditionNumberValue(condition: EffectCondition | undefined) {
  const source = compareSource(condition);
  return source?.kind === "number" ? source.value : undefined;
}

function conditionSourceNodeValue(condition: EffectCondition | undefined) {
  const source = compareSource(condition);
  if (source?.kind === "templateSlot") return `slot:${source.slotId}`;
  if (source?.kind === "node") return source.nodeId;
  return "";
}

function conditionSourceField(condition: EffectCondition | undefined) {
  const source = compareSource(condition);
  if (source?.kind === "templateSlot" || source?.kind === "node") return source.field ?? "value";
  return "value";
}

function compareSource(condition: EffectCondition | undefined) {
  if (condition?.kind === "compare" || condition?.kind === "compareSlot") return condition.value;
  return null;
}

function isEditableCondition(condition: EffectCondition): boolean {
  if (condition.kind === "always" || condition.kind === "fieldExists" || condition.kind === "slotExists") return true;
  if (condition.kind === "compare" || condition.kind === "compareSlot") return condition.value.kind === "number" || condition.value.kind === "node" || condition.value.kind === "templateSlot";
  if (condition.kind === "not") return isEditableCondition(condition.condition);
  if (condition.kind === "and" || condition.kind === "or") return condition.conditions.length <= 2 && condition.conditions.every(isEditableCondition);
  return false;
}

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

function parseConditionJson(value: string): EffectCondition | null {
  try {
    return normalizeCondition(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function normalizeCondition(value: unknown): EffectCondition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "always") return { kind: "always" };
  if (record.kind === "fieldExists" && typeof record.nodeId === "string") return { kind: "fieldExists", nodeId: record.nodeId };
  if (record.kind === "slotExists" && typeof record.slotId === "string") return { kind: "slotExists", slotId: record.slotId };
  if (record.kind === "compare" && typeof record.nodeId === "string" && isOperator(record.operator)) {
    return { kind: "compare", nodeId: record.nodeId, operator: record.operator, value: normalizeSource(record.value) };
  }
  if (record.kind === "compareSlot" && typeof record.slotId === "string" && isOperator(record.operator)) {
    return { kind: "compareSlot", slotId: record.slotId, operator: record.operator, value: normalizeSource(record.value) };
  }
  if ((record.kind === "and" || record.kind === "or") && Array.isArray(record.conditions)) {
    const conditions = record.conditions.map(normalizeCondition).filter((item): item is EffectCondition => Boolean(item));
    return { kind: record.kind, conditions: conditions.length ? conditions : [{ kind: "always" }] };
  }
  if (record.kind === "not") {
    return { kind: "not", condition: normalizeCondition(record.condition) ?? { kind: "always" } };
  }
  return null;
}

function normalizeSource(value: unknown): EffectSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "number", value: 0 };
  const record = value as Record<string, unknown>;
  if (record.kind === "number") return { kind: "number", value: typeof record.value === "number" ? record.value : Number(record.value ?? 0) };
  if (record.kind === "node" && typeof record.nodeId === "string") return { kind: "node", nodeId: record.nodeId, field: isNumericField(record.field) ? record.field : "value" };
  if (record.kind === "templateSlot" && typeof record.slotId === "string") return { kind: "templateSlot", slotId: record.slotId, field: isNumericField(record.field) ? record.field : "value" };
  return { kind: "number", value: 0 };
}

function makeLeafCondition(kind: string, previous?: EffectCondition): EffectCondition {
  const nodeValue = conditionNodeValue(previous);
  const source = compareSource(previous) ?? { kind: "number" as const, value: 0 };
  if (kind === "always") return { kind: "always" };
  const parsed = parseTemplateSelectValue(nodeValue);
  if (kind === "exists") return parsed.kind === "slot" ? { kind: "slotExists", slotId: parsed.id } : { kind: "fieldExists", nodeId: parsed.id };
  const operator = isOperator(kind) ? kind : "gt";
  return parsed.kind === "slot"
    ? { kind: "compareSlot", slotId: parsed.id, operator, value: source }
    : { kind: "compare", nodeId: parsed.id, operator, value: source };
}

function convertConditionKind(condition: EffectCondition, kind: string): EffectCondition {
  if (kind === "not") return { kind: "not", condition: conditionChildren(condition)[0] ?? makeLeafCondition("compare") };
  if (kind === "and" || kind === "or") {
    const children = conditionChildren(condition);
    return { kind, conditions: children.length >= 2 ? children : [...children, makeLeafCondition("compare")] };
  }
  return makeLeafCondition(kind, condition);
}

function conditionChildren(condition: EffectCondition): EffectCondition[] {
  if (condition.kind === "and" || condition.kind === "or") return condition.conditions;
  if (condition.kind === "not") return [condition.condition];
  return [];
}

function replaceConditionChild(condition: EffectCondition, index: number, child: EffectCondition): EffectCondition {
  if (condition.kind === "not") return { kind: "not", condition: child };
  if (condition.kind === "and" || condition.kind === "or") {
    return { ...condition, conditions: condition.conditions.map((item, itemIndex) => itemIndex === index ? child : item) };
  }
  return condition;
}

function removeConditionChild(condition: EffectCondition, index: number): EffectCondition {
  if (condition.kind !== "and" && condition.kind !== "or") return condition;
  const next = condition.conditions.filter((_, itemIndex) => itemIndex !== index);
  return next.length === 1 ? next[0] : { ...condition, conditions: next.length ? next : [makeLeafCondition("compare")] };
}

function updateLeafNode(condition: EffectCondition, value: string): EffectCondition {
  const kind = conditionKind(condition);
  const parsed = parseTemplateSelectValue(value);
  if (kind === "exists") return parsed.kind === "slot" ? { kind: "slotExists", slotId: parsed.id } : { kind: "fieldExists", nodeId: parsed.id };
  const source = compareSource(condition) ?? { kind: "number" as const, value: 0 };
  const operator = condition.kind === "compare" || condition.kind === "compareSlot" ? condition.operator : "gt";
  return parsed.kind === "slot"
    ? { kind: "compareSlot", slotId: parsed.id, operator, value: source }
    : { kind: "compare", nodeId: parsed.id, operator, value: source };
}

function updateLeafValueKind(condition: EffectCondition, kind: "number" | "node"): EffectCondition {
  return updateLeafCompareSource(condition, kind === "number" ? { kind: "number", value: 0 } : sourceFromNodeValue("", "value"));
}

function updateLeafCompareSource(condition: EffectCondition, source: EffectSource): EffectCondition {
  if (condition.kind === "compare") return { ...condition, value: source };
  if (condition.kind === "compareSlot") return { ...condition, value: source };
  return updateLeafCompareSource(makeLeafCondition("gt", condition), source);
}

function sourceFromNodeValue(value: string, field: "value" | "current" | "min" | "max"): EffectSource {
  const parsed = parseTemplateSelectValue(value);
  return parsed.kind === "slot" ? { kind: "templateSlot", slotId: parsed.id, field } : { kind: "node", nodeId: parsed.id, field };
}

function isOperator(value: unknown): value is "gt" | "lt" | "eq" {
  return value === "gt" || value === "lt" || value === "eq";
}

function isNumericField(value: unknown): value is "value" | "current" | "min" | "max" {
  return value === "value" || value === "current" || value === "min" || value === "max";
}

function RecursiveConditionEditor({
  condition,
  nodes,
  slotOptions,
  slots,
  onChange,
  showValidationErrors,
  depth = 0,
}: {
  condition: EffectCondition;
  nodes: CharacterNodeModel[];
  slotOptions: Array<{ value: string; label: string }>;
  slots: TemplateSlotModel[];
  onChange: (condition: EffectCondition) => void;
  showValidationErrors: boolean;
  depth?: number;
}) {
  const { t } = useI18n();
  const groupKind = condition.kind === "and" || condition.kind === "or" || condition.kind === "not" ? condition.kind : "";
  const children = conditionChildren(condition);

  if (condition.kind === "and" || condition.kind === "or" || condition.kind === "not") {
    return (
      <div className="space-y-3 rounded-md border bg-background p-3" style={{ marginLeft: depth ? 12 : 0 }}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={groupKind} onChange={(event) => onChange(convertConditionKind(condition, event.target.value))} className={selectClass}>
            <option value="and">{t("effect.conditionAnd")}</option>
            <option value="or">{t("effect.conditionOr")}</option>
            <option value="not">{t("effect.conditionNot")}</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(makeLeafCondition("compare"))}>
            {t("effect.convertToCondition")}
          </Button>
        </div>
        <div className="space-y-2 border-l-2 border-primary/30 pl-3">
          {children.map((child, index) => (
            <div key={index} className="space-y-2">
              <RecursiveConditionEditor
                condition={child}
                nodes={nodes}
                slotOptions={slotOptions}
                slots={slots}
                depth={depth + 1}
                onChange={(next) => onChange(replaceConditionChild(condition, index, next))}
                showValidationErrors={showValidationErrors}
              />
              {(condition.kind === "and" || condition.kind === "or") && condition.conditions.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(removeConditionChild(condition, index))}>
                  {t("common.delete")}
                </Button>
              )}
            </div>
          ))}
        </div>
        {(condition.kind === "and" || condition.kind === "or") && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...condition, conditions: [...condition.conditions, makeLeafCondition("compare")] })}>
              {t("effect.addCondition")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...condition, conditions: [...condition.conditions, { kind: "and", conditions: [makeLeafCondition("compare"), makeLeafCondition("compare")] }] })}>
              {t("effect.addConditionGroup")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3" style={{ marginLeft: depth ? 12 : 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <ConditionKind value={conditionKind(condition)} onChange={(value) => onChange(makeLeafCondition(value, condition))} />
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ kind: "and", conditions: [condition, makeLeafCondition("compare")] })}>
          {t("effect.wrapCondition")}
        </Button>
      </div>
      <ConditionLeafFields condition={condition} nodes={nodes} slotOptions={slotOptions} slots={slots} onChange={onChange} showValidationErrors={showValidationErrors} />
    </div>
  );
}

function ConditionLeafFields({
  condition,
  nodes,
  slotOptions,
  slots,
  onChange,
  showValidationErrors,
}: {
  condition: EffectCondition;
  nodes: CharacterNodeModel[];
  slotOptions: Array<{ value: string; label: string }>;
  slots: TemplateSlotModel[];
  onChange: (condition: EffectCondition) => void;
  showValidationErrors: boolean;
}) {
  const { t } = useI18n();
  const kind = conditionKind(condition);
  const valueKind = conditionValueKind(condition);
  const targetError = showValidationErrors && kind !== "always" && !conditionNodeValue(condition) ? t("effect.inlineNodeRequired") : undefined;
  const sourceError = showValidationErrors && kind !== "exists" ? firstSourceError(compareSource(condition), t) : undefined;
  if (kind === "always") return null;
  return (
    <div className="space-y-2">
      <NodePicker
        name="condition-builder-node"
        nodes={nodes}
        extraOptions={slotOptions}
        allowedTypes={["NUMBER", "BAR"]}
        value={conditionNodeValue(condition)}
        onChange={(value) => onChange(updateLeafNode(condition, value))}
        placeholder={t("effect.selectNode")}
        compact
      />
      {targetError && <ValidationMessage message={targetError} />}
      {kind !== "exists" && (
        <div className={`space-y-2 rounded-md border bg-muted/20 p-2 ${sourceError ? "border-destructive" : ""}`}>
          <select value={valueKind} onChange={(event) => onChange(updateLeafValueKind(condition, event.target.value as "number" | "node"))} className={selectClass}>
            <option value="number">{t("effect.sourceNumber")}</option>
            <option value="node">{t("effect.sourceNode")}</option>
          </select>
          {valueKind === "number" ? (
            <Input
              type="number"
              step="any"
              value={String(conditionNumberValue(condition) ?? "")}
              onChange={(event) => onChange(updateLeafCompareSource(condition, { kind: "number", value: Number(event.target.value) }))}
              placeholder={t("common.value")}
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
              <NodePicker
                name="condition-builder-value-node"
                nodes={nodes}
                extraOptions={slotOptions}
                allowedTypes={["NUMBER", "BAR"]}
                value={conditionSourceNodeValue(condition)}
                onChange={(value) => onChange(updateLeafCompareSource(condition, sourceFromNodeValue(value, conditionSourceField(condition))))}
                placeholder={t("effect.selectNode")}
                compact
              />
              <select value={conditionSourceField(condition)} onChange={(event) => onChange(updateLeafCompareSource(condition, sourceFromNodeValue(conditionSourceNodeValue(condition), event.target.value as "value" | "min" | "max")))} className={selectClass}>
                {numericFields.map((field) => <option key={field} value={field}>{fieldLabel(field, t)}</option>)}
              </select>
            </div>
          )}
          {sourceError && <ValidationMessage message={sourceError} />}
        </div>
      )}
    </div>
  );
}

function validateEffectSourceReference(source: EffectSource, t: ReturnType<typeof useI18n>["t"]): string[] {
  if (source.kind === "node") return source.nodeId ? [] : [t("effect.inlineSourceNodeRequired")];
  if (source.kind === "templateSlot") return source.slotId ? [] : [t("effect.inlineSourceNodeRequired")];
  return [];
}

function firstSourceError(source: EffectSource | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!source) return undefined;
  return validateEffectSourceReference(source, t)[0];
}

function ValidationMessage({ message }: { message: string }) {
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function notifyConditionChange(callback: (() => void) | undefined) {
  if (!callback) return;
  window.setTimeout(callback, 0);
}
