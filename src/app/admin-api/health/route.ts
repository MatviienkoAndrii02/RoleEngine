import { adminHealthRoute } from "./health-route-handlers";

export async function GET(request: Request) {
  return adminHealthRoute(request);
}