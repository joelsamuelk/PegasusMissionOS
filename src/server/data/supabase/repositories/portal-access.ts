import { decideAccess, reachableRecords } from "@/lib/portals/access";
import { projectRecord } from "@/lib/portals/projection";
import type { PortalGrantRecord, ProjectedRecord } from "@/types/domain";
import type { PortalAccessRepository } from "../../types";
import { ENTITY_TABLES } from "../entity-tables";
import type { Row } from "../mapping";
import type { Deps, Query } from "../query";
import { mapGrant, mapIdentity, mapMembership, mapPortal } from "./portals";

/**
 * The portal user's side.
 *
 * These methods take no `RequestContext`, because the caller is identified by
 * a portal slug and an email rather than by a Pegasus session. In the
 * in-memory adapter that means they search every tenant and narrow afterwards.
 *
 * Here they do not have to. Every query runs through the caller's own Supabase
 * session, so row level security has already reduced what is visible to what
 * that session may see -- and the current caller is `previewPortal`, an
 * authenticated internal action. The absence of a context is therefore not an
 * absence of scoping; the database supplies it.
 *
 * The adapter's own tenant filter cannot be applied here for want of an
 * organisation id, which makes this the one place in the Supabase adapter
 * where RLS is the only layer rather than the second. That is worth saying out
 * loud, and it is why every method still ends at `projectRecord`: access is
 * decided from grants, and even a correctly granted record leaves as a
 * field-by-field allowlist rather than a row.
 */
export function createPortalAccessRepository(q: Query, _deps: Deps): PortalAccessRepository {
  async function selectAll(table: string, match: Record<string, unknown>): Promise<Row[]> {
    let query = (await q.client()).from(table).select("*");
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  const repository: PortalAccessRepository = {
    async resolvePortal(slug) {
      const rows = await selectAll("portals", { slug, status: "open" });
      const live = rows.filter((row) => !row.archived_at);
      return live[0] ? mapPortal(live[0]) : null;
    },

    async resolveMembership(slug, email) {
      const portal = await repository.resolvePortal(slug);
      if (!portal) return null;
      const normalised = email.trim().toLowerCase();

      const identities = await selectAll("portal_identities", {
        organisation_id: portal.organisationId,
      });
      const identityRow = identities.find(
        (row) => String(row.email).toLowerCase() === normalised && !row.archived_at,
      );
      if (!identityRow) return null;

      const memberships = await selectAll("portal_memberships", {
        portal_id: portal.id,
        identity_id: String(identityRow.id),
        organisation_id: portal.organisationId,
      });
      const membershipRow = memberships[0];
      return membershipRow
        ? {
            portal,
            identity: mapIdentity(identityRow),
            membership: mapMembership(membershipRow),
          }
        : null;
    },

    async index(slug, email) {
      const resolved = await repository.resolveMembership(slug, email);
      if (!resolved) return [];
      const grants = await grantsFor(resolved.portal.organisationId);

      const projections: ProjectedRecord[] = [];
      for (const grant of reachableRecords(grants, resolved.membership, new Date())) {
        const projection = await repository.read(slug, email, grant.entity);
        if (projection) projections.push(projection);
      }
      return projections;
    },

    async read(slug, email, entity) {
      const resolved = await repository.resolveMembership(slug, email);
      if (!resolved) return null;

      const decision = decideAccess({
        portal: resolved.portal,
        identity: resolved.identity,
        membership: resolved.membership,
        grants: await grantsFor(resolved.portal.organisationId),
        entity,
        capability: "portal:view",
        now: new Date(),
      });
      if (!decision.allowed || !decision.viewKey) return null;

      const table = ENTITY_TABLES[entity.type];
      if (!table) return null;
      const rows = await selectAll(table, {
        id: entity.id,
        organisation_id: resolved.portal.organisationId,
      });
      const record = rows[0];
      if (!record) return null;

      // Projected, never returned. Even here, with access correctly granted,
      // the object that leaves is built field by field from an allowlist.
      //
      // The row is snake_case and the views name camelCase fields, so it is
      // converted first -- a projection that silently matched nothing would
      // return an empty record rather than refusing, which is the failure mode
      // an allowlist exists to avoid.
      return projectRecord({
        entity,
        record: camelise(record),
        viewKey: decision.viewKey,
      });
    },

    async submit(slug, email, input) {
      const resolved = await repository.resolveMembership(slug, email);
      if (!resolved) return null;
      if (!resolved.membership.capabilities.includes("portal:submit")) return null;
      if (resolved.membership.revokedAt) return null;

      const { data, error } = await (await q.client())
        .from("portal_submissions")
        .insert({
          organisation_id: resolved.portal.organisationId,
          portal_id: resolved.portal.id,
          membership_id: resolved.membership.id,
          kind: input.kind,
          subject_type: input.subject?.type ?? null,
          subject_id: input.subject?.id ?? null,
          body: input.body ?? null,
          // Always. A portal submission changes nothing until a member of the
          // organisation decides what it means.
          status: "received",
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(`Could not write to portal_submissions: ${error.message}`);
      return String((data as Row).id);
    },

    async message(slug, email, body) {
      const resolved = await repository.resolveMembership(slug, email);
      if (!resolved) return null;
      if (!resolved.membership.capabilities.includes("portal:message")) return null;
      if (resolved.membership.revokedAt || !body.trim()) return null;

      const { data, error } = await (await q.client())
        .from("portal_messages")
        .insert({
          organisation_id: resolved.portal.organisationId,
          portal_id: resolved.portal.id,
          membership_id: resolved.membership.id,
          direction: "inbound",
          body,
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(`Could not write to portal_messages: ${error.message}`);
      return String((data as Row).id);
    },
  };

  async function grantsFor(organisationId: string): Promise<PortalGrantRecord[]> {
    const rows = await selectAll("portal_grants", { organisation_id: organisationId });
    return rows.map(mapGrant);
  }

  return repository;
}

/** snake_case row to camelCase, so view allowlists match field names. */
function camelise(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return out;
}

