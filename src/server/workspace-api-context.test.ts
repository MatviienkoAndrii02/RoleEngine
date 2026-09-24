import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("workspace scoped API routing", () => {
  it("rewrites the scoped URL and forwards the workspace as request context", () => {
    const request = new NextRequest("http://localhost/api/workspaces/workspace_a/characters/character_1/nodes");
    const response = middleware(request);

    assert.equal(response.headers.get("x-middleware-rewrite"), "http://localhost/api/characters/character_1/nodes");
    assert.equal(response.headers.get("x-middleware-request-x-role-engine-workspace-id"), "workspace_a");
  });

  it("does not treat paths without a resource endpoint as scoped API calls", () => {
    const request = new NextRequest("http://localhost/api/workspaces/workspace_a");
    const response = middleware(request);
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
  });

  it("forwards the workspace from canonical page URLs to server components", () => {
    const request = new NextRequest("http://localhost/workspaces/workspace_a/characters/character_1");
    const response = middleware(request);
    assert.equal(response.headers.get("x-middleware-request-x-role-engine-workspace-id"), "workspace_a");
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
  });
});
