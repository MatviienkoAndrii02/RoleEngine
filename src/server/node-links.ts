import type { CharacterNodeModel, LinkNodeData, ResolvedNodeLink } from "@/domain/nodes";
import { prisma } from "@/lib/prisma";

export async function resolveCharacterNodeLinks({
  nodes,
  userId,
  missingLabel,
}: {
  nodes: CharacterNodeModel[];
  userId: string;
  missingLabel: string;
}): Promise<CharacterNodeModel[]> {
  const characterIds = [...new Set(nodes
    .map((node) => readLinkData(node)?.targetKind === "character" ? readLinkData(node)?.targetCharacterId : null)
    .filter((id): id is string => Boolean(id)))];

  const accessibleCharacters = characterIds.length
    ? await prisma.character.findMany({
        where: {
          id: { in: characterIds },
          archivedAt: null,
          workspace: { archivedAt: null },
          OR: [
            { workspace: { memberships: { some: { userId, role: { in: ["OWNER", "GM"] } } } } },
            {
              assignments: { some: { userId, canView: true } },
              workspace: { memberships: { some: { userId, role: "PLAYER" } } },
            },
          ],
        },
        select: { id: true, name: true },
      })
    : [];

  const charactersById = new Map(accessibleCharacters.map((character) => [character.id, character]));
  return resolveLocalNodeLinks(nodes, missingLabel).map((node) => {
    const link = readLinkData(node);
    if (link?.targetKind !== "character") return node;
    const character = charactersById.get(link.targetCharacterId);
    return {
      ...node,
      resolvedLink: character
        ? { kind: "character", characterId: character.id, label: character.name, href: `/characters/${character.id}`, available: true }
        : missingLink(missingLabel),
    };
  });
}

export function resolveLocalNodeLinks(nodes: CharacterNodeModel[], missingLabel: string): CharacterNodeModel[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const link = readLinkData(node);
    if (link?.targetKind !== "node") return node;
    const target = nodesById.get(link.targetNodeId);
    return {
      ...node,
      resolvedLink: target
        ? { kind: "node", nodeId: target.id, label: target.name, ancestorIds: collectAncestorIds(target, nodesById), available: true }
        : missingLink(missingLabel),
    };
  });
}

function readLinkData(node: CharacterNodeModel): LinkNodeData | null {
  if (node.type !== "LINK") return null;
  if ("targetKind" in node.data && node.data.targetKind === "node" && "targetNodeId" in node.data && typeof node.data.targetNodeId === "string") {
    return { targetKind: "node", targetNodeId: node.data.targetNodeId };
  }
  if ("targetKind" in node.data && node.data.targetKind === "character" && "targetCharacterId" in node.data && typeof node.data.targetCharacterId === "string") {
    return { targetKind: "character", targetCharacterId: node.data.targetCharacterId };
  }
  return null;
}

function collectAncestorIds(node: CharacterNodeModel, nodesById: ReadonlyMap<string, CharacterNodeModel>) {
  const result: string[] = [];
  const visited = new Set<string>();
  let parentId = node.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    result.unshift(parentId);
    parentId = nodesById.get(parentId)?.parentId ?? null;
  }
  return result;
}

function missingLink(label: string): ResolvedNodeLink {
  return { kind: "missing", label, available: false };
}
