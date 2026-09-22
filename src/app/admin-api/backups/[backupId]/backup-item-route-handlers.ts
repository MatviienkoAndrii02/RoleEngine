import { NextResponse } from "next/server";
import * as adminAuthz from "@/server/admin/authz";
import { assertSafeBackupId } from "@/server/admin/backup-id";
import * as adminBackups from "@/server/admin/backups";
import { assertAdminMutationOrigin } from "@/server/admin/origin-guard";
import { apiErrorResponse } from "@/server/errors";

export type AdminBackupItemRouteContext = { params: Promise<{ backupId: string }> };

export type AdminBackupItemRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminBackups, "deleteBackup">;

const defaultDependencies: AdminBackupItemRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  deleteBackup: adminBackups.deleteBackup,
};

export async function deleteAdminBackupRoute(
  _: Request,
  { params }: AdminBackupItemRouteContext,
  dependencies: AdminBackupItemRouteDependencies = defaultDependencies,
) {
  try {
    assertAdminMutationOrigin(_);
    const actor = await dependencies.requirePlatformAdmin();
    const { backupId } = await params;
    const safeBackupId = assertSafeBackupId(backupId);
    const backup = await dependencies.deleteBackup({ backupId: safeBackupId, actorId: actor.id });
    return NextResponse.json({ backup }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}