import type {
  EntityReference,
  Portal,
  PortalCapability,
  PortalGrantRecord,
  PortalIdentity,
  PortalMembership,
} from "@/types/domain";
import { findView } from "./views";

/**
 * Deciding whether a portal user may see one record.
 *
 * Every check is a refusal by default. There is no branch here that returns
 * "allowed" without having found a specific, unexpired, unrevoked grant naming
 * that specific record, made by a named person.
 *
 * The function returns a reason on refusal rather than a boolean. That is not
 * for the portal user, who is told nothing beyond "not available": it is for
 * the audit record and for the organisation's own access review, where "why
 * can this funder not see the report we sent them?" needs an answer.
 */

export type AccessRefusal =
  | "portal_closed"
  | "identity_suspended"
  | "membership_revoked"
  | "membership_expired"
  | "capability_missing"
  | "no_grant"
  | "grant_revoked"
  | "grant_expired"
  | "no_view"
  | "wrong_tenant";

export interface AccessDecision {
  allowed: boolean;
  refusal?: AccessRefusal;
  /** For the audit trail and the organisation's access review, never the user. */
  reason?: string;
  /** The grant that permitted it, where one did. */
  grant?: PortalGrantRecord;
  viewKey?: string;
}

const deny = (refusal: AccessRefusal, reason: string): AccessDecision => ({
  allowed: false,
  refusal,
  reason,
});

export interface AccessInput {
  portal: Portal;
  identity: PortalIdentity;
  membership: PortalMembership;
  grants: PortalGrantRecord[];
  entity: EntityReference;
  capability: PortalCapability;
  now: Date;
}

const expired = (value: string | undefined, now: Date): boolean =>
  value !== undefined && Date.parse(value) <= now.getTime();

export function decideAccess(input: AccessInput): AccessDecision {
  const { portal, identity, membership, entity, capability, now } = input;

  /**
   * Tenant first, before anything else is consulted.
   *
   * A portal, an identity and a membership that disagree about which
   * organisation they belong to is not a configuration problem to reconcile;
   * it is the shape of a cross-tenant access attempt, and the only safe
   * response is to stop.
   */
  if (
    identity.organisationId !== portal.organisationId ||
    membership.organisationId !== portal.organisationId ||
    membership.portalId !== portal.id ||
    membership.identityId !== identity.id
  ) {
    return deny(
      "wrong_tenant",
      "The portal, the identity and the membership do not agree on which organisation they belong to.",
    );
  }

  if (portal.status !== "open") {
    return deny("portal_closed", `The ${portal.audience} portal is ${portal.status}.`);
  }
  if (identity.status !== "active") {
    return deny("identity_suspended", `This portal identity is ${identity.status}.`);
  }
  if (membership.revokedAt) {
    return deny(
      "membership_revoked",
      `Access was revoked on ${membership.revokedAt.slice(0, 10)}${membership.revokedReason ? `: ${membership.revokedReason}` : "."}`,
    );
  }
  if (expired(membership.expiresAt, now)) {
    return deny("membership_expired", `Access expired on ${membership.expiresAt!.slice(0, 10)}.`);
  }
  if (!membership.capabilities.includes(capability)) {
    return deny(
      "capability_missing",
      `This membership does not hold ${capability}. It holds ${membership.capabilities.join(", ") || "nothing"}.`,
    );
  }

  /**
   * The rule the brief states directly: *never expose internal organisation
   * data simply because the underlying record is related.*
   *
   * There is no traversal here. A funder who can see a grant does not thereby
   * see the evidence linked to it; reaching a second record needs a second
   * grant, and somebody had to make it.
   */
  const grant = input.grants.find(
    (candidate) =>
      candidate.membershipId === membership.id &&
      candidate.organisationId === portal.organisationId &&
      candidate.entity.type === entity.type &&
      candidate.entity.id === entity.id,
  );
  if (!grant) {
    return deny(
      "no_grant",
      `Nothing grants this membership access to ${entity.type} ${entity.id}. Access is granted per record, never inherited from a related one.`,
    );
  }
  if (grant.revokedAt) {
    return deny("grant_revoked", `This record was unshared on ${grant.revokedAt.slice(0, 10)}.`);
  }
  if (expired(grant.expiresAt, now)) {
    return deny("grant_expired", `Access to this record expired on ${grant.expiresAt!.slice(0, 10)}.`);
  }

  const view = findView(grant.viewKey);
  if (!view) {
    // A grant naming a view that does not exist cannot be projected, and
    // returning the record unprojected would be the worst possible fallback.
    return deny(
      "no_view",
      `The grant names view "${grant.viewKey}", which does not exist. Nothing can be projected safely.`,
    );
  }
  if (view.audience !== portal.audience) {
    return deny(
      "no_view",
      `View "${grant.viewKey}" belongs to the ${view.audience} portal, not the ${portal.audience} one.`,
    );
  }
  if (view.entityType !== entity.type) {
    return deny(
      "no_view",
      `View "${grant.viewKey}" projects a ${view.entityType}, not a ${entity.type}.`,
    );
  }

  return { allowed: true, grant, viewKey: grant.viewKey };
}

/**
 * Everything a membership can currently reach.
 *
 * Used by the portal's own index and by the organisation's access review. The
 * second is the more important: "what has this funder got access to?" is a
 * question somebody should be able to answer in one screen, and if it takes a
 * traversal to work out, nobody will check.
 */
export function reachableRecords(
  grants: PortalGrantRecord[],
  membership: PortalMembership,
  now: Date,
): PortalGrantRecord[] {
  return grants.filter(
    (grant) =>
      grant.membershipId === membership.id &&
      !grant.revokedAt &&
      !expired(grant.expiresAt, now) &&
      findView(grant.viewKey) !== undefined,
  );
}

/** The capabilities an audience may ever be given. Closed per audience. */
export const AUDIENCE_CAPABILITIES: Record<Portal["audience"], PortalCapability[]> = {
  funder: ["portal:view", "portal:download", "portal:message"],
  // A beneficiary submits and messages, and downloads nothing: a download is a
  // file leaving the organisation's control, and the beneficiary surface is
  // the one where that matters most.
  beneficiary: ["portal:view", "portal:submit", "portal:message"],
  volunteer: ["portal:view", "portal:submit", "portal:message"],
  partner: ["portal:view", "portal:download", "portal:submit", "portal:message"],
  // The only audience that may approve, and the restriction that makes it safe
  // is the one already in the permission model: approving is not editing.
  trustee: ["portal:view", "portal:download", "portal:message", "portal:approve"],
  applicant: ["portal:view", "portal:submit", "portal:message"],
};

/**
 * Whether a capability may be granted to this audience at all.
 *
 * Checked when a membership is created, so a misconfiguration is refused at
 * the point somebody makes it rather than discovered when a beneficiary
 * downloads a board pack.
 */
export function capabilityPermitted(
  audience: Portal["audience"],
  capability: PortalCapability,
): boolean {
  return AUDIENCE_CAPABILITIES[audience].includes(capability);
}
