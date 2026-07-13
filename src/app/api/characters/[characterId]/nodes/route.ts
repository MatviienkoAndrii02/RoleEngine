import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReadCharacter } from "@/server/authz";
import { createCharacterNode } from "@/server/actions/characters";
import { createNodeCommandSchema } from "@/domain/validation";
import { removePlayerHiddenSubtrees } from "@/domain/node-visibility";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function GET(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const user = await canReadCharacter(characterId);
    const character = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { workspaceId: true },
    });
    const writableMembership = await prisma.workspaceMembership.findFirst({
      where: { workspaceId: character.workspaceId, userId: user.id, role: { in: ["OWNER", "GM"] } },
      select: { id: true },
    });
    const nodes = await prisma.characterNode.findMany({
      where: { characterId, archivedAt: null },
      orderBy: [{ parentId: "asc" }, { order: "asc" }]
    });

    return NextResponse.json(writableMembership ? nodes : removePlayerHiddenSubtrees(nodes));
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
