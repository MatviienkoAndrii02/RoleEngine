import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "@/server/errors";
import { isPlatformAdminAccount, matchesAdminIdentifier, requirePlatformAdmin } from "@/server/admin/authz";

const originalAccounts = process.env.ADMIN_ACCOUNTS;
const originalRanges = process.env.ADMIN_ALLOWED_IP_RANGES;

describe("admin console authorization", () => {
  afterEach(() => {
    setEnvironment("ADMIN_ACCOUNTS", originalAccounts);
    setEnvironment("ADMIN_ALLOWED_IP_RANGES", originalRanges);
  });

  it("accepts only identifiers listed in ADMIN_ACCOUNTS", () => {
    process.env.ADMIN_ACCOUNTS = " Owner@Example.com , admin-account-id ";
    assert.equal(isPlatformAdminAccount({ id: "admin-account-id", email: null }), true);
    assert.equal(isPlatformAdminAccount({ id: "someone", email: "owner@example.com" }), true);
    assert.equal(isPlatformAdminAccount({ id: "someone", email: "player@example.com" }), false);
    assert.equal(isPlatformAdminAccount({ id: "someone", email: null }), false);
  });

  it("fails closed when no admin account is configured", () => {
    delete process.env.ADMIN_ACCOUNTS;
    assert.equal(isPlatformAdminAccount({ id: "admin-account-id", email: "owner@example.com" }), false);
    assert.equal(matchesAdminIdentifier([], ["admin-account-id"]), false);
  });

  it("returns 401 without a session and 403 for a non-admin account", async () => {
    process.env.ADMIN_ACCOUNTS = "owner@example.com";
    await assert.rejects(() => requirePlatformAdmin(null), isAppError("UNAUTHORIZED", 401));
    await assert.rejects(
      () => requirePlatformAdmin({ user: { id: "player-id", email: "player@example.com" } }),
      isAppError("FORBIDDEN", 403),
    );
  });

  it("allows a configured account", async () => {
    process.env.ADMIN_ACCOUNTS = "owner@example.com";
    const actor = await requirePlatformAdmin({ user: { id: "owner-id", email: "owner@example.com" } });
    assert.deepEqual(actor, { id: "owner-id", email: "owner@example.com" });
  });

  it("blocks requests outside ADMIN_ALLOWED_IP_RANGES before checking permissions", async () => {
    process.env.ADMIN_ACCOUNTS = "owner@example.com";
    process.env.ADMIN_ALLOWED_IP_RANGES = "10.0.0.0/8";
    // A test process has no transport headers, so the guard has to fail closed.
    await assert.rejects(
      () => requirePlatformAdmin({ user: { id: "owner-id", email: "owner@example.com" } }),
      isAppError("ADMIN_NETWORK_RESTRICTED", 403),
    );
  });
});

function isAppError(code: string, status: number) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  };
}

function setEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}