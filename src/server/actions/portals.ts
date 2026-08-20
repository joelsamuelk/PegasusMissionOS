"use server";

import { revalidatePath } from "next/cache";
import type {
  EntityReference,
  Portal,
  PortalCapability,
  PortalGrantRecord,
  PortalIdentity,
  PortalMembership,
  ProjectedRecord,
} from "@/types/domain";
import { getRepository } from "@/server/data";
import { authorise, ok, type ActionResult } from "./authorise";

/**
 * Portal management, from the organisation's side.
 *
 * Gated on `org:manage_settings`, and that is deliberately blunt. Sharing a
 * record outside the organisation is not an editorial act in whichever domain
 * the record belongs to — it is a decision about who sees the organisation's
 * information, and the same person should be making all of them. A model where
 * `programmes:manage` could share a programme externally would spread that
 * decision across six roles and make the access review meaningless.
 *
 * Reading the review needs only `read`: everybody should be able to see what
 * has been shared, and a control nobody can inspect is not a control.
 */

export interface AccessReviewEntry {
  portal: Portal;
  identity: PortalIdentity;
  membership: PortalMembership;
  grants: PortalGrantRecord[];
}

export interface AccessReviewResult {
  ok: boolean;
  entries?: AccessReviewEntry[];
  error?: string;
}

/**
 * Who can see what, in one place.
 *
 * The most important screen in this phase and the least glamorous. "What has
 * this funder got access to?" must be answerable without a traversal, because
 * if it takes one, nobody will check.
 */
export async function loadAccessReview(): Promise<AccessReviewResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const [portals, identities, memberships] = await Promise.all([
    repo.portals.list(auth.ctx),
    repo.portals.identities(auth.ctx),
    repo.portals.memberships(auth.ctx),
  ]);

  const portalById = new Map(portals.map((portal) => [portal.id, portal]));
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));

  const entries: AccessReviewEntry[] = [];
  for (const membership of memberships) {
    const portal = portalById.get(membership.portalId);
    const identity = identityById.get(membership.identityId);
    if (!portal || !identity) continue;
    entries.push({
      portal,
      identity,
      membership,
      grants: await repo.portals.grantsFor(auth.ctx, membership.id),
    });
  }

  return { ok: true, entries };
}

export interface ShareResult extends ActionResult {
  grantId?: string;
}

export async function shareRecord(input: {
  membershipId: string;
  entity: EntityReference;
  reason?: string;
  expiresAt?: string;
}): Promise<ShareResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  const grantId = await getRepository().portals.share(auth.ctx, input);
  if (!grantId) {
    return {
      ok: false,
      message:
        "That record cannot be shared with this portal. Either it does not exist here, or this audience has no view for that kind of record.",
    };
  }
  revalidatePath("/portals");
  return { ...ok, grantId };
}

export async function unshareRecord(grantId: string): Promise<ActionResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;
  await getRepository().portals.unshare(auth.ctx, grantId);
  revalidatePath("/portals");
  return ok;
}

export async function revokePortalAccess(
  membershipId: string,
  reason: string,
): Promise<ActionResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;
  if (!reason.trim()) {
    return { ok: false, message: "Say why. Revoking access without a reason is not auditable." };
  }
  await getRepository().portals.revokeMembership(auth.ctx, membershipId, reason);
  revalidatePath("/portals");
  return ok;
}

export interface InviteResult extends ActionResult {
  membershipId?: string;
}

export async function invitePortalUser(input: {
  portalId: string;
  email: string;
  displayName: string;
  capabilities: PortalCapability[];
}): Promise<InviteResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  const result = await getRepository().portals.invite(auth.ctx, input);
  if (!result) {
    return {
      ok: false,
      message:
        "That invitation was refused. One of the capabilities is not available to this audience.",
    };
  }
  revalidatePath("/portals");
  return { ...ok, membershipId: result.membershipId };
}

export interface PreviewResult {
  ok: boolean;
  records?: ProjectedRecord[];
  error?: string;
}

/**
 * See exactly what a portal user sees.
 *
 * Not a debugging tool. An organisation cannot govern a sharing decision it
 * cannot inspect, and "what does this funder actually see?" is a question that
 * should be answerable in one click rather than by signing in as somebody
 * else. It runs the real access and projection path, so a preview that showed
 * something the portal does not would be a bug in the preview.
 */
export async function previewPortal(slug: string, email: string): Promise<PreviewResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const portal = await repo.portalAccess.resolvePortal(slug);
  // Confirm the portal belongs to the caller's organisation before previewing
  // it. The portal path is unscoped by necessity; this entry point is not.
  if (!portal || portal.organisationId !== auth.ctx.organisationId) {
    return { ok: false, error: "That portal is not available." };
  }

  return { ok: true, records: await repo.portalAccess.index(slug, email) };
}
