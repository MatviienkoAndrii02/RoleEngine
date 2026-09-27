-- Existing accounts predate email verification and retain their current access.
-- Registrations created after this migration keep emailVerified NULL until the
-- user consumes a one-time verification token.
UPDATE "User"
SET "emailVerified" = CURRENT_TIMESTAMP
WHERE "emailVerified" IS NULL;
