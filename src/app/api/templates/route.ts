import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTemplate } from "@/server/actions/templates";
import { getActiveWritableWorkspace, requireUser } from "@/server/authz";
import { createTemplateCommandSchema } from "@/domain/validation";
import { inputErrorResponse, parseJson } from "@/server/api-validation";

export async function GET() {
  try {
    const user = await requireUser();
    const activeWorkspace = await getActiveWritableWorkspace(user.id);
    const workspaceIds = activeWorkspace ? [activeWorkspace.id] : [];
    const templates = await prisma.entityTemplate.findMany({
      where: {
        archivedAt: null,
        OR: [
          { workspaceId: { in: workspaceIds } },
          { workspaceId: null, isGlobal: true },
        ],
      },
      include: { tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }, _count: { select: { nodes: true, effects: true } } },
      orderBy: [{ name: "asc" }]
    });

    return NextResponse.json(templates);
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const template = await createTemplate(await parseJson(request, createTemplateCommandSchema));
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
