import { NextResponse } from "next/server";
import { restoreCharacterNode } from "@/server/actions/characters";
import { inputErrorResponse } from "@/server/api-validation";

type Context = { params: Promise<{ characterId: string; nodeId: string }> };

export async function POST(_: Request, { params }: Context) {
  try {
    const { characterId, nodeId } = await params;
    await restoreCharacterNode({ characterId, nodeId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
