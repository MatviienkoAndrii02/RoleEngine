ALTER TABLE "User" ADD COLUMN "usernameKey" TEXT;

UPDATE "User"
SET "usernameKey" = lower("username")
WHERE "usernameKey" IS NULL;

ALTER TABLE "User" ALTER COLUMN "usernameKey" SET NOT NULL;

CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");
