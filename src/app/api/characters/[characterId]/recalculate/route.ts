import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReadCharacter, requireCharacterGM } from "@/server/authz";
import { DependencyEngine } from "@/engine/dependency-engine";
import { recalculateCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";

export async function GET(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await canReadCharacter(characterId);
    return NextResponse.json(serializeResult(await calculate(characterId)));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await requireCharacterGM(characterId);
    const body = request.headers.get("content-length") === "0"
      ? {}
      : await parseJson(request, recalculateCommandSchema);
    const result = await calculate(characterId, body.changedNodeIds);

    if (result.cycles.length === 0) {
      await prisma.dependencyEdge.deleteMany({ where: { characterId } });
      await prisma.dependencyEdge.createMany({
        data: result.edges.map((edge) => ({ characterId, ...edge })),
        skipDuplicates: true
      });
    }

    return NextResponse.json(serializeResult(result));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

function serializeResult(result: Awaited<ReturnType<typeof calculate>>) {
  return {
    calculations: Object.fromEntries(result.calculations),
    edges: result.edges,
    cycles: result.cycles,
    createdNodeRequests: result.createdNodeRequests
    ,patchRequests: result.patchRequests,
    diagnostics: result.diagnostics,
  };
}

async function calculate(characterId: string, changedNodeIds?: string[]) {
  const [nodes, effects] = await Promise.all([
    prisma.characterNode.findMany({ where: { characterId, archivedAt: null }, orderBy: { order: "asc" } }),
    prisma.effect.findMany({ where: { characterId, enabled: true }, orderBy: { priority: "asc" } })
  ]);

  const parsedNodes = parseCharacterNodeModels(nodes);
  const parsedEffects = parseEffectDefinitions(effects);
  const engine = new DependencyEngine(parsedNodes.nodes, parsedEffects.effects);
  return {
    ...engine.evaluate(changedNodeIds),
    diagnostics: [...parsedNodes.diagnostics, ...parsedEffects.diagnostics],
  };
}
