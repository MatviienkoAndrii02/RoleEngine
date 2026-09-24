import { NextResponse } from "next/server";
import * as adminAuthz from "@/server/admin/authz";
import * as adminUsers from "@/server/admin/users";
import { apiErrorResponse } from "@/server/errors";

export type AdminUsersRouteDependencies =
  & Pick<typeof adminAuthz, "requirePlatformAdmin">
  & Pick<typeof adminUsers, "getAdminUsers">;

const defaultDependencies: AdminUsersRouteDependencies = {
  requirePlatformAdmin: adminAuthz.requirePlatformAdmin,
  getAdminUsers: adminUsers.getAdminUsers,
};

export async function adminUsersRoute(_: Request, dependencies: AdminUsersRouteDependencies = defaultDependencies) {
  try {
    await dependencies.requirePlatformAdmin();
    const body = await dependencies.getAdminUsers();
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
