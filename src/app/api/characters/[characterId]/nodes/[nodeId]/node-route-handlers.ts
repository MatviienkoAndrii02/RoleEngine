import { NextResponse } from "next/server";
import * as characterActions from "@/server/actions/characters";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

// Kept outside route.ts: Next.js rejects any non-HTTP export from a route module,
// so the dependency-injection seam for tests lives in this plain module.
export type CharacterNodeRouteContext = { params: Promise<{ characterId: string; nodeId: string }> };

export type CharacterNodeRouteActions = Pick<typeof characterActions, "updateCharacterNode" | "deleteCharacterNode">;

export async function patchCharacterNodeRoute(
  request: Request,
  { params }: CharacterNodeRouteContext,
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
  { params }: CharacterNodeRouteContext,
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
