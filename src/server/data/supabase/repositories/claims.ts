import {
  assertKindMayNotStrengthen,
  createClaim,
} from "@/lib/knowledge";
import type {
  Claim,
  ClaimConflict,
  ClaimProducer,
  ClaimSource,
  ClaimUsage,
  ClaimValue,
  EntityReference,
} from "@/types/domain";
import type { ClaimRepository } from "../../types";
import { arrayFrom, auditFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

/**
 * Reassemble a claim from its row and its three satellite tables.
 *
 * `sources`, `supportedBy` and `conflictsWith` are relations rather than
 * columns, so a claim is never complete from `claims` alone. Every read that
 * returns claims resolves them together, in one round trip per table rather
 * than one per claim.
 */
function mapClaim(
  row: Row,
  sources: ClaimSource[],
  supportedBy: string[],
  conflictsWith: string[],
): Claim {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    subject: {
      type: row.subject_type as EntityReference["type"],
      id: String(row.subject_id),
    },
    predicate: String(row.predicate),
    value: row.value as ClaimValue,
    text: String(row.text),
    kind: row.kind as Claim["kind"],
    verification: row.verification as Claim["verification"],
    ...(row.confidence != null ? { confidence: optionalNumberFrom(row.confidence) } : {}),
    sources,
    derivedFrom: (row.derived_from ?? []) as EntityReference[],
    supportedBy,
    producedBy: producerFrom(row),
    ...(row.workings ? { workings: String(row.workings) } : {}),
    assumptions: arrayFrom(row.assumptions),
    caveats: arrayFrom(row.caveats),
    ...(row.valid_from ? { validFrom: String(row.valid_from) } : {}),
    ...(row.valid_until ? { validUntil: String(row.valid_until) } : {}),
    ...(row.period_label ? { periodLabel: String(row.period_label) } : {}),
    ...(row.supersedes ? { supersedes: String(row.supersedes) } : {}),
    ...(row.superseded_by ? { supersededBy: String(row.superseded_by) } : {}),
    conflictsWith,
    ...(row.verified_by ? { verifiedBy: String(row.verified_by) } : {}),
    ...(row.verified_at ? { verifiedAt: String(row.verified_at) } : {}),
    audit: auditFrom(row),
  };
}

/**
 * `ClaimProducer` is a discriminated union split across two columns: the
 * method, which is an enum, and the fields that method carries, which are
 * jsonb because they differ per branch.
 */
function producerFrom(row: Row): ClaimProducer {
  const detail = (row.producer_detail ?? {}) as Record<string, string>;
  return { method: row.producer_method, ...detail } as ClaimProducer;
}

function producerColumns(producedBy: ClaimProducer): { method: string; detail: Row } {
  const { method, ...detail } = producedBy;
  return { method, detail: detail as Row };
}

function mapSource(row: Row): ClaimSource {
  return {
    ref: { type: row.source_type as EntityReference["type"], id: String(row.source_id) },
    authority: row.authority as ClaimSource["authority"],
    ...(row.locator ? { locator: String(row.locator) } : {}),
    ...(row.retrieved_at ? { retrievedAt: String(row.retrieved_at) } : {}),
  };
}

function mapUsage(row: Row): ClaimUsage {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    claimId: String(row.claim_id),
    usedIn: { type: row.used_in_type as EntityReference["type"], id: String(row.used_in_id) },
    ...(row.context ? { context: String(row.context) } : {}),
    usedAt: String(row.used_at),
  };
}

function mapConflict(row: Row): ClaimConflict {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    claimIds: arrayFrom(row.claim_ids),
    subject: { type: row.subject_type as EntityReference["type"], id: String(row.subject_id) },
    predicate: String(row.predicate),
    reason: String(row.reason),
    ...(row.recommended_claim_id
      ? { recommendedClaimId: String(row.recommended_claim_id) }
      : {}),
    ...(row.recommendation_reason
      ? { recommendationReason: String(row.recommendation_reason) }
      : {}),
    ...(row.resolved_claim_id ? { resolvedClaimId: String(row.resolved_claim_id) } : {}),
    ...(row.resolved_by ? { resolvedBy: String(row.resolved_by) } : {}),
    ...(row.resolved_at ? { resolvedAt: String(row.resolved_at) } : {}),
    createdAt: String(row.created_at),
  };
}

const newest = (a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at));

