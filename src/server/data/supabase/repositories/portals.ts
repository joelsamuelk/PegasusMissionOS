import { capabilityPermitted } from "@/lib/portals/access";
import { findView, viewForEntity } from "@/lib/portals/views";
import type {
  EntityReference,
  Portal,
  PortalCapability,
  PortalGrantRecord,
  PortalIdentity,
  PortalMembership,
  PortalMessage,
  PortalSubmission,
} from "@/types/domain";
import type { PortalRepository } from "../../types";
import { ENTITY_TABLES } from "../entity-tables";
import { arrayFrom, auditFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

export function mapPortal(row: Row): Portal {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    audience: row.audience as Portal["audience"],
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    status: row.status as Portal["status"],
    slug: String(row.slug),
    ...(row.welcome_message ? { welcomeMessage: String(row.welcome_message) } : {}),
    // A person, never a shared inbox alias.
    ...(row.contact_user_id ? { contactUserId: String(row.contact_user_id) } : {}),
    audit: auditFrom(row),
  };
}

export function mapIdentity(row: Row): PortalIdentity {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    email: String(row.email),
    displayName: String(row.display_name),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    status: row.status as PortalIdentity["status"],
    invitedAt: String(row.invited_at),
    ...(row.last_seen_at ? { lastSeenAt: String(row.last_seen_at) } : {}),
    audit: auditFrom(row),
  };
}

export function mapMembership(row: Row): PortalMembership {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    portalId: String(row.portal_id),
    identityId: String(row.identity_id),
    capabilities: arrayFrom(row.capabilities) as PortalCapability[],
    // Absent means indefinite. A dated grant is the safer default, which is
    // why the column is nullable rather than defaulted to a far future.
    ...(row.expires_at ? { expiresAt: String(row.expires_at) } : {}),
    ...(row.invited_by ? { invitedBy: String(row.invited_by) } : {}),
    ...(row.revoked_at ? { revokedAt: String(row.revoked_at) } : {}),
    ...(row.revoked_reason ? { revokedReason: String(row.revoked_reason) } : {}),
    audit: auditFrom(row),
  };
}

export function mapGrant(row: Row): PortalGrantRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    membershipId: String(row.membership_id),
    entity: { type: row.entity_type as EntityReference["type"], id: String(row.entity_id) },
    // Decides the fields, not merely the access.
    viewKey: String(row.view_key),
    grantedBy: String(row.granted_by),
    grantedAt: String(row.granted_at),
    ...(row.reason ? { reason: String(row.reason) } : {}),
    ...(row.expires_at ? { expiresAt: String(row.expires_at) } : {}),
    ...(row.revoked_at ? { revokedAt: String(row.revoked_at) } : {}),
  };
}

export function mapSubmission(row: Row): PortalSubmission {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    portalId: String(row.portal_id),
    membershipId: String(row.membership_id),
    kind: row.kind as PortalSubmission["kind"],
    ...(row.subject_type && row.subject_id
      ? {
          subject: {
            type: row.subject_type as EntityReference["type"],
            id: String(row.subject_id),
          },
        }
      : {}),
    ...(row.form_submission_id ? { formSubmissionId: String(row.form_submission_id) } : {}),
    ...(row.body ? { body: String(row.body) } : {}),
    status: row.status as PortalSubmission["status"],
    submittedAt: String(row.submitted_at),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
    ...(row.review_note ? { reviewNote: String(row.review_note) } : {}),
  };
}

export function mapMessage(row: Row): PortalMessage {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    portalId: String(row.portal_id),
    membershipId: String(row.membership_id),
    direction: row.direction as PortalMessage["direction"],
    body: String(row.body),
    ...(row.subject_type && row.subject_id
      ? {
          subject: {
            type: row.subject_type as EntityReference["type"],
            id: String(row.subject_id),
          },
        }
      : {}),
    sentAt: String(row.sent_at),
    ...(row.sent_by ? { sentBy: String(row.sent_by) } : {}),
    ...(row.read_at ? { readAt: String(row.read_at) } : {}),
  };
}

