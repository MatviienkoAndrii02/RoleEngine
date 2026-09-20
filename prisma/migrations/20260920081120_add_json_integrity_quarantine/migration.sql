-- CreateEnum
CREATE TYPE "JsonIntegrityStatus" AS ENUM ('ACTIVE', 'REPAIRED', 'RELEASED');

-- CreateTable
CREATE TABLE "JsonIntegrityQuarantine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "characterId" TEXT,
    "templateId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" "JsonIntegrityStatus" NOT NULL DEFAULT 'ACTIVE',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "repairable" BOOLEAN NOT NULL DEFAULT false,
    "rawValue" JSONB,
    "detectedById" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "JsonIntegrityQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JsonIntegrityQuarantine_workspaceId_status_idx" ON "JsonIntegrityQuarantine"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "JsonIntegrityQuarantine_characterId_status_idx" ON "JsonIntegrityQuarantine"("characterId", "status");

-- CreateIndex
CREATE INDEX "JsonIntegrityQuarantine_templateId_status_idx" ON "JsonIntegrityQuarantine"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JsonIntegrityQuarantine_entityType_entityId_field_key" ON "JsonIntegrityQuarantine"("entityType", "entityId", "field");
