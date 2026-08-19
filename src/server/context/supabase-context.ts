import type { MemberRole } from "@/types/domain";
import { createAnonClient } from "@/server/data/supabase/client";
import { createRequestContext, type RequestContext } from "./request-context";

/**
 * Resolve the request context from a Supabase session.
 *
 * This is the seam `resolveRequestContext` was built around. Nothing else in
 * the application changes when it becomes the live path: every caller already
 * depends on the context rather than on module constants.
 *
 * Three rules, each of which has a failure mode worth naming:
 *
 * 1. **No session means no context.** Returning a default identity is how a
 *    product ends up serving one tenant's data to an anonymous caller.
 * 2. **Membership is what grants access, not authentication.** A valid Supabase
 *    user with no active membership of the requested organisation gets nothing.
 *    Being logged in is not being a member.
 * 3. **The role comes from the membership row**, never from a claim the client
 *    supplies. A JWT the browser can influence must not decide capabilities.
 */

export class NotAuthenticatedError extends Error {
  constructor() {
    super("No active session.");
    this.name = "NotAuthenticatedError";
  }
}

export class NoMembershipError extends Error {
  constructor(userId: string) {
    super(`User ${userId} has no active organisation membership.`);
    this.name = "NoMembershipError";
  }
}

interface MembershipRow {
  organisation_id: string;
  role: MemberRole;
}

/**
 * @param organisationId Optional. When a user belongs to several organisations
 * the caller selects one — typically from a workspace switcher. The membership
 * lookup still decides whether it is allowed, so an arbitrary id supplied by a
 * client resolves to nothing rather than to access.
 */
export async function resolveSupabaseRequestContext(
  organisationId?: string,
): Promise<RequestContext> {
  const supabase = await createAnonClient();

  // `getUser` re-validates against the auth server. `getSession` reads the
  // cookie and trusts it, which is not good enough to derive authorisation.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new NotAuthenticatedError();

  let query = supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (organisationId) query = query.eq("organisation_id", organisationId);

  // Deterministic pick when no organisation was requested and the user belongs
  // to several: oldest membership wins. Arbitrary ordering here would make a
  // user's default workspace change between requests.
  const { data, error: membershipError } = await query
    .order("joined_at", { ascending: true })
    .limit(1);

  if (membershipError) {
    throw new Error(`Could not resolve membership: ${membershipError.message}`);
  }

  const membership = (data as MembershipRow[] | null)?.[0];
  if (!membership) throw new NoMembershipError(user.id);

  return createRequestContext({
    organisationId: membership.organisation_id,
    userId: user.id,
    role: membership.role,
    // Real clock: unlike the demo path, live requests must order correctly in
    // the audit ledger.
  });
}
