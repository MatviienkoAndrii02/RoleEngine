import { NextResponse } from "next/server";
import { restoreTemplate } from "@/server/actions/templates";
import { inputErrorResponse } from "@/server/api-validation";

export async function POST(_: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    return NextResponse.json(await restoreTemplate(templateId));
  } catch (error) {
    return inputErrorResponse(error);
  }
}
