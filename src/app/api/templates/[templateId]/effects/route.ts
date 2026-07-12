import { NextResponse } from "next/server";
import { createTemplateNumericEffect, createTemplateStructuralEffect } from "@/server/actions/effects";
import { createEffectCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    const body = await parseJson(request, createEffectCommandSchema);
    switch (body.operation) {
      case "CREATE_NODE":
      case "CREATE_GROUP":
      case "PATCH_NODE_PROPS":
        return NextResponse.json(await createTemplateStructuralEffect({ templateId, ...body }), { status: 201 });
      default:
        return NextResponse.json(await createTemplateNumericEffect({ templateId, ...body }), { status: 201 });
    }
  } catch (error) {
    return inputErrorResponse(error);
  }
}
