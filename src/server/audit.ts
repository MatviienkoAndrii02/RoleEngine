import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAudit(input: {
  actorId?: string | null;
  workspaceId?: string | null;
  characterId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  fieldPath?: string | null;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      characterId: input.characterId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      fieldPath: input.fieldPath,
      oldValue: input.oldValue,
      newValue: input.newValue,
      metadata: input.metadata ?? {}
    }
  });
}
