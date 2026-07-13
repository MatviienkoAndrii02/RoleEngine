import { NextResponse } from "next/server";
import { applyTemplateToTemplate } from "@/server/actions/templates";
import { applyTemplateToTemplateCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    const body = await parseJson(request, applyTemplateToTemplateCommandSchema);
    const result = await applyTemplateToTemplate({ ...body, targetTemplateId: templateId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
