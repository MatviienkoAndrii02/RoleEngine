import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTemplateGM } from "@/server/authz";
import { createTemplateNode } from "@/server/actions/templates";
import { createNodeCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function GET(_: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    await requireTemplateGM(templateId);
    const nodes = await prisma.templateNode.findMany({
      where: { templateId },
      orderBy: [{ parentId: "asc" }, { order: "asc" }]
    });

    return NextResponse.json(nodes);
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { templateId } = await params;
    const body = await parseJson(request, createNodeCommandSchema);
    const node = await createTemplateNode({ ...body, templateId });
    return NextResponse.json(node, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
