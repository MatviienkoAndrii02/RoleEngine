import { jsonIntegrityGetResponse, jsonIntegrityPostResponse } from "@/server/json-integrity-api";

type Context = { params: Promise<{ characterId: string }> };

export async function GET(_: Request, { params }: Context) {
  const { characterId } = await params;
  return jsonIntegrityGetResponse({ kind: "character", characterId });
}

export async function POST(request: Request, { params }: Context) {
  const { characterId } = await params;
  return jsonIntegrityPostResponse({ kind: "character", characterId }, request);
}
