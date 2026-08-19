import type { MemberRole } from "@/types/domain";
import { appConfig } from "@/lib/config";

/**
 * The identity and clock for a single request.
 *
 * Before this existed, the organisation and acting user were module constants
 * in the in-memory store, which made multi-tenancy impossible and froze every
 * audit timestamp to the same value. Every data-layer call now requires a
 * context, so tenant scoping is a type-level obligation rather than a
 * convention someone has to remember.
 */
export interface RequestContext {
  /** The tenant every query and mutation is scoped to. */
  organisationId: string;
  /** The acting user, recorded on audit and activity records. */
  userId: string;
  /** The acting user's role in this organisation. */
  role: MemberRole;
  /** Injectable clock. Tests pin this; production uses the system clock. */
  now(): Date;
}

export function systemClock(): Date {
  return new Date();
}

/** Build a context explicitly. Used by tests and by the auth resolver below. */
export function createRequestContext(init: {
  organisationId: string;
  userId: string;
  role: MemberRole;
  now?: () => Date;
}): RequestContext {
  const clock = init.now ?? systemClock;
  return {
    organisationId: init.organisationId,
    userId: init.userId,
    role: init.role,
    now: clock,
  };
}

/**
 * The demo workspace identity.
 *
 * Used when no Supabase project is configured. Every request resolves to the
 * seeded Northstar owner, which is why the demo can be explored without signing
 * in — and why this path must never be reachable once real data exists.
 */
export const DEMO_ORGANISATION_ID = "org-northstar";
export const DEMO_USER_ID = "user-amara";

/** The demo workspace's fixed "today", so seeded deadlines stay meaningful. */
export const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export function createDemoContext(): RequestContext {
  return createRequestContext({
    organisationId: DEMO_ORGANISATION_ID,
    userId: DEMO_USER_ID,
    role: "owner",
    now: () => DEMO_NOW,
  });
}

/**
 * Resolve the identity for this request.
 *
 * The authentication seam. Which resolver runs is decided by configuration, not
 * by the caller: with Supabase configured the session and membership decide the
 * organisation and role, and without it the demo identity applies.
 *
 * **The demo identity is an owner of a seeded workspace**, so a deployment that
 * has real data but loses its Supabase configuration would fall back to it. The
 * import is therefore dynamic and guarded on configuration rather than wrapped
 * in a try/catch: an auth failure must surface as an error, never as a silent
 * downgrade to the demo owner.
 */
export async function resolveRequestContext(
  organisationId?: string,
): Promise<RequestContext> {
  if (appConfig.isMockData) return createDemoContext();

  const { resolveSupabaseRequestContext } = await import("./supabase-context");
  return resolveSupabaseRequestContext(organisationId);
}
