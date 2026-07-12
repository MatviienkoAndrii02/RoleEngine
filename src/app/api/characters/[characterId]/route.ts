import { NextResponse } from "next/server";
import { archiveCharacter, updateCharacter } from "@/server/actions/characters";
import { updateCharacterCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, updateCharacterCommandSchema);
    return NextResponse.json(await updateCharacter({ characterId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await archiveCharacter(characterId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
