import {
  deleteCharacterNodeRoute,
  patchCharacterNodeRoute,
  type CharacterNodeRouteContext,
} from "./node-route-handlers";

export async function PATCH(request: Request, context: CharacterNodeRouteContext) {
  return patchCharacterNodeRoute(request, context);
}

export async function DELETE(request: Request, context: CharacterNodeRouteContext) {
  return deleteCharacterNodeRoute(request, context);
}
