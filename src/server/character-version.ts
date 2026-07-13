import { prisma } from "@/lib/prisma";

export async function getCharacterVersion(characterId: string) {
  const character = await prisma.character.findFirstOrThrow({
    where: { id: characterId, archivedAt: null },
    select: { updatedAt: true },
  });
  const [nodeMax, effectMax, auditMax] = await Promise.all([
    prisma.characterNode.aggregate({
      where: { characterId },
      _max: { updatedAt: true },
    }),
    prisma.effect.aggregate({
      where: { characterId },
      _max: { updatedAt: true },
    }),
    prisma.auditLog.aggregate({
      where: { characterId },
      _max: { createdAt: true },
    }),
  ]);

  return latestDate([
    character.updatedAt,
    nodeMax._max.updatedAt,
    effectMax._max.updatedAt,
    auditMax._max.createdAt,
  ]).toISOString();
}

export function latestDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.reduce((latest, value) => value > latest ? value : latest, dates[0] ?? new Date(0));
}
