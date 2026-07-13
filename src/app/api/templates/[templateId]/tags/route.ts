import { NextResponse } from "next/server";
import { z } from "zod";
import { assignTemplateTag, createTemplateTag } from "@/server/actions/templates";
import { assignTemplateTagCommandSchema, createTemplateTagCommandSchema } from "@/domain/validation";
import { ApiInputError, inputErrorResponse } from "@/server/api-validation";

type Context = { params: Promise<{ templateId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { templateId } = await params;
    const body = await readBody(request);
    const schema = "tagId" in body ? assignTemplateTagCommandSchema : createTemplateTagCommandSchema;
    const parsed = schema.parse({ ...body, templateId });
    const tag = "tagId" in parsed
      ? await assignTemplateTag(parsed)
      : await createTemplateTag(parsed);
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiInputError("INVALID_JSON", "Request body must be valid JSON");
  }
  const parsed = z.record(z.string(), z.unknown()).safeParse(body);
  if (!parsed.success) throw new ApiInputError("VALIDATION_FAILED", "Request validation failed", parsed.error.flatten());
  return parsed.data;
}
