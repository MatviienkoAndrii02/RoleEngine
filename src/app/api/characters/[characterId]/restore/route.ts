import { NextResponse } from "next/server";
import { restoreCharacter } from "@/server/actions/characters";
import { inputErrorResponse } from "@/server/api-validation";

export async function POST(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    return NextResponse.json(await restoreCharacter(characterId));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
