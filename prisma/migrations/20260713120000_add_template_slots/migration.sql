-- CreateEnum
CREATE TYPE "TemplateSlotDirection" AS ENUM ('INPUT', 'OUTPUT', 'BIDIRECTIONAL');

-- CreateTable
CREATE TABLE "TemplateSlot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "direction" "TemplateSlotDirection" NOT NULL DEFAULT 'INPUT',
    "acceptedTypes" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateSlot_templateId_key_key" ON "TemplateSlot"("templateId", "key");

-- CreateIndex
CREATE INDEX "TemplateSlot_templateId_idx" ON "TemplateSlot"("templateId");

-- AddForeignKey
ALTER TABLE "TemplateSlot" ADD CONSTRAINT "TemplateSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
