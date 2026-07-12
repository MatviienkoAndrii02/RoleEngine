import { NextResponse } from "next/server";
import { deleteEffect, updateEffect } from "@/server/actions/effects";
import { updateEffectCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";
export async function PATCH(request: Request, { params }: { params: Promise<{ effectId: string }> }) {
  try {
    const { effectId } = await params;
    return NextResponse.json(await updateEffect(effectId, await parseJson(request, updateEffectCommandSchema)));
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ effectId: string }> }) {
  try {
    const { effectId } = await params;
    await deleteEffect(effectId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
