import { NextResponse } from "next/server";
import type { AdminOverviewResponse } from "@/domain/admin-console";
import * as adminAuthz from "@/server/admin/authz";
import * as adminBackups from "@/server/admin/backups";
import * as adminHealth from "@/server/admin/health";
import { apiErrorResponse } from "@/server/errors";

// Kept outside route.ts: Next.js rejects any non-HTTP export from a route module,
// so the dependency-injection seam for tests lives in this plain module.
export type AdminOverviewRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminHealth, "getAdminHealthSnapshot">
  & Pick<typeof adminBackups, "getBackupOverview">;

const defaultDependencies: AdminOverviewRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  getAdminHealthSnapshot: adminHealth.getAdminHealthSnapshot,
  getBackupOverview: adminBackups.getBackupOverview,
};

export async function adminOverviewRoute(_: Request, dependencies: AdminOverviewRouteDependencies = defaultDependencies) {
  try {
    await dependencies.requirePlatformAdmin();
    const [health, backup] = await Promise.all([
      dependencies.getAdminHealthSnapshot(),
      dependencies.getBackupOverview(),
    ]);
    const body: AdminOverviewResponse = { generatedAt: new Date().toISOString(), health, backup };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}