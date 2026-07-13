export type NodeVisibilityRecord = {
  id: string;
  parentId: string | null;
  data: unknown;
};

export function removePlayerHiddenSubtrees<T extends NodeVisibilityRecord>(nodes: T[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hiddenIds = new Set<string>();

  for (const node of nodes) {
    if (isHiddenFromPlayer(node.data) || hasHiddenAncestor(node, byId)) {
      hiddenIds.add(node.id);
    }
  }

  return nodes.filter((node) => !hiddenIds.has(node.id));
}

function hasHiddenAncestor<T extends NodeVisibilityRecord>(node: T, byId: Map<string, T>) {
  let parentId = node.parentId;
  const visited = new Set<string>();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return false;
    if (isHiddenFromPlayer(parent.data)) return true;
    parentId = parent.parentId;
  }

  return false;
}

function isHiddenFromPlayer(data: unknown) {
  return isRecord(data) && data.hiddenFromPlayer === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
