import type { NodeType } from "@/domain/nodes";
import type { TranslationKey } from "@/i18n/translations";

export type PatchFieldKind = "number" | "text" | "boolean";

export type PatchFieldDefinition = {
  field: string;
  labelKey: TranslationKey;
  kind: PatchFieldKind;
  derived: boolean;
};

export function getPatchFields(type: NodeType): PatchFieldDefinition[] {
  return [...getNumericPatchFields(type), ...getStructuralPatchFields(type)];
}

export function getNumericPatchFields(type: NodeType): PatchFieldDefinition[] {
  if (type === "NUMBER") {
    return [
      { field: "value", labelKey: "common.value", kind: "number", derived: true },
      { field: "min", labelKey: "node.minimum", kind: "number", derived: true },
      { field: "max", labelKey: "node.maximum", kind: "number", derived: true },
    ];
  }

  if (type === "BAR") {
    return [
      { field: "current", labelKey: "node.current", kind: "number", derived: true },
      { field: "min", labelKey: "node.minimum", kind: "number", derived: true },
      { field: "max", labelKey: "node.maximum", kind: "number", derived: true },
    ];
  }

  return [];
}

export function getStructuralPatchFields(type: NodeType): PatchFieldDefinition[] {
  const common: PatchFieldDefinition[] = [
    { field: "description", labelKey: "common.description", kind: "text", derived: false },
    { field: "icon", labelKey: "icons.label", kind: "text", derived: false },
  ];

  if (type === "TEXT") {
    return [
      { field: "text", labelKey: "node.text", kind: "text", derived: false },
      ...common,
    ];
  }

  if (type === "CONTAINER") {
    return [
      { field: "collapsedByDefault", labelKey: "node.collapsedDefault", kind: "boolean", derived: false },
      ...common,
    ];
  }

  if (type === "GROUP") {
    return [
      { field: "color", labelKey: "node.groupColor", kind: "text", derived: false },
      ...common,
    ];
  }

  return common;
}