export function createPortalRepository(q: Query, deps: Deps): PortalRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "portals", {}, { liveOnly: true });
      return rows.map(mapPortal);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "portals", { id });
      return row ? mapPortal(row) : null;
    },

    async identities(ctx) {
      const rows = await q.many(ctx, "portal_identities", {}, { liveOnly: true });
      return rows.map(mapIdentity);
    },

    async memberships(ctx, portalId) {
      const rows = await q.many(ctx, "portal_memberships", portalId ? { portal_id: portalId } : {});
      return rows.map(mapMembership);
    },

    async grantsFor(ctx, membershipId) {
      const rows = await q.many(ctx, "portal_grants", { membership_id: membershipId }, {
        order: { column: "granted_at", ascending: false },
      });
      return rows.map(mapGrant);
    },

    async invite(ctx, input) {
      const portalRow = await q.maybeOne(ctx, "portals", { id: input.portalId });
      if (!portalRow) return null;
      const portal = mapPortal(portalRow);

      // Refused at the point somebody makes the mistake, rather than
      // discovered when a beneficiary downloads a board pack.
      for (const capability of input.capabilities) {
        if (!capabilityPermitted(portal.audience, capability)) return null;
      }

      const email = input.email.trim().toLowerCase();
      let identityRow = await q.maybeOne(ctx, "portal_identities", { email });
      if (!identityRow) {
        identityRow = await q.insert(ctx, "portal_identities", {
          email,
          displayName: input.displayName,
          personId: input.personId,
          externalOrganisationId: input.externalOrganisationId,
          status: "invited",
          invitedAt: ctx.now().toISOString(),
        });
      }
      const identityId = String(identityRow.id);

      const existing = await q.maybeOne(ctx, "portal_memberships", {
        portal_id: portal.id,
        identity_id: identityId,
      });
      if (existing) {
        // Re-inviting restores access rather than creating a second
        // membership, and clears the revocation so the access review reads
        // as one story rather than two rows.
        await q.update(ctx, "portal_memberships", String(existing.id), {
          capabilities: input.capabilities,
          expiresAt: input.expiresAt ?? null,
          revokedAt: null,
          revokedReason: null,
        });
        return { identityId, membershipId: String(existing.id) };
      }

      const membership = await q.insert(ctx, "portal_memberships", {
        portalId: portal.id,
        identityId,
        capabilities: input.capabilities,
        expiresAt: input.expiresAt,
        invitedBy: ctx.userId,
      });

      await deps.audit.record(ctx, {
        action: "portal.invited",
        entityType: "person",
        entityId: identityId,
        summary: `Invited ${input.email} to the ${portal.audience} portal with ${input.capabilities.join(", ")}`,
      });

      return { identityId, membershipId: String(membership.id) };
    },

    async share(ctx, input) {
      const membershipRow = await q.maybeOne(ctx, "portal_memberships", {
        id: input.membershipId,
      });
      if (!membershipRow || membershipRow.revoked_at) return null;
      const portalRow = await q.maybeOne(ctx, "portals", {
        id: String(membershipRow.portal_id),
      });
      if (!portalRow) return null;
      const portal = mapPortal(portalRow);

      // Both endpoints, as `relations` does. A correctly scoped grant row can
      // still name a record in another tenant.
      const table = ENTITY_TABLES[input.entity.type];
      if (!table) return null;
      if (!(await q.maybeOne(ctx, table, { id: input.entity.id }))) return null;

      // An entity type no view names cannot be shared at all. That is what
      // makes adding a new entity safe: it is invisible to every portal until
      // somebody writes a view for it.
      const view = input.viewKey
        ? findView(input.viewKey)
        : viewForEntity(portal.audience, input.entity.type);
      if (!view || view.audience !== portal.audience || view.entityType !== input.entity.type) {
        return null;
      }

      const row = await q.insert(
        ctx,
        "portal_grants",
        {
          membershipId: input.membershipId,
          entityType: input.entity.type,
          entityId: input.entity.id,
          viewKey: view.key,
          grantedBy: ctx.userId,
          grantedAt: ctx.now().toISOString(),
          reason: input.reason,
          expiresAt: input.expiresAt,
        },
        { audit: false },
      );

      await deps.audit.record(ctx, {
        action: "portal.shared",
        entityType: input.entity.type,
        entityId: input.entity.id,
        summary: `Shared with the ${portal.audience} portal through view ${view.key}${input.reason ? `: ${input.reason}` : ""}`,
      });

      return String(row.id);
    },

    async unshare(ctx, grantId) {
      const row = await q.maybeOne(ctx, "portal_grants", { id: grantId });
      if (!row || row.revoked_at) return;
      // Revoked, never deleted. A deleted grant cannot answer "what did we
      // share with this funder, and when did we stop?"
      await q.update(
        ctx,
        "portal_grants",
        grantId,
        { revokedAt: ctx.now().toISOString() },
        { audit: false },
      );
      await deps.audit.record(ctx, {
        action: "portal.unshared",
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        summary: "Withdrawn from a portal.",
      });
    },

    async revokeMembership(ctx, membershipId, reason) {
      const row = await q.maybeOne(ctx, "portal_memberships", { id: membershipId });
      // A revocation without a reason is not auditable, and this is the record
      // somebody reads when asking why access ended.
      if (!row || !reason.trim()) return;
      await q.update(ctx, "portal_memberships", membershipId, {
        revokedAt: ctx.now().toISOString(),
        revokedReason: reason,
      });
      await deps.audit.record(ctx, {
        action: "portal.access_revoked",
        entityType: "person",
        entityId: String(row.identity_id),
        summary: `Portal access revoked: ${reason}`,
      });
    },

    async submissions(ctx, portalId) {
      const rows = await q.many(ctx, "portal_submissions", portalId ? { portal_id: portalId } : {}, {
        order: { column: "submitted_at", ascending: false },
      });
      return rows.map(mapSubmission);
    },

    async messages(ctx, membershipId) {
      const rows = await q.many(ctx, "portal_messages", { membership_id: membershipId }, {
        order: { column: "sent_at" },
      });
      return rows.map(mapMessage);
    },

    async reply(ctx, membershipId, body) {
      const row = await q.maybeOne(ctx, "portal_memberships", { id: membershipId });
      if (!row || row.revoked_at || !body.trim()) return null;
      const message = await q.insert(
        ctx,
        "portal_messages",
        {
          portalId: String(row.portal_id),
          membershipId,
          direction: "outbound",
          body,
          sentAt: ctx.now().toISOString(),
          sentBy: ctx.userId,
        },
        { audit: false },
      );
      return String(message.id);
    },
  };
}
