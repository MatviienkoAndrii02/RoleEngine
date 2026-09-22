import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { appError, forbidden, unauthorized } from "@/server/errors";
import { getAdminAccountIdentifiers, getAdminAllowedNetworkRanges, getAdminIpHeaderName } from "@/server/admin/config";
import { evaluateAdminNetworkAccess, extractClientIp, type AdminNetworkDecision } from "@/server/admin/ip-allowlist";

export type AdminActor = { id: string; email: string | null };

type SessionLike = { user?: { id: string; email?: string | null } | null } | null;

export function matchesAdminIdentifier(identifiers: string[], candidates: Array<string | null | undefined>): boolean {
  const allowed = new Set(identifiers.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0));
  if (!allowed.size) return false;
  return candidates.some((candidate) => Boolean(candidate && allowed.has(candidate.trim().toLowerCase())));
}

// Platform admin permission is intentionally not a workspace role: workspace
// OWNER/GM/PLAYER describe product access only and must never grant ops access.
export function isPlatformAdminAccount(account: { id: string; email?: string | null }): boolean {
  return matchesAdminIdentifier(getAdminAccountIdentifiers(), [account.id, account.email ?? null]);
}

export async function checkAdminNetworkAccess(): Promise<AdminNetworkDecision> {
  return evaluateAdminNetworkAccess({
    ranges: getAdminAllowedNetworkRanges(),
    clientIp: extractClientIp(await readAdminIpHeader()),
  });
}

export async function requirePlatformAdmin(sessionOverride?: SessionLike): Promise<AdminActor> {
  const decision = await checkAdminNetworkAccess();
  if (!decision.allowed) {
    throw appError("ADMIN_NETWORK_RESTRICTED", "Admin Console is not reachable from this network", 403, {
      reason: decision.reason,
      invalidEntries: decision.invalidEntries,
    });
  }

  const session = sessionOverride === undefined ? await auth() : sessionOverride;
  const userId = session?.user?.id;
  if (!userId) throw unauthorized();

  const account: AdminActor = { id: userId, email: session?.user?.email ?? null };
  if (!isPlatformAdminAccount(account)) throw forbidden();
  return account;
}

// Pages never render "access denied" content: unauthenticated visitors are sent to
// login and authenticated non-admins get a 404, so the console stays undiscoverable.
export async function requirePagePlatformAdmin(callbackUrl: string): Promise<AdminActor> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);

  const decision = await checkAdminNetworkAccess();
  if (!decision.allowed) notFound();

  const account: AdminActor = { id: userId, email: session?.user?.email ?? null };
  if (!isPlatformAdminAccount(account)) notFound();
  return account;
}

async function readAdminIpHeader(): Promise<string | null> {
  try {
    const headerStore = await headers();
    return headerStore.get(getAdminIpHeaderName());
  } catch {
    // Outside a Next.js request scope (integration scripts, unit tests) there are no
    // transport headers. The guard then fails closed whenever an allowlist is set.
    return null;
  }
}