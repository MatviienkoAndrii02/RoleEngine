import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appError } from "@/server/errors";
import { deleteCharacterNodeRoute, patchCharacterNodeRoute } from "./route";

describe("character node API route", () => {
  it("returns a forbidden envelope for patch failures", async () => {
    const request = new Request("http://localhost/api/characters/char_1/nodes/node_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    const response = await patchCharacterNodeRoute(request, { params: Promise.resolve({ characterId: "char_1", nodeId: "node_1" }) }, {
      updateCharacterNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
      },
      deleteCharacterNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { characterId: "char_1" },
    });
  });

  it("returns a forbidden envelope for delete failures", async () => {
    const response = await deleteCharacterNodeRoute(new Request("http://localhost/api/characters/char_1/nodes/node_1", { method: "DELETE" }), {
      params: Promise.resolve({ characterId: "char_1", nodeId: "node_1" }),
    }, {
      updateCharacterNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
      },
      deleteCharacterNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { characterId: "char_1" },
    });
  });
});
