import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReadCharacter } from "@/server/authz";
import { createCharacterNode } from "@/server/actions/characters";
import { createNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function GET(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await canReadCharacter(characterId);
    const nodes = await prisma.characterNode.findMany({
      where: { characterId, archivedAt: null },
      orderBy: [{ parentId: "asc" }, { order: "asc" }]
    });

    return NextResponse.json(nodes);
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, createNodeCommandSchema);
    const node = await createCharacterNode({ ...body, characterId });
    return NextResponse.json(node, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
