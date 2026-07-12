export function collectSubtreeIds<T extends { id: string; parentId: string | null }>(nodes: T[], rootId: string): string[] {
  const childrenByParent = new Map<string | null, string[]>();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenByParent.set(node.parentId, siblings);
  }

  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  return result;
}
