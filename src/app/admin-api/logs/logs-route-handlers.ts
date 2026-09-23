import { NextResponse } from "next/server";
import type { AdminLogsResponse } from "@/domain/admin-console";
import * as adminAuthz from "@/server/admin/authz";
import * as adminLogs from "@/server/admin/logs";
import { apiErrorResponse } from "@/server/errors";

export type AdminLogsRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminLogs, "getAdminLogs">;

const defaultDependencies: AdminLogsRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  getAdminLogs: adminLogs.getAdminLogs,
};

export async function adminLogsRoute(request: Request, dependencies: AdminLogsRouteDependencies = defaultDependencies) {
  try {
    await dependencies.requirePlatformAdmin();
    const url = new URL(request.url);
    const body: AdminLogsResponse = await dependencies.getAdminLogs({
      range: url.searchParams.get("range") ?? "1h",
      source: url.searchParams.get("source") ?? "all",
    });
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
