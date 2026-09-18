"use client";

import { useMemo, useState } from "react";
import type { FormulaExpression } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formulaSummary } from "@/components/characters/effect-summary";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

type NumericField = "value" | "current" | "min" | "max";
type BinaryOperator = "add" | "subtract" | "multiply" | "divide";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const selectableNumericFields: NumericField[] = ["value", "min", "max"];
const operators: BinaryOperator[] = ["add", "subtract", "multiply", "divide"];

export function FormulaSourceFields({
  nodes,
  slots = [],
  prefix = "formula",
  defaultExpression,
}: {
  nodes: CharacterNodeModel[];
  slots?: TemplateSlotModel[];
  prefix?: string;
  defaultExpression?: FormulaExpression | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState<FormulaExpression>(() => defaultExpression ?? defaultFormula());
  const slotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));
  const summary = useMemo(() => formulaSummary(expression, nodes, slots, t), [expression, nodes, slots, t]);

  return (
    <div className="space-y-2">
      <input type="hidden" name={`${prefix}Json`} value={JSON.stringify(expression)} />
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">{t("effect.sourceFormula")}</div>
            <div className="mt-1 line-clamp-2 break-words text-sm">{summary}</div>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
            {t("effect.editFormula")}
          </Button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,520px)] max-w-full p-3 pointer-events-none">
          <div className="flex min-h-0 w-full flex-col rounded-md border bg-card shadow-lg pointer-events-auto">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <h3 className="font-medium">{t("effect.formulaBuilder")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.close")}</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <FormulaExpressionEditor
                expression={expression}
                nodes={nodes}
                slots={slots}
                slotOptions={slotOptions}
                onChange={setExpression}
              />
            </div>
            <div className="flex justify-between gap-2 border-t p-4">
              <Button type="button" variant="ghost" onClick={() => setExpression(defaultFormula())}>
                {t("effect.clearFormula")}
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

export function readFormulaExpression(data: FormData, prefix = "formula"): FormulaExpression {
  const json = data.get(`${prefix}Json`);
  if (typeof json === "string" && json) {
    const parsed = parseFormulaJson(json);
    if (parsed) return parsed;
  }
  return {
    kind: readOperator(String(data.get(`${prefix}Operator`) || "multiply")),
    left: readFormulaOperand(data, `${prefix}Left`),
    right: readFormulaOperand(data, `${prefix}Right`),
  };
}

function FormulaExpressionEditor({
  expression,
  nodes,
  slots,
  slotOptions,
  onChange,
  depth = 0,
}: {
  expression: FormulaExpression;
  nodes: CharacterNodeModel[];
  slots: TemplateSlotModel[];
  slotOptions: Array<{ value: string; label: string }>;
  onChange: (expression: FormulaExpression) => void;
  depth?: number;
}) {
  const { t } = useI18n();
  const kind = expressionKind(expression);

  if (isBinaryFormula(expression)) {
    return (
      <div className="space-y-3 rounded-md border bg-background p-3" style={{ marginLeft: depth ? 12 : 0 }}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={expression.kind} onChange={(event) => onChange({ ...expression, kind: readOperator(event.target.value) })} className={selectClass}>
            {operators.map((operator) => <option key={operator} value={operator}>{operatorLabel(operator, t)}</option>)}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(defaultRefFormula())}>
            {t("effect.convertToOperand")}
          </Button>
        </div>
        <div className="space-y-2 border-l-2 border-primary/30 pl-3">
          <FormulaExpressionEditor expression={expression.left} nodes={nodes} slots={slots} slotOptions={slotOptions} depth={depth + 1} onChange={(left) => onChange({ ...expression, left })} />
          <FormulaExpressionEditor expression={expression.right} nodes={nodes} slots={slots} slotOptions={slotOptions} depth={depth + 1} onChange={(right) => onChange({ ...expression, right })} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3" style={{ marginLeft: depth ? 12 : 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(event) => onChange(convertOperandKind(expression, event.target.value))} className={selectClass}>
          <option value="number">{t("effect.number")}</option>
          <option value="node">{t("node.label")}</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ kind: "add", left: expression, right: { kind: "const", value: 0 } })}>
          {t("effect.wrapFormula")}
        </Button>
      </div>
      {kind === "number" ? (
        <Input
          type="number"
          step="any"
          value={expression.kind === "const" ? String(expression.value) : "0"}
          onChange={(event) => onChange({ kind: "const", value: Number(event.target.value) })}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
          <NodePicker
            name="formula-builder-node"
            nodes={nodes}
            extraOptions={slotOptions}
            allowedTypes={["NUMBER", "BAR"]}
            value={operandNodeValue(expression)}
            onChange={(value) => onChange(refFromNodeValue(value, operandField(expression)))}
            placeholder={t("effect.selectNode")}
            compact
          />
          <select value={operandField(expression)} onChange={(event) => onChange(refFromNodeValue(operandNodeValue(expression), event.target.value as NumericField))} className={selectClass}>
            {selectableNumericFields.map((field) => <option key={field} value={field}>{fieldLabel(field, t)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function readFormulaOperand(data: FormData, prefix: string): FormulaExpression {
  const kind = String(data.get(`${prefix}Kind`) || "number");
  if (kind === "number") return { kind: "const", value: Number(data.get(`${prefix}Value`)) };
  const value = String(data.get(`${prefix}NodeId`) ?? "");
  const field = String(data.get(`${prefix}Field`) || "value") as NumericField;
  return refFromNodeValue(value, field);
}

function parseFormulaJson(value: string): FormulaExpression | null {
  try {
    return normalizeFormula(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function normalizeFormula(value: unknown): FormulaExpression | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "const") return { kind: "const", value: typeof record.value === "number" ? record.value : Number(record.value ?? 0) };
  if (record.kind === "ref" && typeof record.nodeId === "string") return { kind: "ref", nodeId: record.nodeId, field: isNumericField(record.field) ? record.field : "value" };
  if (record.kind === "slotRef" && typeof record.slotId === "string") return { kind: "slotRef", slotId: record.slotId, field: isNumericField(record.field) ? record.field : "value" };
  if (isBinaryOperator(record.kind)) {
    return {
      kind: record.kind,
      left: normalizeFormula(record.left) ?? { kind: "const", value: 0 },
      right: normalizeFormula(record.right) ?? { kind: "const", value: 0 },
    };
  }
  return null;
}

function defaultFormula(): FormulaExpression {
  return { kind: "multiply", left: defaultRefFormula(), right: { kind: "const", value: 1 } };
}

function defaultRefFormula(): FormulaExpression {
  return { kind: "ref", nodeId: "", field: "value" };
}

function expressionKind(expression: FormulaExpression) {
  return expression.kind === "const" ? "number" : "node";
}

function convertOperandKind(expression: FormulaExpression, kind: string): FormulaExpression {
  if (kind === "number") return { kind: "const", value: expression.kind === "const" ? expression.value : 0 };
  return expression.kind === "ref" || expression.kind === "slotRef" ? expression : defaultRefFormula();
}

function isBinaryFormula(expression: FormulaExpression): expression is Extract<FormulaExpression, { kind: BinaryOperator }> {
  return isBinaryOperator(expression.kind);
}

function isBinaryOperator(value: unknown): value is BinaryOperator {
  return value === "add" || value === "subtract" || value === "multiply" || value === "divide";
}

function readOperator(value: string): BinaryOperator {
  return isBinaryOperator(value) ? value : "multiply";
}

function refFromNodeValue(value: string, field: NumericField): FormulaExpression {
  if (value.startsWith("slot:")) return { kind: "slotRef", slotId: value.slice("slot:".length), field };
  return { kind: "ref", nodeId: value, field };
}

function operandNodeValue(expression: FormulaExpression) {
  if (expression.kind === "slotRef") return `slot:${expression.slotId}`;
  if (expression.kind === "ref") return expression.nodeId;
  return "";
}

function operandField(expression: FormulaExpression): NumericField {
  if (expression.kind === "slotRef" || expression.kind === "ref") return expression.field ?? "value";
  return "value";
}

function operatorLabel(operator: BinaryOperator, t: ReturnType<typeof useI18n>["t"]) {
  if (operator === "add") return t("effect.operatorAdd");
  if (operator === "subtract") return t("effect.operatorSubtract");
  if (operator === "divide") return t("effect.operatorDivide");
  return t("effect.operatorMultiply");
}

function fieldLabel(field: NumericField, t: ReturnType<typeof useI18n>["t"]) {
  if (field === "current") return t("node.current");
  if (field === "min") return t("node.minimum");
  if (field === "max") return t("node.maximum");
  return t("common.value");
}

function isNumericField(value: unknown): value is NumericField {
  return value === "value" || value === "current" || value === "min" || value === "max";
}
