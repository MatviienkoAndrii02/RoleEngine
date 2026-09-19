import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLoginLocked, normalizeLoginIdentifier, registerFailedLoginAttempt } from "@/auth";

describe("credential security guard", () => {
  it("locks an identifier after repeated failed attempts", () => {
    const identifier = "alice@example.com";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const locked = registerFailedLoginAttempt(identifier);
      assert.equal(locked, false);
      assert.equal(isLoginLocked(identifier), false);
    }

    assert.equal(registerFailedLoginAttempt(identifier), true);
    assert.equal(isLoginLocked(identifier), true);

    const sameIdentifier = normalizeLoginIdentifier(identifier);
    assert.equal(sameIdentifier, "alice@example.com");
  });
});
