import type { NodeType } from "@/domain/nodes";

export type TemplateSlotDirection = "INPUT" | "OUTPUT" | "BIDIRECTIONAL";

export type TemplateSlotModel = {
  id: string;
  templateId: string;
  key: string;
  label: string;
  description: string | null;
  direction: TemplateSlotDirection;
  acceptedTypes: NodeType[];
  required: boolean;
};

export function parseAcceptedNodeTypes(value: unknown): NodeType[] {
  const allowed: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP", "LINK"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NodeType => typeof item === "string" && allowed.includes(item as NodeType));
}
