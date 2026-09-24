import { adminUsersRoute } from "./users-route-handlers";

export async function GET(request: Request) {
  return adminUsersRoute(request);
}
