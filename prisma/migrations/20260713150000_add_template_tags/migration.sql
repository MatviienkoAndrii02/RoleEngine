-- CreateTable
CREATE TABLE "TemplateTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTemplateTag" (
    "templateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityTemplateTag_pkey" PRIMARY KEY ("templateId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTag_workspaceId_name_key" ON "TemplateTag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "TemplateTag_workspaceId_archivedAt_idx" ON "TemplateTag"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "EntityTemplateTag_tagId_idx" ON "EntityTemplateTag"("tagId");

-- AddForeignKey
ALTER TABLE "TemplateTag" ADD CONSTRAINT "TemplateTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTag" ADD CONSTRAINT "TemplateTag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTemplateTag" ADD CONSTRAINT "EntityTemplateTag_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTemplateTag" ADD CONSTRAINT "EntityTemplateTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TemplateTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill workspace tags from the previous template kind so existing libraries keep their grouping.
WITH kind_tags AS (
  SELECT DISTINCT
    et."workspaceId",
    CASE et."kind"
      WHEN 'CHARACTER' THEN 'Character'
      WHEN 'ITEM' THEN 'Item'
      WHEN 'SKILL' THEN 'Skill'
      WHEN 'PASSIVE_TALENT' THEN 'Passive Talent'
      WHEN 'MUTATION' THEN 'Mutation'
      WHEN 'BODY_PART' THEN 'Body Part'
      ELSE 'Other'
    END AS "name"
  FROM "EntityTemplate" et
  WHERE et."workspaceId" IS NOT NULL
)
INSERT INTO "TemplateTag" ("id", "workspaceId", "name", "color", "updatedAt")
SELECT
  'tag_' || substr(md5(random()::text || clock_timestamp()::text || kind_tags."workspaceId" || kind_tags."name"), 1, 24),
  kind_tags."workspaceId",
  kind_tags."name",
  'gray',
  CURRENT_TIMESTAMP
FROM kind_tags
ON CONFLICT ("workspaceId", "name") DO NOTHING;

INSERT INTO "EntityTemplateTag" ("templateId", "tagId")
SELECT et."id", tt."id"
FROM "EntityTemplate" et
JOIN "TemplateTag" tt
  ON tt."workspaceId" = et."workspaceId"
 AND tt."name" = CASE et."kind"
      WHEN 'CHARACTER' THEN 'Character'
      WHEN 'ITEM' THEN 'Item'
      WHEN 'SKILL' THEN 'Skill'
      WHEN 'PASSIVE_TALENT' THEN 'Passive Talent'
      WHEN 'MUTATION' THEN 'Mutation'
      WHEN 'BODY_PART' THEN 'Body Part'
      ELSE 'Other'
    END
WHERE et."workspaceId" IS NOT NULL
ON CONFLICT ("templateId", "tagId") DO NOTHING;
