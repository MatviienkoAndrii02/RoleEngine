import { downloadAdminBackupRoute, type AdminBackupDownloadRouteContext } from "./download-route-handlers";

export async function GET(request: Request, context: AdminBackupDownloadRouteContext) {
  return downloadAdminBackupRoute(request, context);
}