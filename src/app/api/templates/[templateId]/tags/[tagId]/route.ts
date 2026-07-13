import { NextResponse } from "next/server";
import { deleteTemplateTag, unassignTemplateTag, updateTemplateTag } from "@/server/actions/templates";
import { deleteTemplateTagCommandSchema, unassignTemplateTagCommandSchema, updateTemplateTagBodyCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string; tagId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { templateId, tagId } = await params;
    const body = await parseJson(request, updateTemplateTagBodyCommandSchema);
    return NextResponse.json(await updateTemplateTag({ ...body, templateId, tagId }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { templateId, tagId } = await params;
    const permanent = new URL(request.url).searchParams.get("permanent") === "1";
    const input = permanent
      ? deleteTemplateTagCommandSchema.parse({ templateId, tagId })
      : unassignTemplateTagCommandSchema.parse({ templateId, tagId });
    if (permanent) await deleteTemplateTag(input);
    else await unassignTemplateTag(input);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
