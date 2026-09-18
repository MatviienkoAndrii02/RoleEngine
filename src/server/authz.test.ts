import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/server/errors";
import { assertWorkspaceRoleMembership } from "@/server/authz";

describe("authz scope guards", () => {
  it("rejects a membership from a different workspace", () => {
    assert.throws(() => assertWorkspaceRoleMembership("workspace_a", null, ["OWNER", "GM"]), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    });

    assert.throws(() => assertWorkspaceRoleMembership("workspace_a", { workspaceId: "workspace_b", role: "GM", workspace: { archivedAt: null } }, ["OWNER", "GM"]), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    });
  });

  it("allows GM access when workspace membership matches the target workspace", () => {
    const membership = assertWorkspaceRoleMembership("workspace_a", { workspaceId: "workspace_a", role: "GM", workspace: { archivedAt: null } }, ["OWNER", "GM"]);
    assert.equal(membership.role, "GM");
    assert.equal(membership.workspaceId, "workspace_a");
  });
});
