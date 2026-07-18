import { prisma } from "@/lib/prisma";
import { buildImpactSnapshot, type CharacterImpactSnapshot } from "@/domain/character-impact";
import { DependencyEngine } from "@/engine/dependency-engine";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";

export async function getCharacterImpactSnapshot(characterId: string): Promise<CharacterImpactSnapshot> {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: {
      rootNodes: {
        where: { archivedAt: null },
        orderBy: [{ parentId: "asc" }, { order: "asc" }],
      },
      effects: {
        orderBy: { priority: "asc" },
      },
    },
  });
  const nodes = parseCharacterNodeModels(character.rootNodes).nodes;
  const effects = parseEffectDefinitions(character.effects).effects;
  const engineResult = new DependencyEngine(nodes, effects).evaluate();
  return buildImpactSnapshot(nodes, [...engineResult.calculations.values()], engineResult.edges);
}
