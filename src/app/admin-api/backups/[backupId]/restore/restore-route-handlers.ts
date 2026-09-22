import { NextResponse } from "next/server";
import { adminBackupRestoreRequestSchema } from "@/domain/validation";
import { parseJson } from "@/server/api-validation";
import * as adminAuthz from "@/server/admin/authz";
import { assertSafeBackupId } from "@/server/admin/backup-id";
import * as adminBackups from "@/server/admin/backups";
import { assertAdminMutationOrigin } from "@/server/admin/origin-guard";
import { apiErrorResponse } from "@/server/errors";

export type AdminBackupRestoreRouteContext = { params: Promise<{ backupId: string }> };

export type AdminBackupRestoreRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminBackups, "restoreBackup">;

const defaultDependencies: AdminBackupRestoreRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  restoreBackup: adminBackups.restoreBackup,
};

// Restore is POST-only and requires an explicit confirmation token, so it can never be triggered
// by a link, a prefetch or a GET. The request carries nothing but the backup id: the archive path,
// the database connection and the tool arguments are resolved on the server.
export async function restoreAdminBackupRoute(
  request: Request,
  { params }: AdminBackupRestoreRouteContext,
  dependencies: AdminBackupRestoreRouteDependencies = defaultDependencies,
) {
  try {
    assertAdminMutationOrigin(request);
    const actor = await dependencies.requirePlatformAdmin();
    const { backupId } = await params;
    const safeBackupId = assertSafeBackupId(backupId);
    await parseJson(request, adminBackupRestoreRequestSchema);
    const result = await dependencies.restoreBackup({ backupId: safeBackupId, actorId: actor.id });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}