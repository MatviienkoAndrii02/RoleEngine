import { NextResponse } from "next/server";
import { applyTemplateToCharacter } from "@/server/actions/characters";
import { applyTemplateCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, applyTemplateCommandSchema);
    const result = await applyTemplateToCharacter({ ...body, characterId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
