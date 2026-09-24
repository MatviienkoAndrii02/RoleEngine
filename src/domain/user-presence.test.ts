import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUserOnline, USER_PRESENCE_ONLINE_WINDOW_MS } from "@/domain/user-presence";

describe("user presence", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");

  it("considers activity within five minutes online", () => {
    assert.equal(isUserOnline(now, now), true);
    assert.equal(isUserOnline(new Date(now.getTime() - USER_PRESENCE_ONLINE_WINDOW_MS), now), true);
    assert.equal(isUserOnline(new Date(now.getTime() - USER_PRESENCE_ONLINE_WINDOW_MS - 1), now), false);
  });

  it("keeps missing and future activity offline", () => {
    assert.equal(isUserOnline(null, now), false);
    assert.equal(isUserOnline(new Date(now.getTime() + 1), now), false);
  });
});
