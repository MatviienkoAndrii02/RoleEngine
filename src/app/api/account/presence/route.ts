import { auth } from "@/auth";
import { apiErrorResponse, unauthorized } from "@/server/errors";
import { touchUserPresence } from "@/server/user-presence";

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw unauthorized();
    await touchUserPresence(userId);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
