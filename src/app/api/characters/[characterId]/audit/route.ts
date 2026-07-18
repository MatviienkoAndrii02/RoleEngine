import { NextResponse } from "next/server";
import { Prisma, type AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canReadCharacter } from "@/server/authz";
import { inputErrorResponse } from "@/server/api-validation";

const auditActions: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "ASSIGN", "APPLY_TEMPLATE", "RECALCULATE"];
const auditEntities = new Set(["Character", "CharacterNode", "Effect", "CharacterAssignment", "EntityTemplate", "TemplateNode"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const actorSelect = {
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  try {
    const { characterId } = await params;
    await canReadCharacter(characterId);

    const url = new URL(request.url);
    const limit = clampLimit(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT));
    const cursor = url.searchParams.get("cursor");
    const focusId = url.searchParams.get("focusId");
    const where = buildWhere(characterId, url.searchParams);

    const [total, focusRecord, records] = await Promise.all([
      prisma.auditLog.count({ where }),
      focusId && !cursor
        ? prisma.auditLog.findFirst({
            where: { ...where, id: focusId },
            include: { actor: { select: actorSelect } },
          })
        : Promise.resolve(null),
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: actorSelect } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ]);

    const pageItems = records.slice(0, limit);
    const items = focusRecord && !pageItems.some((item) => item.id === focusRecord.id)
      ? [focusRecord, ...pageItems].slice(0, limit)
      : pageItems;

    return NextResponse.json({
      items,
      nextCursor: records.length > limit ? pageItems.at(-1)?.id ?? null : null,
      total,
    });
  } catch (error) {
    return inputErrorResponse(error);
  }
}

function buildWhere(characterId: string, params: URLSearchParams): Prisma.AuditLogWhereInput {
  const action = params.get("action");
  const entity = params.get("entity");
  const query = params.get("query")?.trim();
  const where: Prisma.AuditLogWhereInput = { characterId };

  if (action && auditActions.includes(action as AuditAction)) {
    where.action = action as AuditAction;
  }

  if (entity && auditEntities.has(entity)) {
    where.entityType = entity;
  }

  if (query) {
    where.OR = [
      { entityType: { contains: query, mode: "insensitive" } },
      { entityId: { contains: query, mode: "insensitive" } },
      { fieldPath: { contains: query, mode: "insensitive" } },
      { actor: { name: { contains: query, mode: "insensitive" } } },
      { actor: { email: { contains: query, mode: "insensitive" } } },
    ];
  }

  return where;
}

function clampLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}
