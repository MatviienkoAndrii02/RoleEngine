-- Drop the legacy platform role from accounts. Product access is now fully modeled
-- by WorkspaceMembership plus CharacterAssignment for read-only character access.
ALTER TABLE "User" DROP COLUMN "role";

DROP TYPE "UserRole";
