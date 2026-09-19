import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appError } from "@/server/errors";
import { deleteTemplateNodeRoute, patchTemplateNodeRoute } from "./node-route-handlers";

describe("template node API route", () => {
  it("returns a forbidden envelope for patch failures", async () => {
    const request = new Request("http://localhost/api/templates/tpl_1/nodes/node_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    const response = await patchTemplateNodeRoute(request, { params: Promise.resolve({ templateId: "tpl_1", nodeId: "node_1" }) }, {
      updateTemplateNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
      },
      deleteTemplateNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { templateId: "tpl_1" },
    });
  });

  it("returns a forbidden envelope for delete failures", async () => {
    const response = await deleteTemplateNodeRoute(new Request("http://localhost/api/templates/tpl_1/nodes/node_1", { method: "DELETE" }), {
      params: Promise.resolve({ templateId: "tpl_1", nodeId: "node_1" }),
    }, {
      updateTemplateNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
      },
      deleteTemplateNode: async () => {
        throw appError("FORBIDDEN", "No access", 403, { templateId: "tpl_1" });
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "FORBIDDEN",
      message: "No access",
      details: { templateId: "tpl_1" },
    });
  });
});
