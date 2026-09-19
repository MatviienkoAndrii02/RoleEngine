import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appError } from "@/server/errors";
import { deleteCharacterNodeRoute, patchCharacterNodeRoute } from "@/app/api/characters/[characterId]/nodes/[nodeId]/route";
import { deleteTemplateNodeRoute, patchTemplateNodeRoute } from "@/app/api/templates/[templateId]/nodes/[nodeId]/route";

describe("api route authorization envelope", () => {
  it("forbidden patch/delete on character node routes returns the API envelope", async () => {
    const patchResponse = await patchCharacterNodeRoute(
      new Request("http://localhost/api/characters/char_1/nodes/node_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ characterId: "char_1", nodeId: "node_1" }) },
      {
        updateCharacterNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
        },
        deleteCharacterNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
        },
      },
    );

    assert.equal(patchResponse.status, 403);
    assert.deepEqual(await patchResponse.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { characterId: "char_1" },
    });

    const deleteResponse = await deleteCharacterNodeRoute(
      new Request("http://localhost/api/characters/char_1/nodes/node_1", { method: "DELETE" }),
      { params: Promise.resolve({ characterId: "char_1", nodeId: "node_1" }) },
      {
        updateCharacterNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
        },
        deleteCharacterNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { characterId: "char_1" });
        },
      },
    );

    assert.equal(deleteResponse.status, 403);
    assert.deepEqual(await deleteResponse.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { characterId: "char_1" },
    });
  });

  it("forbidden patch/delete on template node routes returns the API envelope", async () => {
    const patchResponse = await patchTemplateNodeRoute(
      new Request("http://localhost/api/templates/tpl_1/nodes/node_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ templateId: "tpl_1", nodeId: "node_1" }) },
      {
        updateTemplateNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
        },
        deleteTemplateNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
        },
      },
    );

    assert.equal(patchResponse.status, 403);
    assert.deepEqual(await patchResponse.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { templateId: "tpl_1" },
    });

    const deleteResponse = await deleteTemplateNodeRoute(
      new Request("http://localhost/api/templates/tpl_1/nodes/node_1", { method: "DELETE" }),
      { params: Promise.resolve({ templateId: "tpl_1", nodeId: "node_1" }) },
      {
        updateTemplateNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
        },
        deleteTemplateNode: async () => {
          throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
        },
      },
    );

    assert.equal(deleteResponse.status, 403);
    assert.deepEqual(await deleteResponse.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { templateId: "tpl_1" },
    });
  });
});
