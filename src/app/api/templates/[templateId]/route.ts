import { NextResponse } from "next/server";
import { archiveTemplate, permanentlyDeleteTemplate, updateTemplate } from "@/server/actions/templates";
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

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    const permanent = new URL(request.url).searchParams.get("permanent") === "1";
    if (permanent) await permanentlyDeleteTemplate(templateId);
    else await archiveTemplate(templateId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
