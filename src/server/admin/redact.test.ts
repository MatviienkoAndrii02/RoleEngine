import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "@/server/admin/redact";

describe("admin message redaction", () => {
  it("removes the configured secret from tool output", () => {
    const message = redactSecrets(
      "pg_dump: error: connection failed for user postgres using secret-value",
      ["secret-value"],
    );
    assert.equal(message.includes("secret-value"), false);
    assert.equal(message.includes("***"), true);
  });

  it("collapses whitespace and truncates long output", () => {
    const message = redactSecrets(`first\n   second ${"x".repeat(500)}`, [], 40);
    assert.equal(message.startsWith("first second"), true);
    assert.equal(message.endsWith("..."), true);
    assert.ok(message.length <= 43);
  });

  it("ignores empty or too short secrets so common words are not mangled", () => {
    assert.equal(redactSecrets("a normal message", [null, "", "a"]), "a normal message");
  });
});