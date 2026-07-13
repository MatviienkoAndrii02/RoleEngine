import { NextResponse } from "next/server";
import { createTemplateSlotCommandSchema } from "@/domain/validation";
import { createTemplateSlot } from "@/server/actions/templates";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    const body = await parseJson(request, createTemplateSlotCommandSchema);
    return NextResponse.json(await createTemplateSlot({ templateId, ...body }), { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
