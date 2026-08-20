import type { EntityReference, Relation, VerificationState } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { GraphRepository } from "../../types";
import { ENTITY_TABLES } from "../entity-tables";
import { auditFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

const entityKey = (ref: EntityReference) => `${ref.type}:${ref.id}`;
const sameRef = (a: EntityReference, b: EntityReference) => a.type === b.type && a.id === b.id;

function mapRelation(row: Row): Relation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    from: { type: row.from_type as EntityReference["type"], id: String(row.from_id) },
    to: { type: row.to_type as EntityReference["type"], id: String(row.to_id) },
    kind: row.kind as Relation["kind"],
    ...(row.role ? { role: String(row.role) } : {}),
    // Not defaulted to 1. "We did not say" and "we said all of it" are
    // different statements, and defaulting turns the first into the second.
    ...(row.weight != null ? { weight: optionalNumberFrom(row.weight) } : {}),
    ...(row.note ? { note: String(row.note) } : {}),
    // The edge's own trust state. An asserted link is not a verified one.
    ...(row.verification
      ? {
          attested: {
            value: null,
            verification: row.verification as VerificationState,
            ...(row.verified_at ? { lastVerifiedAt: String(row.verified_at) } : {}),
          },
        }
      : {}),
    audit: auditFrom(row),
  };
}

export function createGraphRepository(q: Query, deps: Deps): GraphRepository {
  /**
   * Does this entity exist, and does it belong to the caller's tenant?
   *
   * An unmapped entity kind returns false. That is deliberate: a kind nobody
   * has declared addressable cannot be pointed at, so the failure mode of
   * forgetting to add one is a refused edge rather than an unchecked one.
   */
  async function entityExists(ctx: RequestContext, ref: EntityReference): Promise<boolean> {
    if (ref.type === "organisation") return ref.id === ctx.organisationId;
    const table = ENTITY_TABLES[ref.type];
    if (!table) return false;
    const row = await q.maybeOne(ctx, table, { id: ref.id });
    return row !== null;
  }

  return {
    async list(ctx) {
      const rows = await q.many(ctx, "relations", {}, { liveOnly: true });
      return rows.map(mapRelation);
    },

    async from(ctx, entity, kind) {
      const rows = await q.many(ctx, "relations", {
        from_type: entity.type,
        from_id: entity.id,
        ...(kind !== undefined ? { kind } : {}),
      });
      return rows.map(mapRelation);
    },

    async to(ctx, entity, kind) {
      const rows = await q.many(ctx, "relations", {
        to_type: entity.type,
        to_id: entity.id,
        ...(kind !== undefined ? { kind } : {}),
      });
      return rows.map(mapRelation);
    },

    async connect(ctx, init) {
      // Both endpoints, not just the row. A relation stamped with the caller's
      // organisation but naming another tenant's outcome would look perfectly
      // scoped and would still be a cross-tenant read waiting to happen.
      const [fromExists, toExists] = await Promise.all([
        entityExists(ctx, init.from),
        entityExists(ctx, init.to),
      ]);
      if (!fromExists || !toExists) return null;

      const row = await q.insert(ctx, "relations", {
        fromType: init.from.type,
        fromId: init.from.id,
        toType: init.to.type,
        toId: init.to.id,
        kind: init.kind,
        role: init.role,
        weight: init.weight,
        note: init.note,
        createdAt: ctx.now().toISOString(),
        updatedAt: ctx.now().toISOString(),
      });
      const relation = mapRelation(row);
      await deps.audit.record(ctx, {
        action: "relation.connected",
        entityType: "relation",
        entityId: relation.id,
        summary: `${entityKey(relation.from)} --${relation.kind}--> ${entityKey(relation.to)}`,
      });
      return relation;
    },

    async disconnect(ctx, id) {
      const row = await q.maybeOne(ctx, "relations", { id });
      if (!row) return;
      const relation = mapRelation(row);
      await q.remove(ctx, "relations", { id });
      await deps.audit.record(ctx, {
        action: "relation.disconnected",
        entityType: "relation",
        entityId: id,
        summary: `${entityKey(relation.from)} --${relation.kind}--> ${entityKey(relation.to)}`,
      });
    },

    async reach(ctx, from, kind, options) {
      const maxDepth = options?.maxDepth ?? 8;
      const backward = options?.direction === "backward";
      // Every edge of this kind is fetched once and the traversal runs in
      // memory. A query per hop would be a round trip per node, and the
      // frontier is the whole point.
      const edges = (await q.many(ctx, "relations", { kind })).map(mapRelation);

      const seen = new Set<string>([entityKey(from)]);
      const out: EntityReference[] = [];
      let frontier: EntityReference[] = [from];

      for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
        const next: EntityReference[] = [];
        for (const node of frontier) {
          for (const edge of edges) {
            const near = backward ? edge.to : edge.from;
            const far = backward ? edge.from : edge.to;
            if (!sameRef(near, node)) continue;
            if (seen.has(entityKey(far))) continue;
            seen.add(entityKey(far));
            out.push(far);
            next.push(far);
          }
        }
        frontier = next;
      }
      return out;
    },

    async connectionsFor(ctx, entity) {
      const key = entityKey(entity);
      const all = await q.many(ctx, "relations", {});
      const direct = all
        .map(mapRelation)
        .filter((r) => entityKey(r.from) === key || entityKey(r.to) === key);

      /**
       * The legacy edge table, projected into the same shape.
       *
       * A `RelationshipLink` is a `Relation` whose `from` is always a
       * relationship and whose `kind` is always `party_to`, qualified by the
       * link's role. Expressing it that way here is what lets a caller stop
       * knowing there are two tables.
       *
       * The projected id is prefixed so it can never be mistaken for a row in
       * `relations` and passed to `disconnect`, which would silently do
       * nothing.
       */
      const links = (await q.many(ctx, "relationship_links", {})).filter((link) => {
        const relationshipKey = `relationship:${String(link.relationship_id)}`;
        return (
          `${String(link.entity_type)}:${String(link.entity_id)}` === key ||
          relationshipKey === key
        );
      });

      /**
       * The endpoint check `relationship_links` never had.
       *
       * `Relation` verifies both endpoints on write, because a correctly
       * scoped row can still point at another tenant's record. The legacy
       * table predates that rule and has no such check, so a row belonging to
       * this tenant may name an id that resolves in another one.
       *
       * Reading it back unfiltered would let a traversal follow the pointer.
       * The row stays where it is; the projection refuses to present an edge
       * whose other end this tenant cannot see.
       */
      const visible = [];
      for (const link of links) {
        const ref: EntityReference = {
          type: link.entity_type as EntityReference["type"],
          id: String(link.entity_id),
        };
        if (await entityExists(ctx, ref)) visible.push({ link, ref });
      }

      const at = ctx.now().toISOString();
      const projected: Relation[] = visible.map(({ link, ref }) => ({
        id: `link:${String(link.id)}`,
        organisationId: String(link.organisation_id),
        from: { type: "relationship", id: String(link.relationship_id) },
        to: ref,
        kind: "party_to",
        ...(link.role ? { role: String(link.role) } : {}),
        ...(link.note ? { note: String(link.note) } : {}),
        // `RelationshipLink` carries no audit stamp of its own, which is one
        // of the reasons `Relation` superseded it. The projection uses the
        // request clock rather than inventing a creation date.
        audit: { createdAt: at, updatedAt: at },
      }));

      return [...direct, ...projected];
    },
  };
}
