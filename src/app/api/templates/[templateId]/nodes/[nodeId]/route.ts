import {
  deleteTemplateNodeRoute,
  patchTemplateNodeRoute,
  type TemplateNodeRouteContext,
} from "./node-route-handlers";

export async function PATCH(request: Request, context: TemplateNodeRouteContext) {
  return patchTemplateNodeRoute(request, context);
}

export async function DELETE(request: Request, context: TemplateNodeRouteContext) {
  return deleteTemplateNodeRoute(request, context);
}
