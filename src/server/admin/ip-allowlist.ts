// Transport-level LAN guard for the admin namespace. Infrastructure/proxy rules stay
// the primary boundary (see docs/ADMIN_CONSOLE.md); this module only parses the
// optional ADMIN_ALLOWED_IP_RANGES defence-in-depth setting.
export type AdminIpRange =
  | { kind: "ipv4"; address: number }
  | { kind: "ipv4-cidr"; network: number; maskBits: number }
  | { kind: "literal"; value: string };

export type AdminNetworkDecision = {
  allowed: boolean;
  reason: "disabled" | "allowed" | "not-allowed" | "unknown-client" | "invalid-configuration";
  invalidEntries: string[];
};

const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeClientIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutPort = stripPort(trimmed);
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(withoutPort);
  return (mapped ? mapped[1] : withoutPort).toLowerCase();
}

export function extractClientIp(headerValue: string | null | undefined): string | null {
  const first = headerValue?.split(",")[0];
  return normalizeClientIp(first ?? null);
}

export function parseIpRanges(entries: string[]): { ranges: AdminIpRange[]; invalid: string[] } {
  const ranges: AdminIpRange[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const parsed = parseIpRange(entry);
    if (!parsed) {
      invalid.push(entry);
      continue;
    }
    ranges.push(parsed);
  }
  return { ranges, invalid };
}

export function matchesIpRange(range: AdminIpRange, ip: string): boolean {
  if (range.kind === "literal") return range.value === ip;
  const address = parseIpv4(ip);
  if (address === null) return false;
  if (range.kind === "ipv4") return range.address === address;
  const mask = range.maskBits === 0 ? 0 : (0xffffffff << (32 - range.maskBits)) >>> 0;
  return (address & mask) === (range.network & mask);
}

export function evaluateAdminNetworkAccess(input: { ranges: string[]; clientIp: string | null }): AdminNetworkDecision {
  if (!input.ranges.length) return { allowed: true, reason: "disabled", invalidEntries: [] };

  const { ranges, invalid } = parseIpRanges(input.ranges);
  if (invalid.length) {
    return { allowed: false, reason: "invalid-configuration", invalidEntries: invalid };
  }

  const clientIp = input.clientIp;
  if (!clientIp) return { allowed: false, reason: "unknown-client", invalidEntries: [] };
  const allowed = ranges.some((range) => matchesIpRange(range, clientIp));
  return { allowed, reason: allowed ? "allowed" : "not-allowed", invalidEntries: [] };
}

function parseIpRange(entry: string): AdminIpRange | null {
  const value = entry.trim().toLowerCase();
  if (!value) return null;

  if (value.includes("/")) {
    const [network, maskPart] = value.split("/");
    const address = parseIpv4(network ?? "");
    const maskBits = Number.parseInt(maskPart ?? "", 10);
    if (address === null || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) return null;
    return { kind: "ipv4-cidr", network: address, maskBits };
  }

  const address = parseIpv4(value);
  if (address !== null) return { kind: "ipv4", address };

  // Exact IPv6 literals (for example ::1). IPv6 CIDR ranges are intentionally not
  // parsed here and surface as invalid configuration instead of silently matching.
  if (value.includes(":")) return { kind: "literal", value };
  return null;
}

function parseIpv4(value: string): number | null {
  const match = ipv4Pattern.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => octet > 255)) return null;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1];
  const ipv4WithPort = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/.exec(value);
  if (ipv4WithPort) return ipv4WithPort[1];
  return value;
}