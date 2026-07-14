import { NextResponse } from "next/server";
import { z } from "zod";
import { runTriggeredEffect } from "@/server/actions/effects";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

const runTriggeredEffectSchema = z.object({
  nodeId: z.string().trim().min(1),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ effectId: string }> }) {
  try {
    const { effectId } = await params;
    const body = await parseJson(request, runTriggeredEffectSchema);
    return NextResponse.json(await runTriggeredEffect({ effectId, nodeId: body.nodeId }));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