export function createClaimRepository(
  q: Query,
  deps: Pick<Deps, "audit">,
): ClaimRepository {
  /** Resolve the satellite tables for a set of claim rows, then map them. */
  async function hydrate(
    ctx: Parameters<ClaimRepository["list"]>[0],
    rows: Row[],
  ): Promise<Claim[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => String(r.id));
    const [sourceRows, supportRows, conflictRows] = await Promise.all([
      q.whereIn(ctx, "claim_sources", "claim_id", ids),
      q.whereIn(ctx, "claim_supports", "claim_id", ids),
      q.many(ctx, "claim_conflicts", {}),
    ]);

    const sourcesBy = new Map<string, ClaimSource[]>();
    for (const row of sourceRows) {
      const key = String(row.claim_id);
      const list = sourcesBy.get(key) ?? [];
      list.push(mapSource(row));
      sourcesBy.set(key, list);
    }
    const supportsBy = new Map<string, string[]>();
    for (const row of supportRows) {
      const key = String(row.claim_id);
      const list = supportsBy.get(key) ?? [];
      list.push(String(row.supports_claim_id));
      supportsBy.set(key, list);
    }
    // A claim's conflicts are the reverse of the conflict rows that name it.
    // There is no column on `claims` for this, and there should not be: the
    // conflict is a fact about a set of claims, not about any one of them.
    const conflictsBy = new Map<string, string[]>();
    for (const row of conflictRows) {
      const claimIds = arrayFrom(row.claim_ids);
      for (const id of claimIds) {
        const others = claimIds.filter((other) => other !== id);
        conflictsBy.set(id, [...(conflictsBy.get(id) ?? []), ...others]);
      }
    }

    return rows.map((row) => {
      const id = String(row.id);
      return mapClaim(
        row,
        sourcesBy.get(id) ?? [],
        supportsBy.get(id) ?? [],
        conflictsBy.get(id) ?? [],
      );
    });
  }

  /** Write a claim and its satellite rows. */
  async function persist(
    ctx: Parameters<ClaimRepository["list"]>[0],
    claim: Claim,
  ): Promise<Claim> {
    const producer = producerColumns(claim.producedBy);
    await q.insert(
      ctx,
      "claims",
      {
        id: claim.id,
        subjectType: claim.subject.type,
        subjectId: claim.subject.id,
        predicate: claim.predicate,
        value: claim.value,
        text: claim.text,
        kind: claim.kind,
        verification: claim.verification,
        confidence: claim.confidence,
        derivedFrom: claim.derivedFrom,
        producerMethod: producer.method,
        producerDetail: producer.detail,
        workings: claim.workings,
        assumptions: claim.assumptions,
        caveats: claim.caveats,
        validFrom: claim.validFrom,
        validUntil: claim.validUntil,
        periodLabel: claim.periodLabel,
        supersedes: claim.supersedes,
        verifiedBy: claim.verifiedBy,
        verifiedAt: claim.verifiedAt,
        createdAt: claim.audit.createdAt,
        updatedAt: claim.audit.updatedAt,
      },
      { audit: false },
    );

    for (const source of claim.sources) {
      await q.insert(
        ctx,
        "claim_sources",
        {
          claimId: claim.id,
          sourceType: source.ref.type,
          sourceId: source.ref.id,
          authority: source.authority,
          locator: source.locator,
          retrievedAt: source.retrievedAt,
        },
        { audit: false },
      );
    }
    for (const supportId of claim.supportedBy) {
      await q.insert(
        ctx,
        "claim_supports",
        { claimId: claim.id, supportsClaimId: supportId },
        { audit: false },
      );
    }
    return claim;
  }

  return {
    async list(ctx) {
      return hydrate(ctx, await q.many(ctx, "claims"));
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "claims", { id });
      if (!row) return null;
      const [claim] = await hydrate(ctx, [row]);
      return claim ?? null;
    },

    async forSubject(ctx, subject) {
      const rows = await q.many(ctx, "claims", {
        subject_type: subject.type,
        subject_id: subject.id,
      });
      return hydrate(ctx, rows.sort(newest));
    },

    async current(ctx, subject, predicate) {
      // "Current" excludes superseded and retired claims, so a corrected
      // figure never resurfaces just because it is still on file.
      const rows = await q.many(ctx, "claims", {
        subject_type: subject.type,
        subject_id: subject.id,
        predicate,
      });
      const live = rows
        .filter((r) => !r.superseded_by && r.verification !== "outdated")
        .sort(newest);
      if (live.length === 0) return null;
      const [claim] = await hydrate(ctx, [live[0]!]);
      return claim ?? null;
    },

    async create(ctx, init) {
      // `createClaim` enforces that a non-human producer cannot mint a
      // verified claim. Calling it here rather than assembling a row means
      // that rule cannot be bypassed by writing through this adapter.
      const claim = createClaim({
        ...init,
        id: crypto.randomUUID(),
        organisationId: ctx.organisationId,
        now: ctx.now(),
      });
      await persist(ctx, claim);
      await deps.audit.record(ctx, {
        action: "claim.created",
        entityType: "claim",
        entityId: claim.id,
        summary: `Claim recorded (${claim.kind}): ${claim.text.slice(0, 80)}`,
      });
      return claim;
    },

    async supersede(ctx, previousId, next) {
      const previous = await q.maybeOne(ctx, "claims", { id: previousId });
      if (!previous) return null;
      // A machine may not promote a hypothesis into a fact by writing a
      // stronger successor. Enforced on the storage path because that is the
      // only route a successor can reach the tenant by.
      assertKindMayNotStrengthen(
        previous.kind as Claim["kind"],
        next.kind,
        next.producedBy,
      );
      // Never let a supersede write reach across a tenant boundary, even if
      // the successor object was assembled elsewhere.
      //
      // The identifier is minted here rather than taken from the caller, for
      // the same reason and by the same rule as `create`: a primary key is
      // storage's to assign. The in-memory adapter honours whatever id the
      // caller put on the successor, which works until the column is a uuid
      // and the caller's id is a readable string. Callers use the returned
      // claim, which is what makes this safe as well as correct.
      const record: Claim = {
        ...next,
        id: crypto.randomUUID(),
        organisationId: ctx.organisationId,
        supersedes: String(previous.id),
      };
      await persist(ctx, record);
      await q.update(ctx, "claims", previousId, { supersededBy: record.id }, { audit: false });
      await deps.audit.record(ctx, {
        action: "claim.superseded",
        entityType: "claim",
        entityId: record.id,
        summary: `Claim ${previousId} superseded by ${record.id} (${record.verification})`,
      });
      return record;
    },

    async supportChain(ctx, id) {
      const all = await this.list(ctx);
      const byId = new Map(all.map((c) => [c.id, c]));
      const root = byId.get(id);
      if (!root) return [];
      const out: Claim[] = [];
      const seen = new Set<string>();
      const visit = (claim: Claim) => {
        if (seen.has(claim.id)) return;
        seen.add(claim.id);
        out.push(claim);
        for (const supportId of claim.supportedBy) {
          const child = byId.get(supportId);
          if (child) visit(child);
        }
      };
      visit(root);
      return out;
    },

    async recordUsage(ctx, usage) {
      // A usage may only cite a claim this tenant owns.
      const claim = await q.maybeOne(ctx, "claims", { id: usage.claimId });
      if (!claim) return;
      await q.insert(
        ctx,
        "claim_usages",
        {
          claimId: usage.claimId,
          usedInType: usage.usedIn.type,
          usedInId: usage.usedIn.id,
          context: usage.context,
          usedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
    },

    async usages(ctx, claimId) {
      const rows = await q.many(ctx, "claim_usages", { claim_id: claimId });
      return rows.map(mapUsage);
    },

    async usedIn(ctx, entity) {
      const usages = await q.many(ctx, "claim_usages", {
        used_in_type: entity.type,
        used_in_id: entity.id,
      });
      const ids = [...new Set(usages.map((u) => String(u.claim_id)))];
      return hydrate(ctx, await q.whereIn(ctx, "claims", "id", ids));
    },

    async conflicts(ctx) {
      const rows = await q.many(ctx, "claim_conflicts", {}, {
        order: { column: "created_at", ascending: false },
      });
      return rows.map(mapConflict);
    },

    async recordConflict(ctx, conflict) {
      await q.insert(
        ctx,
        "claim_conflicts",
        {
          claimIds: conflict.claimIds,
          subjectType: conflict.subject.type,
          subjectId: conflict.subject.id,
          predicate: conflict.predicate,
          reason: conflict.reason,
          recommendedClaimId: conflict.recommendedClaimId,
          recommendationReason: conflict.recommendationReason,
          resolvedClaimId: conflict.resolvedClaimId,
          resolvedBy: conflict.resolvedBy,
          resolvedAt: conflict.resolvedAt,
          createdAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
    },
  };
}
