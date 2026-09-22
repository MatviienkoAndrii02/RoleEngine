import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/server/errors";
import { assertAdminMutationOrigin, evaluateAdminRequestOrigin } from "@/server/admin/origin-guard";

describe("admin request origin guard", () => {
  it("allows safe methods regardless of origin", () => {
    const decision = evaluateAdminRequestOrigin({
      method: "GET",
      origin: "https://evil.example",
      host: "roleengine.ddns.org",
      secFetchSite: "cross-site",
    });
    assert.deepEqual(decision, { allowed: true, reason: "safe-method" });
  });

  it("allows a same-origin browser mutation", () => {
    const decision = evaluateAdminRequestOrigin({
      method: "POST",
      origin: "https://roleengine.ddns.org",
      host: "roleengine.ddns.org",
      secFetchSite: "same-origin",
    });
    assert.deepEqual(decision, { allowed: true, reason: "same-origin" });
  });

  it("allows a non-browser client that already carries an admin session", () => {
    const decision = evaluateAdminRequestOrigin({
      method: "DELETE",
      origin: null,
      host: "127.0.0.1:3000",
      secFetchSite: null,
    });
    assert.deepEqual(decision, { allowed: true, reason: "non-browser-client" });
  });

  it("rejects a cross-site browser mutation even when a cookie could be attached", () => {
    const crossSite = evaluateAdminRequestOrigin({
      method: "POST",
      origin: "https://evil.example",
      host: "roleengine.ddns.org",
      secFetchSite: "cross-site",
    });
    assert.equal(crossSite.allowed, false);
    assert.equal(crossSite.reason, "cross-site");

    const mismatchedOrigin = evaluateAdminRequestOrigin({
      method: "POST",
      origin: "https://evil.example",
      host: "roleengine.ddns.org",
      secFetchSite: null,
    });
    assert.equal(mismatchedOrigin.allowed, false);
    assert.equal(mismatchedOrigin.reason, "origin-mismatch");
  });

  it("rejects a different host, including a sibling admin subdomain", () => {
    for (const origin of ["https://admin.roleengine.ddns.org", "https://evil.example", "https://roleengine.ddns.org.evil.example", "not a url"]) {
      const decision = evaluateAdminRequestOrigin({
        method: "POST",
        origin,
        host: "roleengine.ddns.org",
        secFetchSite: null,
      });
      assert.equal(decision.allowed, false, `${origin} must not be accepted`);
      assert.equal(decision.reason, "origin-mismatch");
    }
  });

  it("accepts a same-host origin when only the scheme differs (TLS terminated at the proxy)", () => {
    const decision = evaluateAdminRequestOrigin({
      method: "POST",
      origin: "https://roleengine.ddns.org",
      host: "roleengine.ddns.org",
      secFetchSite: "same-origin",
    });
    assert.equal(decision.allowed, true);
  });

  it("throws the FORBIDDEN envelope with the reason for rejected requests", () => {
    const request = new Request("https://roleengine.ddns.org/admin-api/backups", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "roleengine.ddns.org" },
    });
    assert.throws(() => assertAdminMutationOrigin(request), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "ADMIN_ORIGIN_NOT_ALLOWED");
      assert.equal(error.status, 403);
      assert.deepEqual(error.details, { reason: "origin-mismatch" });
      return true;
    });
  });

  it("accepts a same-origin request through the Request-based entry point", () => {
    const request = new Request("https://roleengine.ddns.org/admin-api/backups", {
      method: "POST",
      headers: { origin: "https://roleengine.ddns.org", host: "roleengine.ddns.org" },
    });
    assert.doesNotThrow(() => assertAdminMutationOrigin(request));
  });

  it("accepts the same-origin request on a LAN address and port", () => {
    const request = new Request("http://192.168.1.50:3000/admin-api/backups", {
      method: "DELETE",
      headers: { origin: "http://192.168.1.50:3000", host: "192.168.1.50:3000" },
    });
    assert.doesNotThrow(() => assertAdminMutationOrigin(request));
  });
});