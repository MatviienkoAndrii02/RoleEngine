import { restoreAdminBackupRoute, type AdminBackupRestoreRouteContext } from "./restore-route-handlers";

export async function POST(request: Request, context: AdminBackupRestoreRouteContext) {
  return restoreAdminBackupRoute(request, context);
}