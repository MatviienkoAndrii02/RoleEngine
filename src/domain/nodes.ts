export type NodeType = "NUMBER" | "BAR" | "TEXT" | "TABLE" | "CONTAINER" | "GROUP" | "LINK";

export const NODE_ICON_NAMES = [
  "circle",
  "folder",
  "table",
  "text",
  "heart",
  "shield",
  "swords",
  "backpack",
  "sparkles",
  "book",
  "user",
  "brain",
  "zap",
  "flame",
  "droplets",
  "package",
  "gem",
  "skull",
  "cog",
  "star",
  "link",
] as const;

export type NodeIconName = typeof NODE_ICON_NAMES[number];

export type NumberNodeData = {
  value: number;
  min?: number | null;
  max?: number | null;
  allowNegative?: boolean;
};

export type BarNodeData = {
  current: number;
  min?: number | null;
  max: number;
};

export type TextNodeData = {
  text: string;
};

export type TableColumnType = "number" | "text" | "boolean" | "bar";

export type TableNodeData = {
  columns: Array<{
    id: string;
    label: string;
    type: TableColumnType;
  }>;
  rows: Array<Record<string, unknown>>;
};

export type ContainerNodeData = object;

export type GroupNodeData = {
  color?: string;
};

export type LinkNodeData =
  | {
      targetKind: "node";
      targetNodeId: string;
      targetCharacterId?: never;
    }
  | {
      targetKind: "character";
      targetCharacterId: string;
      targetNodeId?: never;
    };

export type ResolvedNodeLink =
  | {
      kind: "node";
      nodeId: string;
      label: string;
      ancestorIds: string[];
      available: true;
    }
  | {
      kind: "character";
      characterId: string;
      label: string;
      href: string;
      available: true;
    }
  | {
      kind: "missing";
      label: string;
      available: false;
    };

type CommonNodePresentation = {
  description?: string;
  icon?: NodeIconName;
  collapsedByDefault?: boolean;
  hiddenFromPlayer?: boolean;
};

export type NodeData = (
  | NumberNodeData
  | BarNodeData
  | TextNodeData
  | TableNodeData
  | ContainerNodeData
  | GroupNodeData
  | LinkNodeData
) & CommonNodePresentation;

export type CharacterNodeModel = {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  path: string;
  order: number;
  data: NodeData;
  computed?: Record<string, unknown>;
  resolvedLink?: ResolvedNodeLink;
};

export type NodeTreeItem = CharacterNodeModel & {
  children: NodeTreeItem[];
};

export function buildNodeTree(nodes: CharacterNodeModel[]): NodeTreeItem[] {
  const byId = new Map<string, NodeTreeItem>();
  const roots: NodeTreeItem[] = [];

  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }

  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: NodeTreeItem[]) => {
    items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    items.forEach((item) => sortTree(item.children));
  };

  sortTree(roots);
  return roots;
}

export function readNumericValue(node: CharacterNodeModel | undefined | null): number | null {
  if (!node) return null;
  if (node.type === "NUMBER" && "value" in node.data) return node.data.value;
  if (node.type === "BAR" && "current" in node.data) return node.data.current;
  return null;
}
