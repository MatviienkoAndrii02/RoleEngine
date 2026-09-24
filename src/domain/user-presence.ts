export const USER_PRESENCE_ONLINE_WINDOW_MS = 5 * 60_000;
export const USER_PRESENCE_HEARTBEAT_INTERVAL_MS = 60_000;
export const USER_PRESENCE_WRITE_THROTTLE_MS = 45_000;

export function isUserOnline(lastSeenAt: Date | null, now: Date): boolean {
  if (!lastSeenAt) return false;
  const elapsedMs = now.getTime() - lastSeenAt.getTime();
  return elapsedMs >= 0 && elapsedMs <= USER_PRESENCE_ONLINE_WINDOW_MS;
}
