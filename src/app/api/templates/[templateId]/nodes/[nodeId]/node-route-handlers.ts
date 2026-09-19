import { NextResponse } from "next/server";
import * as templateActions from "@/server/actions/templates";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

// Kept outside route.ts: Next.js rejects any non-HTTP export from a route module,
// so the dependency-injection seam for tests lives in this plain module.
export type TemplateNodeRouteContext = { params: Promise<{ templateId: string; nodeId: string }> };

export type TemplateNodeRouteActions = Pick<typeof templateActions, "updateTemplateNode" | "deleteTemplateNode">;

export async function patchTemplateNodeRoute(
  request: Request,
  { params }: TemplateNodeRouteContext,
  actions: TemplateNodeRouteActions = templateActions,
) {
  try {
    const { templateId, nodeId } = await params;
    const body = await parseJson(request, updateNodeCommandSchema);
    return NextResponse.json(await actions.updateTemplateNode({ templateId, nodeId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function deleteTemplateNodeRoute(
  _: Request,
  { params }: TemplateNodeRouteContext,
  actions: TemplateNodeRouteActions = templateActions,
) {
  try {
    const { templateId, nodeId } = await params;
    await actions.deleteTemplateNode({ templateId, nodeId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
