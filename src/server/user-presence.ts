import { prisma } from "@/lib/prisma";
import { USER_PRESENCE_WRITE_THROTTLE_MS } from "@/domain/user-presence";

export async function touchUserPresence(userId: string, now = new Date()): Promise<void> {
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { lastSeenAt: null },
        { lastSeenAt: { lte: new Date(now.getTime() - USER_PRESENCE_WRITE_THROTTLE_MS) } },
      ],
    },
    data: { lastSeenAt: now },
  });
}
