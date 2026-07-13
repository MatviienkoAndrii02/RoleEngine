import { NextResponse } from "next/server";
import { updateTemplateSlotCommandSchema } from "@/domain/validation";
import { deleteTemplateSlot, updateTemplateSlot } from "@/server/actions/templates";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string; slotId: string }> }) {
  try {
    const { templateId, slotId } = await params;
    const body = await parseJson(request, updateTemplateSlotCommandSchema);
    return NextResponse.json(await updateTemplateSlot({ templateId, slotId, ...body }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ templateId: string; slotId: string }> }) {
  try {
    const { templateId, slotId } = await params;
    await deleteTemplateSlot({ templateId, slotId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
