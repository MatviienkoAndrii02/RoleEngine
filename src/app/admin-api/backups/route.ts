import { createAdminBackupRoute, listAdminBackupsRoute } from "./backup-route-handlers";

export async function GET(request: Request) {
  return listAdminBackupsRoute(request);
}

export async function POST(request: Request) {
  return createAdminBackupRoute(request);
}