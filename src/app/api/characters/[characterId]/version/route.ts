import { NextResponse } from "next/server";
import { canReadCharacter } from "@/server/authz";
import { getCharacterVersion } from "@/server/character-version";
import { inputErrorResponse } from "@/server/api-validation";

export async function GET(_: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await canReadCharacter(characterId);
    return NextResponse.json({ version: await getCharacterVersion(characterId) });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
