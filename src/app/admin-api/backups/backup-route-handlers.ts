import { NextResponse } from "next/server";
import type { AdminBackupListResponse } from "@/domain/admin-console";
import * as adminAuthz from "@/server/admin/authz";
import * as adminBackups from "@/server/admin/backups";
import { assertAdminMutationOrigin } from "@/server/admin/origin-guard";
import { apiErrorResponse } from "@/server/errors";

export type AdminBackupRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminBackups, "listBackups" | "createBackup" | "describeBackupStorage">;

const defaultDependencies: AdminBackupRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  listBackups: adminBackups.listBackups,
  createBackup: adminBackups.createBackup,
  describeBackupStorage: adminBackups.describeBackupStorage,
};

export async function listAdminBackupsRoute(_: Request, dependencies: AdminBackupRouteDependencies = defaultDependencies) {
  try {
    await dependencies.requirePlatformAdmin();
    const backups = await dependencies.listBackups();
    const body: AdminBackupListResponse = { storage: dependencies.describeBackupStorage(), backups };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function createAdminBackupRoute(_: Request, dependencies: AdminBackupRouteDependencies = defaultDependencies) {
  try {
    assertAdminMutationOrigin(_);
    const actor = await dependencies.requirePlatformAdmin();
    const backup = await dependencies.createBackup({ actorId: actor.id });
    return NextResponse.json({ backup }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}