import { jsonIntegrityGetResponse, jsonIntegrityPostResponse } from "@/server/json-integrity-api";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(_: Request, { params }: Context) {
  const { templateId } = await params;
  return jsonIntegrityGetResponse({ kind: "template", templateId });
}

export async function POST(request: Request, { params }: Context) {
  const { templateId } = await params;
  return jsonIntegrityPostResponse({ kind: "template", templateId }, request);
}
