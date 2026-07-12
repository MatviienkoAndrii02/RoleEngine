import { NextResponse } from "next/server";
import { deleteCharacterNode, updateCharacterNode } from "@/server/actions/characters";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ characterId: string; nodeId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { characterId, nodeId } = await params;
    const body = await parseJson(request, updateNodeCommandSchema);
    return NextResponse.json(await updateCharacterNode({ characterId, nodeId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { characterId, nodeId } = await params;
    await deleteCharacterNode({ characterId, nodeId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
