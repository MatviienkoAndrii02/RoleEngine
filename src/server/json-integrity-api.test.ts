import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JsonIntegrityApplyResult, JsonIntegrityReport } from "@/domain/json-integrity";
import { appError } from "@/server/errors";
import { jsonIntegrityApiDeps, jsonIntegrityGetResponse, jsonIntegrityPostResponse, type JsonIntegrityApiDeps } from "./json-integrity-api";

const scope = { kind: "character", characterId: "char_1" } as const;

const report: JsonIntegrityReport = {
  scope,
  workspaceId: "ws_1",
  entries: [
    {
      entityType: "CharacterNode",
      entityId: "node_1",
      entityName: "Strength",
      field: "data",
      strategy: "repair",
      repairable: true,
      issues: ["data.value must be a finite number"],
      repairs: ["COERCED_NUMBER"],
    },
  ],
  quarantine: [],
  summary: { invalid: 1, repairable: 1, manual: 0, activeQuarantine: 0 },
};

const applyResult: JsonIntegrityApplyResult = {
  scope,
  action: "repair",
  repaired: 1,
  quarantined: 0,
  entries: report.entries,
};

function capturingDeps(overrides: Partial<JsonIntegrityApiDeps> = {}): JsonIntegrityApiDeps {
  return {
    authorize: async () => ({ id: "user_1" }),
    report: async (received) => {
      assert.deepEqual(received, scope);
      return report;
    },
    apply: async (received, actorId, action) => {
      assert.deepEqual(received, scope);
      assert.equal(actorId, "user_1");
      assert.equal(action, "repair");
      return applyResult;
    },
    resolve: async (input, actorId) => {
      assert.deepEqual(input, { entryId: "entry_1", resolution: "release" });
      assert.equal(actorId, "user_1");
      return report;
    },
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/characters/char_1/json-integrity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("json integrity API contract", () => {
  it("GET returns the report for an authorized GM", async () => {
    const response = await jsonIntegrityGetResponse(scope, capturingDeps());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), report);
  });

  it("GET maps authorization failures to the error envelope", async () => {
    const deps = capturingDeps({
      authorize: async () => {
        throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
      },
    });
    const response = await jsonIntegrityGetResponse(scope, deps);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { characterId: "char_1" },
    });
  });

  it("POST resolve forwards the command and actor identity", async () => {
    const response = await jsonIntegrityPostResponse(
      scope,
      postRequest({ action: "resolve", entryId: "entry_1", resolution: "release" }),
      capturingDeps(),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), report);
  });

  it("POST repair forwards the policy action and actor identity", async () => {
    const response = await jsonIntegrityPostResponse(scope, postRequest({ action: "repair" }), capturingDeps());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), applyResult);
  });

  it("POST rejects an unknown action with a validation envelope", async () => {
    const response = await jsonIntegrityPostResponse(scope, postRequest({ action: "delete-everything" }), capturingDeps());
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "VALIDATION_FAILED");
    assert.ok(typeof body.message === "string" && body.message.length > 0);
  });

  it("POST rejects a malformed body with INVALID_JSON", async () => {
    const response = await jsonIntegrityPostResponse(scope, postRequest("{not json"), capturingDeps());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "INVALID_JSON");
  });

  it("POST passes service conflicts through the error envelope", async () => {
    const deps = capturingDeps({
      apply: async () => {
        throw appError("JSON_INTEGRITY_REPAIR_FAILED", "Manual fix required", 409);
      },
    });
    const response = await jsonIntegrityPostResponse(scope, postRequest({ action: "repair" }), deps);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "JSON_INTEGRITY_REPAIR_FAILED");
  });

  it("the shared default deps wire into the workspace-scoped services", () => {
    assert.equal(typeof jsonIntegrityApiDeps.authorize, "function");
    assert.equal(typeof jsonIntegrityApiDeps.report, "function");
    assert.equal(typeof jsonIntegrityApiDeps.apply, "function");
    assert.equal(typeof jsonIntegrityApiDeps.resolve, "function");
  });
});
