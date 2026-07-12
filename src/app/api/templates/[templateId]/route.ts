import { NextResponse } from "next/server";
import { archiveTemplate, updateTemplate } from "@/server/actions/templates";
import { updateTemplateCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    const body = await parseJson(request, updateTemplateCommandSchema);
    return NextResponse.json(await updateTemplate({ templateId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    await archiveTemplate(templateId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
