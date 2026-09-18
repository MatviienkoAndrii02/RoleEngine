-- Remove stale duplicates before creating the uniqueness guard.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS row_num
  FROM "EntityTemplate"
  WHERE "isDefaultCharacter" = true
    AND "workspaceId" IS NOT NULL
    AND "archivedAt" IS NULL
)
UPDATE "EntityTemplate" et
SET "isDefaultCharacter" = false
FROM ranked r
WHERE et.id = r.id
  AND r.row_num > 1;

-- Enforce one default character template per active workspace.
CREATE UNIQUE INDEX "EntityTemplate_workspaceId_default_character_key"
ON "EntityTemplate"("workspaceId")
WHERE "isDefaultCharacter" = true
  AND "workspaceId" IS NOT NULL
  AND "archivedAt" IS NULL;
