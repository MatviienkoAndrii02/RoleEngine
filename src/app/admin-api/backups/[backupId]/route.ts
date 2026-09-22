import { deleteAdminBackupRoute, type AdminBackupItemRouteContext } from "./backup-item-route-handlers";

export async function DELETE(request: Request, context: AdminBackupItemRouteContext) {
  return deleteAdminBackupRoute(request, context);
}