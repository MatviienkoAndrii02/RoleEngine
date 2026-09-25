import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLogLine } from "@/server/admin/logs";

describe("admin log parsing", () => {
  it("keeps structured fields available and redacts sensitive fields in the expanded log", () => {
    const entry = parseLogLine(JSON.stringify({
      timestamp: "2026-09-25T10:00:00.000Z",
      level: "error",
      service: "role-engine",
      event: "api.request_failed",
      message: "Request failed",
      errorCode: "INTERNAL_ERROR",
      password: "secret-value",
      context: { access_token: "another-secret", retryable: false },
    }), "unknown", "2026-09-25T10:00:01.000Z");

    assert.equal(entry.message, "Request failed");
    const fullLog = JSON.parse(entry.fullLog) as Record<string, unknown>;
    assert.equal(fullLog.errorCode, "INTERNAL_ERROR");
    assert.equal(fullLog.password, "[REDACTED]");
    assert.deepEqual(fullLog.context, { access_token: "[REDACTED]", retryable: false });
  });

  it("preserves plain text logs in the expandable content", () => {
    const line = "runtime warning\n  additional detail";
    const entry = parseLogLine(line, "role-engine", "2026-09-25T10:00:00.000Z");

    assert.equal(entry.message, line);
    assert.equal(entry.fullLog, line);
  });
});
