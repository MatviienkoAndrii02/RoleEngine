import { NextResponse } from "next/server";
import * as adminAuthz from "@/server/admin/authz";
import { assertSafeBackupId } from "@/server/admin/backup-id";
import * as adminBackups from "@/server/admin/backups";
import { apiErrorResponse } from "@/server/errors";

export type AdminBackupDownloadRouteContext = { params: Promise<{ backupId: string }> };

export type AdminBackupDownloadRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminBackups, "openBackupDownload">;

const defaultDependencies: AdminBackupDownloadRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  openBackupDownload: adminBackups.openBackupDownload,
};

export async function downloadAdminBackupRoute(
  _: Request,
  { params }: AdminBackupDownloadRouteContext,
  dependencies: AdminBackupDownloadRouteDependencies = defaultDependencies,
) {
  try {
    await dependencies.requirePlatformAdmin();
    const { backupId } = await params;
    const safeBackupId = assertSafeBackupId(backupId);
    const download = await dependencies.openBackupDownload({ backupId: safeBackupId });
    return new NextResponse(download.stream, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(download.sizeBytes),
        "content-disposition": `attachment; filename="${download.fileName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}