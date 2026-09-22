import { appError } from "@/server/errors";

// Public exposure of /admin and /admin-api means a browser can be tricked into sending a
// cross-site request that carries the admin session cookie. Session cookies are SameSite=Lax,
// so the cookie is normally withheld; this guard adds the transport-level check that only
// same-origin browser requests may mutate admin state.
export type AdminOriginReason = "safe-method" | "same-origin" | "cross-site" | "origin-mismatch" | "non-browser-client";

export type AdminOriginDecision = {
  allowed: boolean;
  reason: AdminOriginReason;
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function evaluateAdminRequestOrigin(input: {
  method: string;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
}): AdminOriginDecision {
  if (safeMethods.has(input.method.toUpperCase())) return { allowed: true, reason: "safe-method" };

  const secFetchSite = input.secFetchSite?.trim().toLowerCase();
  if (secFetchSite && secFetchSite !== "same-origin") return { allowed: false, reason: "cross-site" };

  const origin = input.origin?.trim();
  if (!origin) {
    // Non-browser clients (scripts, monitoring) send neither Origin nor Sec-Fetch-Site and
    // still need a valid admin session, so they are not a cross-site browser attack.
    return { allowed: true, reason: "non-browser-client" };
  }

  const originHost = readHost(origin);
  const requestHost = input.host?.trim().toLowerCase();
  if (!originHost || !requestHost || originHost !== requestHost) return { allowed: false, reason: "origin-mismatch" };
  // Only the host is compared on purpose: behind a TLS-terminating proxy the app can see the
  // request as http while the browser origin stays https, so requiring an exact scheme match
  // would reject the legitimate console request.
  return { allowed: true, reason: "same-origin" };
}

export function assertAdminMutationOrigin(request: Request): void {
  const decision = evaluateAdminRequestOrigin({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host") ?? readHost(request.url),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
  if (decision.allowed) return;
  throw appError("ADMIN_ORIGIN_NOT_ALLOWED", "Cross-site admin request was rejected", 403, { reason: decision.reason });
}

function readHost(value: string): string | null {
  try {
    const host = new URL(value).host.toLowerCase();
    return host.length ? host : null;
  } catch {
    return null;
  }
}