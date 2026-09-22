import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAdminNetworkAccess,
  extractClientIp,
  matchesIpRange,
  normalizeClientIp,
  parseIpRanges,
} from "@/server/admin/ip-allowlist";

describe("admin network guard", () => {
  it("stays disabled when no range is configured", () => {
    assert.deepEqual(evaluateAdminNetworkAccess({ ranges: [], clientIp: null }), {
      allowed: true,
      reason: "disabled",
      invalidEntries: [],
    });
  });

  it("matches exact IPv4 addresses and CIDR ranges", () => {
    assert.equal(matchesIpRange({ kind: "ipv4", address: 0x7f000001 }, "127.0.0.1"), true);
    assert.equal(matchesIpRange({ kind: "ipv4", address: 0x7f000001 }, "127.0.0.2"), false);

    const { ranges, invalid } = parseIpRanges(["192.168.0.0/16"]);
    assert.deepEqual(invalid, []);
    assert.equal(ranges.length, 1);
    assert.equal(matchesIpRange(ranges[0], "192.168.5.20"), true);
    assert.equal(matchesIpRange(ranges[0], "192.169.5.20"), false);
  });

  it("supports loopback IPv6 literals and normalizes mapped addresses", () => {
    assert.equal(normalizeClientIp("::ffff:127.0.0.1"), "127.0.0.1");
    assert.equal(normalizeClientIp("[::1]:443"), "::1");
    assert.equal(normalizeClientIp("192.168.1.10:51234"), "192.168.1.10");

    const { ranges } = parseIpRanges(["::1", "10.0.0.0/8"]);
    assert.equal(ranges.length, 2);
    assert.equal(matchesIpRange(ranges[0], "::1"), true);
    assert.equal(matchesIpRange(ranges[1], "10.4.4.4"), true);
  });

  it("fails closed for unusable configuration and unknown client addresses", () => {
    const invalidConfiguration = evaluateAdminNetworkAccess({ ranges: ["fd00::/8"], clientIp: "10.0.0.1" });
    assert.equal(invalidConfiguration.allowed, false);
    assert.equal(invalidConfiguration.reason, "invalid-configuration");
    assert.deepEqual(invalidConfiguration.invalidEntries, ["fd00::/8"]);

    const unknownClient = evaluateAdminNetworkAccess({ ranges: ["10.0.0.0/8"], clientIp: null });
    assert.equal(unknownClient.allowed, false);
    assert.equal(unknownClient.reason, "unknown-client");
  });

  it("rejects a client outside the configured ranges", () => {
    const decision = evaluateAdminNetworkAccess({ ranges: ["10.0.0.0/8"], clientIp: extractClientIp("203.0.113.7, 10.0.0.5") });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "not-allowed");
  });

  it("uses the first forwarded address, not a client-controlled later entry", () => {
    assert.equal(extractClientIp("10.0.0.5, 192.168.1.1"), "10.0.0.5");
    assert.equal(extractClientIp(null), null);
    assert.equal(extractClientIp(""), null);
  });
});