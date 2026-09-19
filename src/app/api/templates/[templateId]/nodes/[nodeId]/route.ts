import { NextResponse } from "next/server";
import * as templateActions from "@/server/actions/templates";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string; nodeId: string }> };

type TemplateNodeRouteActions = Pick<typeof templateActions, "updateTemplateNode" | "deleteTemplateNode">;

export async function patchTemplateNodeRoute(
  request: Request,
  { params }: Context,
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
  { params }: Context,
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

export async function PATCH(request: Request, context: Context) {
  return patchTemplateNodeRoute(request, context);
}

export async function DELETE(request: Request, context: Context) {
  return deleteTemplateNodeRoute(request, context);
}
