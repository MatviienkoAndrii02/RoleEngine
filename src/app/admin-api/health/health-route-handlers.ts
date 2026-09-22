import { NextResponse } from "next/server";
import type { AdminHealthResponse } from "@/domain/admin-console";
import * as adminAuthz from "@/server/admin/authz";
import * as adminHealth from "@/server/admin/health";
import { apiErrorResponse } from "@/server/errors";

export type AdminHealthRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminHealth, "getAdminHealthSnapshot">;

const defaultDependencies: AdminHealthRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  getAdminHealthSnapshot: adminHealth.getAdminHealthSnapshot,
};

export async function adminHealthRoute(_: Request, dependencies: AdminHealthRouteDependencies = defaultDependencies) {
  try {
    await dependencies.requirePlatformAdmin();
    const body: AdminHealthResponse = await dependencies.getAdminHealthSnapshot();
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}