import { NextResponse } from "next/server";
import { createNumericEffect, createStructuralEffect, createTriggeredEffect } from "@/server/actions/effects";
import { createEffectCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function POST(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    const body = await parseJson(request, createEffectCommandSchema);
    switch (body.operation) {
      case "TRIGGERED":
        return NextResponse.json(await createTriggeredEffect({ characterId, ...body }), { status: 201 });
      case "CREATE_NODE":
      case "CREATE_GROUP":
      case "PATCH_NODE_PROPS":
        return NextResponse.json(await createStructuralEffect({ characterId, ...body }), { status: 201 });
      default:
        return NextResponse.json(await createNumericEffect({ characterId, ...body }), { status: 201 });
    }
  } catch (error) {
    return inputErrorResponse(error);
  }
}
