import { NextResponse } from "next/server";
import * as characterActions from "@/server/actions/characters";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ characterId: string; nodeId: string }> };

type CharacterNodeRouteActions = Pick<typeof characterActions, "updateCharacterNode" | "deleteCharacterNode">;

export async function patchCharacterNodeRoute(
  request: Request,
  { params }: Context,
  actions: CharacterNodeRouteActions = characterActions,
) {
  try {
    const { characterId, nodeId } = await params;
    const body = await parseJson(request, updateNodeCommandSchema);
    return NextResponse.json(await actions.updateCharacterNode({ characterId, nodeId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function deleteCharacterNodeRoute(
  _: Request,
  { params }: Context,
  actions: CharacterNodeRouteActions = characterActions,
) {
  try {
    const { characterId, nodeId } = await params;
    await actions.deleteCharacterNode({ characterId, nodeId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  return patchCharacterNodeRoute(request, context);
}

export async function DELETE(request: Request, context: Context) {
  return deleteCharacterNodeRoute(request, context);
}
