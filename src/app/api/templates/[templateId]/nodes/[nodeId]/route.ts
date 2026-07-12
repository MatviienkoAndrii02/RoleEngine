import { NextResponse } from "next/server";
import { deleteTemplateNode, updateTemplateNode } from "@/server/actions/templates";
import { updateNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string; nodeId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { templateId, nodeId } = await params;
    const body = await parseJson(request, updateNodeCommandSchema);
    return NextResponse.json(await updateTemplateNode({ templateId, nodeId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { templateId, nodeId } = await params;
    await deleteTemplateNode({ templateId, nodeId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
