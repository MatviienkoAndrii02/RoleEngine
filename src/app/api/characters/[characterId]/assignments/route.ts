import { NextResponse } from "next/server";
import { addCharacterAssignment, removeCharacterAssignment } from "@/server/actions/characters";
import { characterAssignmentCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, characterAssignmentCommandSchema);
    await addCharacterAssignment({ characterId, userId: body.userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, characterAssignmentCommandSchema);
    await removeCharacterAssignment({ characterId, userId: body.userId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
