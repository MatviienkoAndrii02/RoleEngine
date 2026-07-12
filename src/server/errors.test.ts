import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { appError, normalizeApiError } from "@/server/errors";

describe("normalizeApiError", () => {
  it("keeps explicit AppError codes and status", () => {
    const error = normalizeApiError(appError("FORBIDDEN", "No", 403));
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.status, 403);
  });

  it("maps zod validation errors to VALIDATION_FAILED", () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({ name: "" });
    assert.equal(result.success, false);
    if (!result.success) {
      const error = normalizeApiError(result.error);
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.equal(error.status, 400);
      assert.ok(error.details);
    }
  });

  it("maps legacy domain errors to stable codes", () => {
    const error = normalizeApiError(new Error("Effect creates a dependency cycle"));
    assert.equal(error.code, "DEPENDENCY_CYCLE");
    assert.equal(error.status, 409);
  });

  it("does not leak unknown thrown values as user-facing messages", () => {
    const error = normalizeApiError(new Error("database password is hunter2"));
    assert.equal(error.code, "UNKNOWN_ERROR");
    assert.equal(error.message, "Unexpected server error");
    assert.equal(error.status, 500);
  });
});
