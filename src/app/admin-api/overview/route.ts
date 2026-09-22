import { adminOverviewRoute } from "./overview-route-handlers";

export async function GET(request: Request) {
  return adminOverviewRoute(request);
}