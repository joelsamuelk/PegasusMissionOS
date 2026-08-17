import type { MemberRole } from "@/types/domain";

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
 * This is the authentication seam. Today Mission OS has no auth, so every
 * request resolves to the seeded Northstar owner. When Supabase Auth lands
 * (Phase 1B) this function resolves the session, looks up the caller's active
 * membership, and returns their real organisation and role. Nothing else in
 * the application needs to change, because everything already depends on the
 * context rather than on store constants.
 */
export const DEMO_ORGANISATION_ID = "org-northstar";
export const DEMO_USER_ID = "user-amara";

/** The demo workspace's fixed "today", so seeded deadlines stay meaningful. */
export const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export async function resolveRequestContext(): Promise<RequestContext> {
  return createRequestContext({
    organisationId: DEMO_ORGANISATION_ID,
    userId: DEMO_USER_ID,
    role: "owner",
    now: () => DEMO_NOW,
  });
}
