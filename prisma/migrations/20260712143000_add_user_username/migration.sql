ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User"
SET "username" = left(
  regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9_]+', '_', 'g')
  || '_' ||
  lower(substr("id", greatest(length("id") - 5, 1), 6)),
  40
)
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
