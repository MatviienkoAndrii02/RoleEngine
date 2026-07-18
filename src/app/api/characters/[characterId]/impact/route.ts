import { NextResponse } from "next/server";
import { canReadCharacter } from "@/server/authz";
import { getCharacterImpactSnapshot } from "@/server/character-impact";
import { inputErrorResponse } from "@/server/api-validation";

export async function GET(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await canReadCharacter(characterId);
    return NextResponse.json(await getCharacterImpactSnapshot(characterId));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
