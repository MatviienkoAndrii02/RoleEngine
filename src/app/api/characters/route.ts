import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCharacter } from "@/server/actions/characters";
import { getActiveWorkspace, requireUser } from "@/server/authz";
import { createCharacterCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function GET() {
  try {
    const user = await requireUser();
    const activeWorkspace = await getActiveWorkspace(user.id);
    const characters = await prisma.character.findMany({
      where: {
        archivedAt: null,
        workspaceId: activeWorkspace?.id ?? "__no_workspace__",
        OR: [
          ...(activeWorkspace?.canWrite ? [{}] : []),
          {
            assignments: { some: { userId: user.id, canView: true } },
            workspace: { archivedAt: null, memberships: { some: { userId: user.id, role: "PLAYER" } } },
          },
        ],
      },
      include: { owner: true, _count: { select: { rootNodes: { where: { archivedAt: null } }, effects: true } } },
      orderBy: { updatedAt: "desc" }
    });

    return NextResponse.json(characters);
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const character = await createCharacter(await parseJson(request, createCharacterCommandSchema));
    return NextResponse.json(character, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
