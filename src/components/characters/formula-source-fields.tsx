"use client";

import { useState } from "react";
import type { FormulaExpression } from "@/domain/effects";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Input } from "@/components/ui/input";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";

type OperandKind = "number" | "node";
type NumericField = "value" | "current" | "min" | "max";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const selectableNumericFields: NumericField[] = ["value", "min", "max"];

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
  const [leftKind, setLeftKind] = useState<OperandKind>(initialOperandKind(defaultExpression, "left"));
  const [rightKind, setRightKind] = useState<OperandKind>(initialOperandKind(defaultExpression, "right"));
  const simple = defaultExpression && isBinaryFormula(defaultExpression) ? defaultExpression : null;
  const slotOptions = slots.map((slot) => ({ value: `slot:${slot.id}`, label: t("templateSlot.option", { label: slot.label }) }));

  return (
    <div className="space-y-2">
      <FormulaOperandFields
        prefix={`${prefix}Left`}
        kind={leftKind}
        setKind={setLeftKind}
        nodes={nodes}
        slotOptions={slotOptions}
        defaultOperand={simple?.left}
      />
      <select name={`${prefix}Operator`} defaultValue={simple?.kind ?? "multiply"} className={selectClass}>
        <option value="add">+</option>
        <option value="subtract">-</option>
        <option value="multiply">x</option>
        <option value="divide">/</option>
      </select>
      <FormulaOperandFields
        prefix={`${prefix}Right`}
        kind={rightKind}
        setKind={setRightKind}
        nodes={nodes}
        slotOptions={slotOptions}
        defaultOperand={simple?.right}
      />
    </div>
  );
}

function FormulaOperandFields({
  prefix,
  kind,
  setKind,
  nodes,
  slotOptions,
  defaultOperand,
}: {
  prefix: string;
  kind: OperandKind;
  setKind: (kind: OperandKind) => void;
  nodes: CharacterNodeModel[];
  slotOptions: Array<{ value: string; label: string }>;
  defaultOperand?: FormulaExpression;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <select name={`${prefix}Kind`} value={kind} onChange={(event) => setKind(event.target.value as OperandKind)} className={selectClass}>
        <option value="number">{t("effect.number")}</option>
        <option value="node">{t("node.label")}</option>
      </select>
      {kind === "number" ? (
        <div>
          <Input name={`${prefix}Value`} type="number" step="any" required defaultValue={defaultOperand?.kind === "const" ? defaultOperand.value : 0} />
        </div>
      ) : (
        <div className="space-y-2">
          <NodePicker
            name={`${prefix}NodeId`}
            nodes={nodes}
            extraOptions={slotOptions}
            allowedTypes={["NUMBER", "BAR"]}
            required
            defaultValue={operandNodeValue(defaultOperand)}
            placeholder={t("effect.selectNode")}
          />
          <select name={`${prefix}Field`} defaultValue={operandField(defaultOperand)} className={selectClass}>
            {selectableNumericFields.map((field) => <option key={field} value={field}>{fieldLabel(field, t)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export function readFormulaExpression(data: FormData, prefix = "formula"): FormulaExpression {
  return {
    kind: String(data.get(`${prefix}Operator`) || "multiply") as "add" | "subtract" | "multiply" | "divide",
    left: readFormulaOperand(data, `${prefix}Left`),
    right: readFormulaOperand(data, `${prefix}Right`),
  };
}

function readFormulaOperand(data: FormData, prefix: string): FormulaExpression {
  const kind = String(data.get(`${prefix}Kind`) || "number");
  if (kind === "number") return { kind: "const", value: Number(data.get(`${prefix}Value`)) };
  const value = String(data.get(`${prefix}NodeId`) ?? "");
  const field = String(data.get(`${prefix}Field`) || "value") as NumericField;
  if (value.startsWith("slot:")) return { kind: "slotRef", slotId: value.slice("slot:".length), field };
  return { kind: "ref", nodeId: value, field };
}

function initialOperandKind(expression: FormulaExpression | null | undefined, side: "left" | "right"): OperandKind {
  if (!expression || !isBinaryFormula(expression)) return side === "left" ? "node" : "number";
  return expression[side].kind === "const" ? "number" : "node";
}

function isBinaryFormula(expression: FormulaExpression): expression is Extract<FormulaExpression, { kind: "add" | "subtract" | "multiply" | "divide" }> {
  return expression.kind === "add" || expression.kind === "subtract" || expression.kind === "multiply" || expression.kind === "divide";
}

function operandNodeValue(expression: FormulaExpression | undefined) {
  if (!expression) return "";
  if (expression.kind === "slotRef") return `slot:${expression.slotId}`;
  if (expression.kind === "ref") return expression.nodeId;
  return "";
}

function operandField(expression: FormulaExpression | undefined): NumericField {
  if (expression?.kind === "slotRef" || expression?.kind === "ref") return expression.field ?? "value";
  return "value";
}

function fieldLabel(field: NumericField, t: ReturnType<typeof useI18n>["t"]) {
  if (field === "current") return t("node.current");
  if (field === "min") return t("node.minimum");
  if (field === "max") return t("node.maximum");
  return t("common.value");
}
