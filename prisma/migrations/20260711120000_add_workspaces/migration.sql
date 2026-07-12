-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'GM', 'PLAYER');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Character" ADD COLUMN "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "EntityTemplate" ADD COLUMN "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "workspaceId" TEXT;

-- Backfill one workspace for existing local/demo data. Future UI will expose explicit workspace selection.
INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt", "metadata")
VALUES (
    'legacy-workspace',
    'Legacy Workspace',
    (SELECT "id" FROM "User" WHERE "role" = 'GM' ORDER BY "createdAt" ASC LIMIT 1),
    CURRENT_TIMESTAMP,
    '{"legacy": true}'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "WorkspaceMembership" ("id", "workspaceId", "userId", "role")
SELECT
    'legacy-membership-' || "id",
    'legacy-workspace',
    "id",
    CASE WHEN "role" = 'GM' THEN 'OWNER'::"WorkspaceRole" ELSE 'PLAYER'::"WorkspaceRole" END
FROM "User"
ON CONFLICT DO NOTHING;

UPDATE "Character" SET "workspaceId" = 'legacy-workspace' WHERE "workspaceId" IS NULL;
UPDATE "EntityTemplate" SET "workspaceId" = 'legacy-workspace' WHERE "workspaceId" IS NULL;
UPDATE "AuditLog"
SET "workspaceId" = COALESCE(
    (SELECT "workspaceId" FROM "Character" WHERE "Character"."id" = "AuditLog"."characterId"),
    'legacy-workspace'
)
WHERE "workspaceId" IS NULL;

ALTER TABLE "Character" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX "Workspace_name_idx" ON "Workspace"("name");
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");
CREATE INDEX "WorkspaceMembership_userId_role_idx" ON "WorkspaceMembership"("userId", "role");
CREATE INDEX "Character_workspaceId_archivedAt_idx" ON "Character"("workspaceId", "archivedAt");
CREATE INDEX "EntityTemplate_workspaceId_archivedAt_idx" ON "EntityTemplate"("workspaceId", "archivedAt");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntityTemplate" ADD CONSTRAINT "EntityTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
