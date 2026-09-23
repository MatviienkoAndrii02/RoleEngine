import { adminLogsRoute } from "./logs-route-handlers";

export async function GET(request: Request) {
  return adminLogsRoute(request);
}
