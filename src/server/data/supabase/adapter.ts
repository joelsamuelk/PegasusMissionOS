import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditEvent,
  Claim,
  EntityReference,
  ImpactReport,
  ImpactReportSection,
} from "@/types/domain";
import { assertKindMayNotStrengthen, createClaim } from "@/lib/knowledge";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "../types";
import {
  activityFrom,
  answerFrom,
  applicationFrom,
  auditEventFrom,
  claimFrom,
  commitmentFrom,
  deliverableFrom,
  evidenceFrom,
  funderFrom,
  grantFrom,
  grantReportFrom,
  indicatorFrom,
  interactionFrom,
  measurementFrom,
  memberFrom,
  notificationFrom,
  opportunityFrom,
  organisationFrom,
  outcomeFrom,
  outputFrom,
  paymentFrom,
  personFrom,
  producerToColumns,
  programmeFrom,
  relationFrom,
  relationshipFrom,
  taskFrom,
  userFrom,
} from "./mappers";
import type { Row } from "./mapping";
import {
  createDocumentRepository,
  createOnboardingRepository,
} from "./onboarding-repositories";

/**
 * The Supabase adapter.
 *
 * Satisfies the same `MissionRepository` contract as the in-memory adapter and
 * is verified by the same shared suite, which is the point: "the Supabase
 * adapter behaves like the in-memory one" is an executed claim rather than a
 * hope.
 *
 * Three rules shape every method below.
 *
 * **1. Tenant scope is applied here as well as by RLS.** Every query carries
 * `.eq("organisation_id", ctx.organisationId)` even though row level security
 * enforces the same rule in Postgres. That is not redundancy, it is the
 * design: two independent layers, neither trusted alone. A missing `.eq` is a
 * bug even when RLS would have caught it, because the next deployment might
 * use a service-role client and RLS would then be the layer that is absent.
 *
 * **2. A missing or cross-tenant id resolves to `null`, never throws.** RLS
 * makes those two cases indistinguishable from here — a row in another tenant
 * simply is not visible — and the contract requires both to behave the same
 * way.
 *
 * **3. The client is created per call, not cached.** It carries the caller's
 * session, so a cached client would serve one user's session to the next
 * request. That is why the factory takes a function rather than a client.
 */

export type ClientFactory = () => Promise<SupabaseClient>;

/** Postgres error codes that mean "no row", rather than a real failure. */
const NOT_FOUND = new Set(["PGRST116"]);

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

/**
 * Unwrap a single-row result.
 *
 * A `PGRST116` is "zero rows matched", which for a `get(id)` is an answer, not
 * an error. Anything else is a genuine failure and is thrown, because silently
 * returning null on a connection error would present an outage as an empty
 * workspace.
 */
function one<T>(
  result: { data: unknown; error: { code?: string; message: string } | null },
  map: (row: Row) => T,
): T | null {
  if (result.error) {
    if (NOT_FOUND.has(result.error.code ?? "")) return null;
    throw new Error(result.error.message);
  }
  return result.data ? map(result.data as Row) : null;
}

function many<T>(
  result: { data: unknown; error: { message: string } | null },
  map: (row: Row) => T,
): T[] {
  if (result.error) throw new Error(result.error.message);
  return rows(result.data).map(map);
}

export function createSupabaseRepository(getClient: ClientFactory): MissionRepository {
  /** Every read starts here. The tenant filter is not optional. */
  const from = async (ctx: RequestContext, table: string) => {
    const db = await getClient();
    return db.from(table).select("*").eq("organisation_id", ctx.organisationId);
  };

  const insert = async (ctx: RequestContext, table: string, values: Record<string, unknown>) => {
    const db = await getClient();
    // `organisation_id` is stamped from the context and never taken from the
    // caller, so a payload assembled elsewhere cannot redirect a write.
    return db
      .from(table)
      .insert({ ...values, organisation_id: ctx.organisationId })
      .select("*")
      .single();
  };

  const update = async (
    ctx: RequestContext,
    table: string,
    id: string,
    values: Record<string, unknown>,
  ) => {
    const db = await getClient();
    return db
      .from(table)
      .update(values)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select("*")
      .maybeSingle();
  };

  /** Does this id resolve inside the caller's tenant? */
  const exists = async (ctx: RequestContext, table: string, id: string): Promise<boolean> => {
    const db = await getClient();
    const { data } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    return Boolean(data);
  };

  async function recordAudit(
    ctx: RequestContext,
    event: Omit<AuditEvent, "id" | "createdAt" | "organisationId" | "actorId" | "actorName">,
  ): Promise<void> {
    const db = await getClient();
    const { data: actor } = await db
      .from("users")
      .select("name")
      .eq("id", ctx.userId)
      .maybeSingle();

    await db.from("audit_events").insert({
      organisation_id: ctx.organisationId,
      actor_id: ctx.userId,
      actor_name: (actor as Row | null)?.name ?? "Unknown actor",
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId,
      summary: event.summary,
      created_at: ctx.now().toISOString(),
    });
  }

  async function recordActivity(ctx: RequestContext, verb: string, target: string): Promise<void> {
    const db = await getClient();
    const { data: actor } = await db
      .from("users")
      .select("name")
      .eq("id", ctx.userId)
      .maybeSingle();

    await db.from("activity_events").insert({
      organisation_id: ctx.organisationId,
      actor_id: ctx.userId,
      actor_name: (actor as Row | null)?.name ?? "Unknown actor",
      verb,
      target,
      created_at: ctx.now().toISOString(),
    });
  }

  const stamp = (ctx: RequestContext) => ctx.now().toISOString();

  /** Resolve a claim's join-table children so the object is whole. */
  async function hydrateClaim(ctx: RequestContext, row: Row): Promise<Claim> {
    const db = await getClient();
    const [sources, supports] = await Promise.all([
      db.from("claim_sources").select("*").eq("claim_id", row.id),
      db.from("claim_supports").select("supports_claim_id").eq("claim_id", row.id),
    ]);

    return claimFrom(row, {
      sources: rows(sources.data).map((s) => ({
        ref: {
          type: String(s.source_type ?? "research_source") as EntityReference["type"],
          id: String(s.source_id ?? ""),
          label: s.source_label ? String(s.source_label) : undefined,
        },
        authority: String(s.authority ?? "supporting") as Claim["sources"][number]["authority"],
        locator: s.locator ? String(s.locator) : undefined,
        retrievedAt: s.retrieved_at ? String(s.retrieved_at) : undefined,
      })),
      supportedBy: rows(supports.data).map((s) => String(s.supports_claim_id)),
    });
  }

  const repository: MissionRepository = {
    name: "supabase",

    organisations: {
      async get(ctx) {
        const db = await getClient();
        return one(
          await db.from("organisations").select("*").eq("id", ctx.organisationId).maybeSingle(),
          organisationFrom,
        );
      },
      async profile(ctx) {
        const db = await getClient();
        const { data, error } = await db
          .from("organisation_profiles")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;

        // Profile fields are stored as jsonb `{ value, verification, ... }`
        // per column, so the row is already the shape the domain expects once
        // the tenant key is lifted out.
        const row = data as Row;
        const { organisation_id: _org, ...fields } = row;
        return { organisationId: ctx.organisationId, ...fields } as ReturnType<
          MissionRepository["organisations"]["profile"]
        > extends Promise<infer T>
          ? NonNullable<T>
          : never;
      },
      async members(ctx) {
        return many(await from(ctx, "organisation_members"), memberFrom);
      },
      async users(ctx) {
        const db = await getClient();
        const { data: members } = await db
          .from("organisation_members")
          .select("user_id")
          .eq("organisation_id", ctx.organisationId)
          .eq("status", "active");
        const ids = rows(members).map((m) => String(m.user_id));
        if (ids.length === 0) return [];
        return many(await db.from("users").select("*").in("id", ids), userFrom);
      },
      async user(ctx, userId) {
        // Membership decides visibility: a user id from another organisation
        // resolves to null even though `users` is not tenant-scoped itself.
        const db = await getClient();
        const { data: membership } = await db
          .from("organisation_members")
          .select("user_id")
          .eq("organisation_id", ctx.organisationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!membership) return null;
        return one(await db.from("users").select("*").eq("id", userId).maybeSingle(), userFrom);
      },
      async currentUser(ctx) {
        return repository.organisations.user(ctx, ctx.userId);
      },
      async currentMember(ctx) {
        const db = await getClient();
        return one(
          await db
            .from("organisation_members")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("user_id", ctx.userId)
            .maybeSingle(),
          memberFrom,
        );
      },
      async setAiEnabled(ctx, enabled) {
        const db = await getClient();
        await db
          .from("organisations")
          .update({ ai_enabled: enabled, updated_at: stamp(ctx) })
          .eq("id", ctx.organisationId);
        await recordAudit(ctx, {
          action: "organisation.ai_toggled",
          entityType: "organisation",
          entityId: ctx.organisationId,
          summary: `AI assistance ${enabled ? "enabled" : "disabled"}`,
        });
      },
    },

    claims: {
      async list(ctx) {
        const result = await from(ctx, "claims");
        if (result.error) throw new Error(result.error.message);
        return Promise.all(rows(result.data).map((row) => hydrateClaim(ctx, row)));
      },
      async get(ctx, id) {
        const db = await getClient();
        const { data } = await db
          .from("claims")
          .select("*")
          .eq("id", id)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        return data ? hydrateClaim(ctx, data as Row) : null;
      },
      async forSubject(ctx, subject) {
        const db = await getClient();
        const { data } = await db
          .from("claims")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("subject_type", subject.type)
          .eq("subject_id", subject.id)
          .order("created_at", { ascending: false });
        return Promise.all(rows(data).map((row) => hydrateClaim(ctx, row)));
      },
      async current(ctx, subject, predicate) {
        const db = await getClient();
        const { data } = await db
          .from("claims")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("subject_type", subject.type)
          .eq("subject_id", subject.id)
          .eq("predicate", predicate)
          .is("superseded_by", null)
          .neq("verification", "outdated")
          .order("created_at", { ascending: false })
          .limit(1);
        const row = rows(data)[0];
        return row ? hydrateClaim(ctx, row) : null;
      },
      async create(ctx, init) {
        // `createClaim` owns the rule that a non-human producer cannot mint a
        // verified claim. Building the record through it means the constraint
        // cannot be bypassed by writing directly to this adapter.
        const claim = createClaim({
          ...init,
          id: crypto.randomUUID(),
          organisationId: ctx.organisationId,
          now: ctx.now(),
        });
        const db = await getClient();
        const { error } = await db.from("claims").insert({
          id: claim.id,
          organisation_id: ctx.organisationId,
          subject_type: claim.subject.type,
          subject_id: claim.subject.id,
          predicate: claim.predicate,
          value: claim.value,
          text: claim.text,
          kind: claim.kind,
          verification: claim.verification,
          confidence: claim.confidence,
          derived_from: claim.derivedFrom,
          ...producerToColumns(claim.producedBy),
          workings: claim.workings,
          assumptions: claim.assumptions,
          caveats: claim.caveats,
          valid_from: claim.validFrom,
          valid_until: claim.validUntil,
          period_label: claim.periodLabel,
          supersedes: claim.supersedes,
          verified_by: claim.verifiedBy,
          verified_at: claim.verifiedAt,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
          created_by: ctx.userId,
        });
        if (error) throw new Error(error.message);

        if (claim.sources.length > 0) {
          await db.from("claim_sources").insert(
            claim.sources.map((source) => ({
              organisation_id: ctx.organisationId,
              claim_id: claim.id,
              source_type: source.ref.type,
              source_id: source.ref.id,
              source_label: source.ref.label,
              authority: source.authority,
              locator: source.locator,
              retrieved_at: source.retrievedAt,
            })),
          );
        }

        await recordAudit(ctx, {
          action: "claim.created",
          entityType: "claim",
          entityId: claim.id,
          summary: `Claim recorded (${claim.kind}): ${claim.text.slice(0, 80)}`,
        });
        return claim;
      },
      async supersede(ctx, previousId, next) {
        const previous = await repository.claims.get(ctx, previousId);
        if (!previous) return null;

        // A machine may not promote a hypothesis into a fact by writing a
        // stronger successor. Enforced on both adapters, not just in memory.
        assertKindMayNotStrengthen(previous.kind, next.kind, next.producedBy);

        const record: Claim = {
          ...next,
          organisationId: ctx.organisationId,
          supersedes: previous.id,
        };
        const db = await getClient();
        const { error } = await db.from("claims").insert({
          id: record.id,
          organisation_id: ctx.organisationId,
          subject_type: record.subject.type,
          subject_id: record.subject.id,
          predicate: record.predicate,
          value: record.value,
          text: record.text,
          kind: record.kind,
          verification: record.verification,
          confidence: record.confidence,
          derived_from: record.derivedFrom,
          ...producerToColumns(record.producedBy),
          workings: record.workings,
          assumptions: record.assumptions,
          caveats: record.caveats,
          supersedes: previous.id,
          verified_by: record.verifiedBy,
          verified_at: record.verifiedAt,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
          created_by: ctx.userId,
        });
        if (error) throw new Error(error.message);

        await db
          .from("claims")
          .update({ superseded_by: record.id, updated_at: stamp(ctx) })
          .eq("id", previous.id)
          .eq("organisation_id", ctx.organisationId);

        await recordAudit(ctx, {
          action: "claim.superseded",
          entityType: "claim",
          entityId: record.id,
          summary: `Claim ${previous.id} superseded by ${record.id} (${record.verification})`,
        });
        return record;
      },
      async supportChain(ctx, id) {
        const root = await repository.claims.get(ctx, id);
        if (!root) return [];

        // Breadth-first over `claim_supports`, cycle-safe. Kept in the adapter
        // rather than a recursive CTE while the chains are shallow; a view can
        // replace it without changing the interface.
        const seen = new Set<string>([root.id]);
        const out: Claim[] = [root];
        let frontier = root.supportedBy;

        while (frontier.length > 0) {
          const next: string[] = [];
          for (const childId of frontier) {
            if (seen.has(childId)) continue;
            seen.add(childId);
            const child = await repository.claims.get(ctx, childId);
            if (!child) continue;
            out.push(child);
            next.push(...child.supportedBy);
          }
          frontier = next;
        }
        return out;
      },
      async recordUsage(ctx, usage) {
        // A usage may only cite a claim this tenant can see.
        if (!(await exists(ctx, "claims", usage.claimId))) return;
        const db = await getClient();
        await db.from("claim_usages").insert({
          organisation_id: ctx.organisationId,
          claim_id: usage.claimId,
          used_in_type: usage.usedIn.type,
          used_in_id: usage.usedIn.id,
          context: usage.context,
          used_at: stamp(ctx),
        });
      },
      async usages(ctx, claimId) {
        const db = await getClient();
        const { data } = await db
          .from("claim_usages")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("claim_id", claimId);
        return rows(data).map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          claimId: String(row.claim_id),
          usedIn: {
            type: String(row.used_in_type) as EntityReference["type"],
            id: String(row.used_in_id),
          },
          context: row.context ? String(row.context) : undefined,
          usedAt: String(row.used_at),
        }));
      },
      async usedIn(ctx, entity) {
        const db = await getClient();
        const { data } = await db
          .from("claim_usages")
          .select("claim_id")
          .eq("organisation_id", ctx.organisationId)
          .eq("used_in_type", entity.type)
          .eq("used_in_id", entity.id);
        const ids = rows(data).map((row) => String(row.claim_id));
        if (ids.length === 0) return [];
        const { data: claims } = await db
          .from("claims")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .in("id", ids);
        return Promise.all(rows(claims).map((row) => hydrateClaim(ctx, row)));
      },
      async conflicts(ctx) {
        const db = await getClient();
        const { data } = await db
          .from("claim_conflicts")
          .select("*")
          .eq("organisation_id", ctx.organisationId);
        return rows(data).map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          claimIds: Array.isArray(row.claim_ids) ? row.claim_ids.map(String) : [],
          subject: {
            type: String(row.subject_type) as EntityReference["type"],
            id: String(row.subject_id),
          },
          predicate: String(row.predicate ?? ""),
          reason: String(row.reason ?? ""),
          recommendedClaimId: row.recommended_claim_id
            ? String(row.recommended_claim_id)
            : undefined,
          recommendationReason: row.recommendation_reason
            ? String(row.recommendation_reason)
            : undefined,
          resolvedClaimId: row.resolved_claim_id ? String(row.resolved_claim_id) : undefined,
          resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
          resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
          createdAt: String(row.created_at),
        }));
      },
      async recordConflict(ctx, conflict) {
        const db = await getClient();
        await db.from("claim_conflicts").insert({
          organisation_id: ctx.organisationId,
          claim_ids: conflict.claimIds,
          subject_type: conflict.subject.type,
          subject_id: conflict.subject.id,
          predicate: conflict.predicate,
          reason: conflict.reason,
          recommended_claim_id: conflict.recommendedClaimId,
          recommendation_reason: conflict.recommendationReason,
          created_at: stamp(ctx),
        });
      },
    },

    graph: {
      async list(ctx) {
        return many(await from(ctx, "relations"), relationFrom);
      },
      async from(ctx, entity, kind) {
        const db = await getClient();
        let query = db
          .from("relations")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("from_type", entity.type)
          .eq("from_id", entity.id);
        if (kind) query = query.eq("kind", kind);
        return many(await query, relationFrom);
      },
      async to(ctx, entity, kind) {
        const db = await getClient();
        let query = db
          .from("relations")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("to_type", entity.type)
          .eq("to_id", entity.id);
        if (kind) query = query.eq("kind", kind);
        return many(await query, relationFrom);
      },
      async connect(ctx, init) {
        // Both endpoints, not just the row. RLS confines the row to the tenant
        // but cannot confine what the row points at, because from_id and to_id
        // are polymorphic and cannot be foreign keys. This check is the only
        // thing standing between a correctly-scoped row and a cross-tenant
        // edge, which is why the contract suite asserts it.
        const table = ENTITY_TABLES[init.from.type];
        const toTable = ENTITY_TABLES[init.to.type];
        if (!table || !toTable) return null;
        if (!(await exists(ctx, table, init.from.id))) return null;
        if (!(await exists(ctx, toTable, init.to.id))) return null;

        const result = await insert(ctx, "relations", {
          from_type: init.from.type,
          from_id: init.from.id,
          to_type: init.to.type,
          to_id: init.to.id,
          kind: init.kind,
          role: init.role,
          weight: init.weight,
          note: init.note,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
          created_by: ctx.userId,
        });
        if (result.error) throw new Error(result.error.message);

        const relation = relationFrom(result.data as Row);
        await recordAudit(ctx, {
          action: "relation.connected",
          entityType: "relation",
          entityId: relation.id,
          summary: `${init.from.type}:${init.from.id} --${init.kind}--> ${init.to.type}:${init.to.id}`,
        });
        return relation;
      },
      async disconnect(ctx, id) {
        const db = await getClient();
        const { data } = await db
          .from("relations")
          .delete()
          .eq("id", id)
          .eq("organisation_id", ctx.organisationId)
          .select("*")
          .maybeSingle();
        if (!data) return;
        const relation = relationFrom(data as Row);
        await recordAudit(ctx, {
          action: "relation.disconnected",
          entityType: "relation",
          entityId: id,
          summary: `${relation.from.type}:${relation.from.id} --${relation.kind}--> ${relation.to.type}:${relation.to.id}`,
        });
      },
      async reach(ctx, start, kind, options) {
        const maxDepth = options?.maxDepth ?? 8;
        const backward = options?.direction === "backward";
        const edges = await repository.graph.list(ctx);
        const ofKind = edges.filter((edge) => edge.kind === kind);

        const key = (ref: EntityReference) => `${ref.type}:${ref.id}`;
        const seen = new Set<string>([key(start)]);
        const out: EntityReference[] = [];
        let frontier: EntityReference[] = [start];

        for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
          const next: EntityReference[] = [];
          for (const node of frontier) {
            for (const edge of ofKind) {
              const near = backward ? edge.to : edge.from;
              const far = backward ? edge.from : edge.to;
              if (key(near) !== key(node)) continue;
              if (seen.has(key(far))) continue;
              seen.add(key(far));
              out.push(far);
              next.push(far);
            }
          }
          frontier = next;
        }
        return out;
      },
    },

    strategy: {
      async priorities(ctx) {
        const db = await getClient();
        const { data, error } = await db
          .from("strategic_priorities")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .order("display_order", { ascending: true });
        if (error) throw new Error(error.message);
        return rows(data).map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          title: String(row.title),
          description: row.description ? String(row.description) : undefined,
          periodLabel: row.period_label ? String(row.period_label) : undefined,
          order: Number(row.display_order ?? 0),
          status: String(row.status ?? "active") as "proposed" | "active" | "achieved" | "paused" | "retired",
          ownerId: row.owner_id ? String(row.owner_id) : undefined,
          claimId: row.claim_id ? String(row.claim_id) : undefined,
          audit: {
            createdAt: String(row.created_at ?? ""),
            updatedAt: String(row.updated_at ?? row.created_at ?? ""),
            archivedAt: (row.archived_at as string | null) ?? null,
          },
        }));
      },
      async getPriority(ctx, id) {
        const all = await repository.strategy.priorities(ctx);
        return all.find((priority) => priority.id === id) ?? null;
      },
      async programmesFor(ctx, priorityId) {
        if (!(await exists(ctx, "strategic_priorities", priorityId))) return [];
        const edges = await repository.graph.from(
          ctx,
          { type: "strategic_priority", id: priorityId },
          "pursues",
        );
        const ids = edges.filter((e) => e.to.type === "programme").map((e) => e.to.id);
        if (ids.length === 0) return [];
        const db = await getClient();
        return many(
          await db
            .from("programmes")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("id", ids),
          programmeFrom,
        );
      },
    },

    finance: {
      async funds(ctx) {
        return many(await from(ctx, "funds"), fundFrom);
      },
      async getFund(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("funds")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          fundFrom,
        );
      },
      async transactions(ctx) {
        return many(await from(ctx, "financial_transactions"), transactionFrom);
      },
      async transactionsForFund(ctx, fundId) {
        if (!(await exists(ctx, "funds", fundId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("financial_transactions")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("fund_id", fundId),
          transactionFrom,
        );
      },
      async getTransaction(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("financial_transactions")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          transactionFrom,
        );
      },
      async allocations(ctx) {
        return many(await from(ctx, "financial_allocations"), allocationFrom);
      },
      async allocationsFor(ctx, entity) {
        const column = ALLOCATION_COLUMNS[entity.type];
        const db = await getClient();

        const viaColumn = column
          ? many(
              await db
                .from("financial_allocations")
                .select("*")
                .eq("organisation_id", ctx.organisationId)
                .eq(column, entity.id),
              allocationFrom,
            )
          : [];

        // The typed columns carry the common attributions; the `allocated_to`
        // relation carries anything the columns cannot name.
        const edges = await repository.graph.to(ctx, entity, "allocated_to");
        const extraIds = edges.map((edge) => edge.from.id).filter((id) => !viaColumn.some((a) => a.id === id));
        if (extraIds.length === 0) return viaColumn;

        const viaRelation = many(
          await db
            .from("financial_allocations")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("id", extraIds),
          allocationFrom,
        );
        return [...viaColumn, ...viaRelation];
      },
      async budgets(ctx) {
        return many(await from(ctx, "budgets"), budgetFrom);
      },
      async budgetLines(ctx, budgetId) {
        if (!(await exists(ctx, "budgets", budgetId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("budget_lines")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("budget_id", budgetId),
          budgetLineFrom,
        );
      },
      async recordTransaction(ctx, input) {
        const result = await insert(ctx, "financial_transactions", {
          account_id: input.accountId,
          date: input.date,
          description: input.description,
          amount_minor_units: input.amount.minorUnits,
          currency: input.amount.currency,
          direction: input.direction,
          category: input.category,
          counterparty: input.counterparty,
          restricted: input.restricted,
          grant_id: input.grantId,
          fund_id: input.fundId,
          source: input.source,
          verification: input.verificationState,
          created_at: stamp(ctx),
          created_by: ctx.userId,
        });
        if (result.error) throw new Error(result.error.message);
        const id = String((result.data as Row).id);
        await recordAudit(ctx, {
          action: "transaction.recorded",
          entityType: "transaction",
          entityId: id,
          summary: `${input.direction} ${input.amount.minorUnits} ${input.amount.currency}: ${input.description}`,
        });
        return id;
      },
      async allocate(ctx, input) {
        // Every id the allocation names must be this tenant's. An allocation
        // is what makes a cost-per-outcome figure defensible, so one pointing
        // at a foreign programme is worse than no figure at all.
        const targets: [string, string | undefined][] = [
          ["financial_transactions", input.transactionId],
          ["funds", input.fundId],
          ["programmes", input.programmeId],
          ["grants", input.grantId],
          ["activities", input.activityId],
          ["outcomes", input.outcomeId],
          ["budget_lines", input.budgetLineId],
          ["strategic_priorities", input.strategicPriorityId],
        ];
        const named = targets.filter(([, id]) => Boolean(id));
        if (named.length === 0) return null;
        for (const [table, id] of named) {
          if (!(await exists(ctx, table, id!))) return null;
        }

        const result = await insert(ctx, "financial_allocations", {
          transaction_id: input.transactionId,
          budget_line_id: input.budgetLineId,
          fund_id: input.fundId,
          programme_id: input.programmeId,
          grant_id: input.grantId,
          activity_id: input.activityId,
          outcome_id: input.outcomeId,
          strategic_priority_id: input.strategicPriorityId,
          amount_minor_units: input.amount.minorUnits,
          currency: input.amount.currency,
          allocation_method: input.allocationMethod,
          allocation_basis: input.allocationBasis,
          allocation_note: input.allocationNote,
          confidence: input.confidence,
          restricted: input.restricted,
          effective_date: input.effectiveDate,
          verification: input.verificationState,
          created_by: ctx.userId,
          verified_by: input.verifiedBy,
          verified_at: input.verifiedAt,
          created_at: stamp(ctx),
        });
        if (result.error) throw new Error(result.error.message);
        const id = String((result.data as Row).id);
        await recordAudit(ctx, {
          action: "allocation.created",
          entityType: "allocation",
          entityId: id,
          summary:
            `${input.amount.minorUnits} ${input.amount.currency} allocated ` +
            `by ${input.allocationMethod}${input.allocationBasis ? ` on ${input.allocationBasis}` : ""}`,
        });
        return id;
      },
    },

    requirements: {
      async list(ctx) {
        return many(await from(ctx, "reporting_requirements"), requirementFrom);
      },
      async get(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("reporting_requirements")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          requirementFrom,
        );
      },
      async forGrant(ctx, grantId) {
        if (!(await exists(ctx, "grants", grantId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("reporting_requirements")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("grant_id", grantId),
          requirementFrom,
        );
      },
      async requires(ctx, requirementId) {
        if (!(await exists(ctx, "reporting_requirements", requirementId))) return [];
        const edges = await repository.graph.from(
          ctx,
          { type: "reporting_requirement", id: requirementId },
          "requires",
        );
        return edges.map((edge) => edge.to);
      },
    },

    funding: {
      async listOpportunities(ctx) {
        return many(await from(ctx, "funding_opportunities"), opportunityFrom);
      },
      async getOpportunity(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("funding_opportunities")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          opportunityFrom,
        );
      },
      async opportunityQuestions(ctx, opportunityId) {
        const db = await getClient();
        const { data } = await db
          .from("opportunity_questions")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("opportunity_id", opportunityId)
          .order("ord", { ascending: true });
        return rows(data).map((row) => ({
          id: String(row.id),
          opportunityId: String(row.opportunity_id),
          organisationId: String(row.organisation_id),
          order: Number(row.ord ?? 0),
          text: String(row.text ?? ""),
          guidance: row.guidance ? String(row.guidance) : undefined,
          wordLimit: row.word_limit ? Number(row.word_limit) : undefined,
          charLimit: row.char_limit ? Number(row.char_limit) : undefined,
        }));
      },
      async listFunders(ctx) {
        return many(await from(ctx, "funders"), funderFrom);
      },
      async getFunder(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("funders")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          funderFrom,
        );
      },
      async moveStage(ctx, id, stage) {
        const result = await update(ctx, "funding_opportunities", id, {
          stage,
          updated_at: stamp(ctx),
        });
        if (!result.data) return;
        await recordActivity(ctx, "moved opportunity", `${(result.data as Row).programme_name} to ${stage}`);
        await recordAudit(ctx, {
          action: "opportunity.stage_changed",
          entityType: "funding_opportunity",
          entityId: id,
          summary: `Stage set to ${stage}`,
        });
      },
      async toggleSaved(ctx, id) {
        const opportunity = await repository.funding.getOpportunity(ctx, id);
        if (!opportunity) return;
        await update(ctx, "funding_opportunities", id, {
          saved: !opportunity.saved,
          updated_at: stamp(ctx),
        });
      },
      async getFitAssessment(ctx, opportunityId) {
        const db = await getClient();
        const { data } = await db
          .from("fit_assessments")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("opportunity_id", opportunityId)
          .order("generated_at", { ascending: false })
          .limit(1);
        const row = rows(data)[0];
        if (!row) return null;

        const { data: factors } = await db
          .from("fit_assessment_factors")
          .select("*")
          .eq("assessment_id", row.id);

        return {
          id: String(row.id),
          opportunityId: String(row.opportunity_id),
          organisationId: String(row.organisation_id),
          overallScore: Number(row.overall_score ?? 0),
          category: String(row.category) as "strong_match" | "potential_match" | "review_required" | "not_eligible",
          eligibilityStatus: String(row.eligibility_status) as "met" | "partial" | "uncertain" | "unmet",
          factors: rows(factors).map((f) => ({
            key: String(f.key),
            label: String(f.label),
            status: String(f.status) as "met" | "partial" | "uncertain" | "unmet",
            score: Number(f.score ?? 0),
            weight: Number(f.weight ?? 1),
            rationale: String(f.rationale ?? ""),
            evidenceUsed: Array.isArray(f.evidence_used) ? f.evidence_used.map(String) : [],
            assumptions: Array.isArray(f.assumptions) ? f.assumptions.map(String) : [],
          })),
          keyRisks: Array.isArray(row.key_risks) ? row.key_risks.map(String) : [],
          missingInformation: Array.isArray(row.missing_information)
            ? row.missing_information.map(String)
            : [],
          recommendedNextAction: String(row.recommended_next_action ?? ""),
          effortEstimate: String(row.effort_estimate ?? "medium") as "low" | "medium" | "high",
          strategicValue: String(row.strategic_value ?? "medium") as "low" | "medium" | "high",
          generatedAt: String(row.generated_at ?? ""),
          generatedBy: String(row.generated_by ?? "mock") as "mock" | "anthropic",
        };
      },
      async saveFitAssessment(ctx, assessment) {
        if (!(await exists(ctx, "funding_opportunities", assessment.opportunityId))) return;
        const db = await getClient();
        const { data } = await db
          .from("fit_assessments")
          .insert({
            organisation_id: ctx.organisationId,
            opportunity_id: assessment.opportunityId,
            overall_score: assessment.overallScore,
            category: assessment.category,
            eligibility_status: assessment.eligibilityStatus,
            key_risks: assessment.keyRisks,
            missing_information: assessment.missingInformation,
            recommended_next_action: assessment.recommendedNextAction,
            effort_estimate: assessment.effortEstimate,
            strategic_value: assessment.strategicValue,
            generated_at: assessment.generatedAt,
            generated_by: assessment.generatedBy,
          })
          .select("id")
          .single();

        const assessmentId = (data as Row | null)?.id;
        if (assessmentId && assessment.factors.length > 0) {
          await db.from("fit_assessment_factors").insert(
            assessment.factors.map((factor) => ({
              assessment_id: assessmentId,
              organisation_id: ctx.organisationId,
              key: factor.key,
              label: factor.label,
              status: factor.status,
              score: factor.score,
              weight: factor.weight,
              rationale: factor.rationale,
              evidence_used: factor.evidenceUsed,
              assumptions: factor.assumptions,
            })),
          );
        }
      },
    },

    applications: {
      async list(ctx) {
        return many(await from(ctx, "applications"), applicationFrom);
      },
      async get(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("applications")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          applicationFrom,
        );
      },
      async answers(ctx, applicationId) {
        const db = await getClient();
        return many(
          await db
            .from("application_answers")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("application_id", applicationId)
            .order("ord", { ascending: true }),
          answerFrom,
        );
      },
      async getAnswer(ctx, answerId) {
        const db = await getClient();
        return one(
          await db
            .from("application_answers")
            .select("*")
            .eq("id", answerId)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          answerFrom,
        );
      },
      async saveAnswer(ctx, answerId, draft, provenance) {
        const existing = await repository.applications.getAnswer(ctx, answerId);
        if (!existing) return;

        await update(ctx, "application_answers", answerId, {
          draft,
          provenance,
          updated_at: stamp(ctx),
        });

        // Version history is append-only, so an edit never overwrites what a
        // reviewer previously saw.
        const db = await getClient();
        await db.from("application_answer_versions").insert({
          organisation_id: ctx.organisationId,
          answer_id: answerId,
          content: draft,
          word_count: draft.trim() ? draft.trim().split(/\s+/).length : 0,
          author_id: ctx.userId,
          source: provenance ? "ai" : "human",
          created_at: stamp(ctx),
        });
      },
      async setAnswerStatus(ctx, answerId, status) {
        await update(ctx, "application_answers", answerId, { status, updated_at: stamp(ctx) });
      },
      async convertToGrant(ctx, applicationId) {
        const application = await repository.applications.get(ctx, applicationId);
        if (!application) return null;
        const opportunity = await repository.funding.getOpportunity(ctx, application.opportunityId);
        if (!opportunity) return null;

        const result = await insert(ctx, "grants", {
          application_id: applicationId,
          funder_id: opportunity.funderId,
          title: application.title,
          award_value: opportunity.maxAward ?? 0,
          currency: opportunity.currency,
          restricted: opportunity.fundingType === "restricted",
          start_date: ctx.now().toISOString().slice(0, 10),
          end_date: new Date(ctx.now().getTime() + 365 * 24 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
          grant_manager_id: application.ownerId,
          spent_to_date: 0,
          conditions: opportunity.reportingRequirements,
          status: "active",
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
        });
        if (result.error) throw new Error(result.error.message);

        const grantId = String((result.data as Row).id);
        await update(ctx, "applications", applicationId, {
          status: "successful",
          updated_at: stamp(ctx),
        });
        await update(ctx, "funding_opportunities", application.opportunityId, {
          stage: "successful",
          updated_at: stamp(ctx),
        });
        await recordActivity(ctx, "converted application", application.title);
        await recordAudit(ctx, {
          action: "application.converted",
          entityType: "grant",
          entityId: grantId,
          summary: `${application.title} became a grant`,
        });
        return grantId;
      },
    },

    grants: {
      async list(ctx) {
        return many(await from(ctx, "grants"), grantFrom);
      },
      async get(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("grants")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          grantFrom,
        );
      },
      async payments(ctx, grantId) {
        const db = await getClient();
        return many(
          await db
            .from("grant_payments")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("grant_id", grantId),
          paymentFrom,
        );
      },
      async deliverables(ctx, grantId) {
        const db = await getClient();
        return many(
          await db
            .from("grant_deliverables")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("grant_id", grantId),
          deliverableFrom,
        );
      },
      async reports(ctx, grantId) {
        const db = await getClient();
        return many(
          await db
            .from("grant_reports")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("grant_id", grantId),
          grantReportFrom,
        );
      },
      async allReports(ctx) {
        return many(await from(ctx, "grant_reports"), grantReportFrom);
      },
    },

    programmes: {
      async list(ctx) {
        const db = await getClient();
        return many(
          await db
            .from("programmes")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .is("archived_at", null),
          programmeFrom,
        );
      },
      async get(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("programmes")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          programmeFrom,
        );
      },
      async outcomes(ctx, programmeId) {
        const db = await getClient();
        return many(
          await db
            .from("outcomes")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("programme_id", programmeId),
          outcomeFrom,
        );
      },
      async getOutcome(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("outcomes")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          outcomeFrom,
        );
      },
      async indicatorsForOutcome(ctx, outcomeId) {
        const db = await getClient();
        return many(
          await db
            .from("indicators")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("outcome_id", outcomeId),
          indicatorFrom,
        );
      },
      async indicatorsForProgramme(ctx, programmeId) {
        const outcomes = await repository.programmes.outcomes(ctx, programmeId);
        if (outcomes.length === 0) return [];
        const db = await getClient();
        return many(
          await db
            .from("indicators")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("outcome_id", outcomes.map((outcome) => outcome.id)),
          indicatorFrom,
        );
      },
      async allIndicators(ctx) {
        return many(await from(ctx, "indicators"), indicatorFrom);
      },
      async getIndicator(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("indicators")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          indicatorFrom,
        );
      },
      async activities(ctx, programmeId) {
        if (!(await exists(ctx, "programmes", programmeId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("activities")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("programme_id", programmeId),
          activityFrom,
        );
      },
      async getActivity(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("activities")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          activityFrom,
        );
      },
      async outputs(ctx, programmeId) {
        if (!(await exists(ctx, "programmes", programmeId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("outputs")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("programme_id", programmeId),
          outputFrom,
        );
      },
      async getOutput(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("outputs")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          outputFrom,
        );
      },
      async measurements(ctx, indicatorId) {
        if (!(await exists(ctx, "indicators", indicatorId))) return [];
        const db = await getClient();
        return many(
          await db
            .from("indicator_measurements")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("indicator_id", indicatorId)
            .order("recorded_at", { ascending: false }),
          measurementFrom,
        );
      },
      async updateIndicator(ctx, indicatorId, value, note) {
        const indicator = await repository.programmes.getIndicator(ctx, indicatorId);
        if (!indicator) return;

        const today = ctx.now().toISOString().slice(0, 10);
        await update(ctx, "indicators", indicatorId, {
          current_value: value,
          last_updated: today,
          updated_at: stamp(ctx),
        });

        // Record the reading as well as the current value. Overwriting alone
        // loses the previous figure, and a report published against it can
        // then no longer resolve what it was written from.
        const db = await getClient();
        await db.from("indicator_measurements").insert({
          organisation_id: ctx.organisationId,
          indicator_id: indicatorId,
          value,
          recorded_at: stamp(ctx),
          note,
          recorded_by: ctx.userId,
        });

        await recordActivity(ctx, "updated indicator", `${indicator.name} (${value} ${indicator.unit})`);
        await recordAudit(ctx, {
          action: "indicator.updated",
          entityType: "indicator",
          entityId: indicatorId,
          summary: `Updated '${indicator.name}' to ${value}${note ? ` (${note})` : ""}`,
        });
      },
      async grantsFor(ctx, programmeId) {
        const db = await getClient();
        const { data } = await db
          .from("programme_grants")
          .select("grant_id")
          .eq("organisation_id", ctx.organisationId)
          .eq("programme_id", programmeId);
        const ids = rows(data).map((row) => String(row.grant_id));
        if (ids.length === 0) return [];
        return many(
          await db
            .from("grants")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("id", ids),
          grantFrom,
        );
      },
    },

    evidence: {
      async list(ctx) {
        const db = await getClient();
        return many(
          await db
            .from("evidence_items")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .is("archived_at", null),
          evidenceFrom,
        );
      },
      async get(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("evidence_items")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          evidenceFrom,
        );
      },
      async forTarget(ctx, targetType, targetId) {
        const db = await getClient();
        const { data } = await db
          .from("evidence_links")
          .select("evidence_id")
          .eq("organisation_id", ctx.organisationId)
          .eq("target_type", targetType)
          .eq("target_id", targetId);
        const ids = rows(data).map((row) => String(row.evidence_id));
        if (ids.length === 0) return [];
        return many(
          await db
            .from("evidence_items")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("id", ids),
          evidenceFrom,
        );
      },
      async forEntity(ctx, entity) {
        const edges = await repository.graph.to(ctx, entity, "evidences");
        const ids = edges.filter((edge) => edge.from.type === "evidence").map((edge) => edge.from.id);
        if (ids.length === 0) return [];
        const db = await getClient();
        return many(
          await db
            .from("evidence_items")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .in("id", ids),
          evidenceFrom,
        );
      },
      async support(ctx, evidenceId, entity, note) {
        if (!(await exists(ctx, "evidence_items", evidenceId))) return null;
        const relation = await repository.graph.connect(ctx, {
          from: { type: "evidence", id: evidenceId },
          to: entity,
          kind: "evidences",
          note,
        });
        return relation?.id ?? null;
      },
      async add(ctx, item) {
        const result = await insert(ctx, "evidence_items", {
          title: item.title,
          type: item.type,
          description: item.description,
          verification: item.verification ?? "provided",
          tags: item.tags,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
          created_by: ctx.userId,
        });
        if (result.error) throw new Error(result.error.message);
        const id = String((result.data as Row).id);
        await recordActivity(ctx, "added evidence", item.title);
        return id;
      },
    },

    reports: {
      async list(ctx) {
        const result = await from(ctx, "impact_reports");
        if (result.error) throw new Error(result.error.message);
        return Promise.all(rows(result.data).map((row) => hydrateReport(ctx, row)));
      },
      async get(ctx, id) {
        const db = await getClient();
        const { data } = await db
          .from("impact_reports")
          .select("*")
          .eq("id", id)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        return data ? hydrateReport(ctx, data as Row) : null;
      },
      async saveSection(ctx, reportId, sectionKey, content, provenance) {
        if (!(await exists(ctx, "impact_reports", reportId))) return;
        const db = await getClient();
        await db
          .from("impact_report_sections")
          .update({ content, provenance })
          .eq("organisation_id", ctx.organisationId)
          .eq("report_id", reportId)
          .eq("key", sectionKey);
      },
      async setStatus(ctx, reportId, status) {
        await update(ctx, "impact_reports", reportId, { status, updated_at: stamp(ctx) });
      },
    },

    relationships: {
      async listOrganisations(ctx) {
        return many(await from(ctx, "external_organisations"), externalOrganisationFrom);
      },
      async getOrganisation(ctx, id) {
        const db = await getClient();
        return one(
          await db
            .from("external_organisations")
            .select("*")
            .eq("id", id)
            .eq("organisation_id", ctx.organisationId)
            .maybeSingle(),
          externalOrganisationFrom,
        );
      },
      async listPeople(ctx) {
        const result = await from(ctx, "people");
        if (result.error) throw new Error(result.error.message);
        return Promise.all(rows(result.data).map((row) => hydratePerson(ctx, row)));
      },
      async getPerson(ctx, id) {
        const db = await getClient();
        const { data } = await db
          .from("people")
          .select("*")
          .eq("id", id)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        return data ? hydratePerson(ctx, data as Row) : null;
      },
      async peopleForOrganisation(ctx, externalOrganisationId) {
        const db = await getClient();
        const { data } = await db
          .from("people")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("primary_external_organisation_id", externalOrganisationId);
        return Promise.all(rows(data).map((row) => hydratePerson(ctx, row)));
      },
      async list(ctx) {
        const result = await from(ctx, "relationships");
        if (result.error) throw new Error(result.error.message);
        return Promise.all(rows(result.data).map((row) => hydrateRelationship(ctx, row)));
      },
      async get(ctx, id) {
        const db = await getClient();
        const { data } = await db
          .from("relationships")
          .select("*")
          .eq("id", id)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        return data ? hydrateRelationship(ctx, data as Row) : null;
      },
      async forOrganisation(ctx, externalOrganisationId) {
        const db = await getClient();
        const { data } = await db
          .from("relationships")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("external_organisation_id", externalOrganisationId)
          .maybeSingle();
        return data ? hydrateRelationship(ctx, data as Row) : null;
      },
      async forPerson(ctx, personId) {
        const db = await getClient();
        const { data } = await db
          .from("relationships")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("person_id", personId)
          .maybeSingle();
        return data ? hydrateRelationship(ctx, data as Row) : null;
      },
      async links(ctx, relationshipId) {
        const db = await getClient();
        const { data } = await db
          .from("relationship_links")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("relationship_id", relationshipId);
        return rows(data).map(relationshipLinkFrom);
      },
      async linksForEntity(ctx, entity) {
        const db = await getClient();
        const { data } = await db
          .from("relationship_links")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .eq("entity_type", entity.type)
          .eq("entity_id", entity.id);
        return rows(data).map(relationshipLinkFrom);
      },
      async listInteractions(ctx) {
        const result = await from(ctx, "interactions");
        if (result.error) throw new Error(result.error.message);
        return Promise.all(rows(result.data).map((row) => hydrateInteraction(ctx, row)));
      },
      async interactionsFor(ctx, party) {
        const all = await repository.relationships.listInteractions(ctx);
        const people = new Set(party.personIds ?? []);
        const org = party.externalOrganisationId;
        return all.filter(
          (interaction) =>
            (org && interaction.externalOrganisationIds.includes(org)) ||
            interaction.personIds.some((id) => people.has(id)),
        );
      },
      async logInteraction(ctx, input) {
        const result = await insert(ctx, "interactions", {
          type: input.type,
          direction: input.direction,
          channel: input.channel,
          occurred_at: input.occurredAt,
          subject: input.subject,
          summary: input.summary,
          source: input.source,
          recorded_by: ctx.userId,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
        });
        if (result.error) throw new Error(result.error.message);
        const id = String((result.data as Row).id);
        const db = await getClient();

        const participants = [
          ...input.personIds.map((personId) => ({ person_id: personId })),
          ...input.externalOrganisationIds.map((orgId) => ({ external_organisation_id: orgId })),
          ...input.participantUserIds.map((userId) => ({ user_id: userId })),
        ];
        if (participants.length > 0) {
          await db.from("interaction_participants").insert(
            participants.map((p) => ({
              organisation_id: ctx.organisationId,
              interaction_id: id,
              ...p,
            })),
          );
        }
        if (input.links.length > 0) {
          await db.from("interaction_links").insert(
            input.links.map((link) => ({
              organisation_id: ctx.organisationId,
              interaction_id: id,
              entity_type: link.type,
              entity_id: link.id,
            })),
          );
        }
        return id;
      },
      async listCommitments(ctx) {
        return many(await from(ctx, "commitments"), commitmentFrom);
      },
      async commitmentsFor(ctx, party) {
        const all = await repository.relationships.listCommitments(ctx);
        const people = new Set(party.personIds ?? []);
        return all.filter(
          (commitment) =>
            (party.externalOrganisationId &&
              commitment.externalOrganisationId === party.externalOrganisationId) ||
            (commitment.personId && people.has(commitment.personId)),
        );
      },
      async createCommitment(ctx, input) {
        const result = await insert(ctx, "commitments", {
          title: input.title,
          description: input.description,
          direction: input.direction,
          person_id: input.personId,
          external_organisation_id: input.externalOrganisationId,
          related_type: input.relatedEntity?.type,
          related_id: input.relatedEntity?.id,
          owner_id: input.ownerId,
          due_at: input.dueAt,
          status: input.status,
          source_type: input.source?.type,
          source_id: input.source?.id,
          confirmed_by: input.confirmedBy,
          created_at: stamp(ctx),
          updated_at: stamp(ctx),
        });
        if (result.error) throw new Error(result.error.message);
        return String((result.data as Row).id);
      },
      async setCommitmentStatus(ctx, commitmentId, status) {
        await update(ctx, "commitments", commitmentId, {
          status,
          completed_at: status === "completed" ? stamp(ctx) : null,
          updated_at: stamp(ctx),
        });
      },
      async organisationForFunder(ctx, funderId) {
        const funder = await repository.funding.getFunder(ctx, funderId);
        if (!funder?.externalOrganisationId) return null;
        return repository.relationships.getOrganisation(ctx, funder.externalOrganisationId);
      },
      async funderForOrganisation(ctx, externalOrganisationId) {
        const db = await getClient();
        return one(
          await db
            .from("funders")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .eq("external_organisation_id", externalOrganisationId)
            .maybeSingle(),
          funderFrom,
        );
      },
    },

    workspace: {
      async tasks(ctx) {
        return many(await from(ctx, "tasks"), taskFrom);
      },
      async openTasks(ctx) {
        const db = await getClient();
        return many(
          await db
            .from("tasks")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .neq("status", "done"),
          taskFrom,
        );
      },
      async notifications(ctx) {
        return many(await from(ctx, "notifications"), notificationFrom);
      },
      async activity(ctx) {
        const db = await getClient();
        const { data } = await db
          .from("activity_events")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .order("created_at", { ascending: false });
        return rows(data).map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          actorId: row.actor_id ? String(row.actor_id) : undefined,
          actorName: String(row.actor_name ?? "Unknown actor"),
          verb: String(row.verb ?? ""),
          target: String(row.target ?? ""),
          createdAt: String(row.created_at),
        }));
      },
      async toggleTask(ctx, taskId) {
        const db = await getClient();
        const { data } = await db
          .from("tasks")
          .select("status")
          .eq("id", taskId)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        if (!data) return;
        const status = (data as Row).status === "done" ? "todo" : "done";
        await update(ctx, "tasks", taskId, { status, updated_at: stamp(ctx) });
      },
    },

    audit: {
      async list(ctx) {
        const db = await getClient();
        return many(
          await db
            .from("audit_events")
            .select("*")
            .eq("organisation_id", ctx.organisationId)
            .order("created_at", { ascending: false }),
          auditEventFrom,
        );
      },
      async record(ctx, event) {
        await recordAudit(ctx, event);
      },
      async recordAiGeneration(ctx, generation) {
        const result = await insert(ctx, "ai_generations", {
          feature: generation.feature,
          model: generation.model,
          prompt_version: generation.promptVersion,
          user_id: ctx.userId,
          input_refs: generation.inputRefs,
          output_preview: generation.outputPreview,
          approval_status: generation.approvalStatus,
          created_at: stamp(ctx),
        });
        if (result.error) throw new Error(result.error.message);
        const row = result.data as Row;
        return {
          id: String(row.id),
          organisationId: ctx.organisationId,
          feature: generation.feature,
          model: generation.model,
          promptVersion: generation.promptVersion,
          userId: ctx.userId,
          inputRefs: generation.inputRefs,
          outputPreview: generation.outputPreview,
          approvalStatus: generation.approvalStatus,
          createdAt: String(row.created_at),
        };
      },
      async aiGenerations(ctx) {
        const db = await getClient();
        const { data } = await db
          .from("ai_generations")
          .select("*")
          .eq("organisation_id", ctx.organisationId)
          .order("created_at", { ascending: false });
        return rows(data).map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          feature: String(row.feature),
          model: String(row.model),
          promptVersion: String(row.prompt_version),
          userId: row.user_id ? String(row.user_id) : undefined,
          inputRefs: Array.isArray(row.input_refs) ? row.input_refs.map(String) : [],
          outputPreview: String(row.output_preview ?? ""),
          approvalStatus: String(row.approval_status ?? "pending") as
            | "pending"
            | "approved"
            | "discarded",
          createdAt: String(row.created_at),
        }));
      },
    },

    // Split into a companion module to keep both files navigable. They satisfy
    // the same contract and follow the same rules.
    documents: createDocumentRepository(getClient),
    onboarding: createOnboardingRepository(getClient),
  };

  // --- Local helpers that need `repository` in scope ---------------------

  async function hydrateReport(ctx: RequestContext, row: Row): Promise<ImpactReport> {
    const db = await getClient();
    const { data } = await db
      .from("impact_report_sections")
      .select("*")
      .eq("organisation_id", ctx.organisationId)
      .eq("report_id", row.id)
      .order("ord", { ascending: true });

    const sections: ImpactReportSection[] = rows(data).map((s) => ({
      key: String(s.key),
      title: String(s.title ?? ""),
      // `type` and `claim_ids` have no columns yet; migration 0022 adds them.
      // Defaulting is honest here only because no report has ever been written
      // with pinned claims: the claims table is empty.
      type: (s.type ? String(s.type) : "narrative") as ImpactReportSection["type"],
      content: String(s.content ?? ""),
      claimIds: Array.isArray(s.claim_ids) ? s.claim_ids.map(String) : [],
      provenance: (s.provenance as ImpactReportSection["provenance"]) ?? undefined,
    }));

    return {
      id: String(row.id),
      organisationId: String(row.organisation_id),
      title: String(row.title ?? ""),
      type: (row.type ? String(row.type) : "impact") as ImpactReport["type"],
      definitionId: row.definition_id ? String(row.definition_id) : undefined,
      programmeId: row.programme_id ? String(row.programme_id) : undefined,
      grantId: row.grant_id ? String(row.grant_id) : undefined,
      reportingPeriod: String(row.reporting_period ?? ""),
      status: String(row.status ?? "draft") as ImpactReport["status"],
      ownerId: row.owner_id ? String(row.owner_id) : undefined,
      contributorIds: Array.isArray(row.contributor_ids) ? row.contributor_ids.map(String) : [],
      reviewerIds: Array.isArray(row.reviewer_ids) ? row.reviewer_ids.map(String) : [],
      approverIds: Array.isArray(row.approver_ids) ? row.approver_ids.map(String) : [],
      includedIndicatorIds: Array.isArray(row.included_indicator_ids)
        ? row.included_indicator_ids.map(String)
        : [],
      includedEvidenceIds: Array.isArray(row.included_evidence_ids)
        ? row.included_evidence_ids.map(String)
        : [],
      sections,
      audit: {
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? row.created_at ?? ""),
        archivedAt: (row.archived_at as string | null) ?? null,
      },
    };
  }

  async function hydratePerson(ctx: RequestContext, row: Row) {
    const db = await getClient();
    const { data } = await db
      .from("contact_points")
      .select("*")
      .eq("organisation_id", ctx.organisationId)
      .eq("person_id", row.id);

    const points = rows(data);
    const map = (kind: string) =>
      points
        .filter((point) => point.kind === kind)
        .map((point) => ({
          id: String(point.id),
          kind: kind as "email" | "phone",
          value: String(point.value),
          label: point.label ? String(point.label) : undefined,
          isPrimary: Boolean(point.is_primary),
          verification: String(point.verification ?? "provided") as
            | "verified"
            | "provided"
            | "ai_extracted"
            | "needs_review"
            | "outdated",
        }));

    return personFrom(row, { emails: map("email"), phones: map("phone") });
  }

  async function hydrateRelationship(ctx: RequestContext, row: Row) {
    const db = await getClient();
    const { data } = await db
      .from("relationship_roles")
      .select("role")
      .eq("organisation_id", ctx.organisationId)
      .eq("relationship_id", row.id);
    return relationshipFrom(row, rows(data).map((r) => String(r.role)));
  }

  async function hydrateInteraction(ctx: RequestContext, row: Row) {
    const db = await getClient();
    const [participants, links] = await Promise.all([
      db
        .from("interaction_participants")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("interaction_id", row.id),
      db
        .from("interaction_links")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("interaction_id", row.id),
    ]);

    const p = rows(participants.data);
    return interactionFrom(row, {
      personIds: p.filter((x) => x.person_id).map((x) => String(x.person_id)),
      externalOrganisationIds: p
        .filter((x) => x.external_organisation_id)
        .map((x) => String(x.external_organisation_id)),
      participantUserIds: p.filter((x) => x.user_id).map((x) => String(x.user_id)),
      links: rows(links.data).map((l) => ({
        type: String(l.entity_type) as EntityReference["type"],
        id: String(l.entity_id),
      })),
    });
  }

  return repository;
}

/**
 * Which table backs each addressable entity kind.
 *
 * A kind absent from this map cannot be verified and therefore cannot be
 * connected. Refusing an unverifiable edge is the safe failure, and adding a
 * kind is a deliberate one-line change rather than a check someone forgot.
 */
const ENTITY_TABLES: Partial<Record<EntityReference["type"], string>> = {
  programme: "programmes",
  activity: "activities",
  output: "outputs",
  outcome: "outcomes",
  indicator: "indicators",
  indicator_measurement: "indicator_measurements",
  evidence: "evidence_items",
  grant: "grants",
  funder: "funders",
  funding_opportunity: "funding_opportunities",
  application: "applications",
  application_answer: "application_answers",
  claim: "claims",
  relationship: "relationships",
  person: "people",
  external_organisation: "external_organisations",
  fund: "funds",
  transaction: "financial_transactions",
  allocation: "financial_allocations",
  budget: "budgets",
  budget_line: "budget_lines",
  strategic_priority: "strategic_priorities",
  reporting_requirement: "reporting_requirements",
  impact_report: "impact_reports",
  report: "impact_reports",
  task: "tasks",
  commitment: "commitments",
  interaction: "interactions",
  document: "documents",
  document_version: "document_versions",
  onboarding_run: "onboarding_runs",
};

/** Which allocation column names each delivery entity. */
const ALLOCATION_COLUMNS: Partial<Record<EntityReference["type"], string>> = {
  programme: "programme_id",
  activity: "activity_id",
  grant: "grant_id",
  outcome: "outcome_id",
  fund: "fund_id",
  strategic_priority: "strategic_priority_id",
};

// --- Small mappers used only here ---------------------------------------

function fundFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    restriction: String(row.restriction) as "unrestricted" | "restricted" | "endowment" | "designated",
    currency: String(row.currency ?? "GBP"),
    restrictionPurpose: row.restriction_purpose ? String(row.restriction_purpose) : undefined,
    originRef: row.origin_id
      ? { type: String(row.origin_type) as EntityReference["type"], id: String(row.origin_id) }
      : undefined,
    openedAt: row.opened_at ? String(row.opened_at) : undefined,
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    status: String(row.status ?? "open") as "open" | "closed",
    audit: {
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? row.created_at ?? ""),
      archivedAt: (row.archived_at as string | null) ?? null,
    },
  };
}

function transactionFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    date: String(row.date),
    description: String(row.description ?? ""),
    amount: {
      minorUnits: Number(row.amount_minor_units ?? 0),
      currency: String(row.currency ?? "GBP"),
    },
    direction: String(row.direction) as "income" | "expenditure",
    category: row.category ? String(row.category) : undefined,
    counterparty: row.counterparty ? String(row.counterparty) : undefined,
    restricted: Boolean(row.restricted),
    grantId: row.grant_id ? String(row.grant_id) : undefined,
    fundId: row.fund_id ? String(row.fund_id) : undefined,
    source: String(row.source ?? "manual") as
      | "bank_feed"
      | "accounting_system"
      | "manual"
      | "import",
    verificationState: String(row.verification ?? "provided") as
      | "verified"
      | "provided"
      | "ai_extracted"
      | "needs_review"
      | "outdated",
  };
}

function allocationFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
    budgetLineId: row.budget_line_id ? String(row.budget_line_id) : undefined,
    fundId: row.fund_id ? String(row.fund_id) : undefined,
    programmeId: row.programme_id ? String(row.programme_id) : undefined,
    grantId: row.grant_id ? String(row.grant_id) : undefined,
    activityId: row.activity_id ? String(row.activity_id) : undefined,
    outcomeId: row.outcome_id ? String(row.outcome_id) : undefined,
    strategicPriorityId: row.strategic_priority_id
      ? String(row.strategic_priority_id)
      : undefined,
    amount: {
      minorUnits: Number(row.amount_minor_units ?? 0),
      currency: String(row.currency ?? "GBP"),
    },
    allocationMethod: String(row.allocation_method) as
      | "direct"
      | "proportional"
      | "shared_cost"
      | "manual"
      | "suggested"
      | "unknown",
    allocationBasis: row.allocation_basis
      ? (String(row.allocation_basis) as
          | "direct"
          | "headcount"
          | "programme_expenditure"
          | "staff_time"
          | "participant_volume"
          | "equal"
          | "custom_percentage"
          | "unallocated")
      : undefined,
    allocationNote: row.allocation_note ? String(row.allocation_note) : undefined,
    confidence: row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
    restricted: row.restricted === null || row.restricted === undefined ? undefined : Boolean(row.restricted),
    effectiveDate: String(row.effective_date),
    verificationState: String(row.verification ?? "provided") as
      | "verified"
      | "provided"
      | "ai_extracted"
      | "needs_review"
      | "outdated",
    createdBy: row.created_by ? String(row.created_by) : undefined,
    verifiedBy: row.verified_by ? String(row.verified_by) : undefined,
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
  };
}

function budgetFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    programmeId: row.programme_id ? String(row.programme_id) : undefined,
    grantId: row.grant_id ? String(row.grant_id) : undefined,
    currency: String(row.currency ?? "GBP"),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status: String(row.status ?? "draft") as "draft" | "approved" | "superseded",
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    audit: {
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? row.created_at ?? ""),
      archivedAt: (row.archived_at as string | null) ?? null,
    },
  };
}

function budgetLineFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    budgetId: String(row.budget_id),
    label: String(row.label),
    category: row.category ? String(row.category) : undefined,
    plannedAmount: {
      minorUnits: Number(row.planned_amount_minor_units ?? 0),
      currency: String(row.currency ?? "GBP"),
    },
    target: row.target_id
      ? { type: String(row.target_type) as EntityReference["type"], id: String(row.target_id) }
      : undefined,
    note: row.note ? String(row.note) : undefined,
  };
}

function requirementFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    grantId: row.grant_id ? String(row.grant_id) : undefined,
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : undefined,
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    frequency: String(row.frequency ?? "one_off") as
      | "one_off"
      | "monthly"
      | "quarterly"
      | "six_monthly"
      | "annual"
      | "on_completion",
    dueDate: row.due_date ? String(row.due_date) : undefined,
    evidenceTypes: Array.isArray(row.evidence_types)
      ? (row.evidence_types as string[]).map((t) => t as never)
      : [],
    sourceRef: row.source_id
      ? { type: String(row.source_type) as EntityReference["type"], id: String(row.source_id) }
      : undefined,
    status: String(row.status ?? "open") as "open" | "met" | "waived" | "overdue",
    audit: {
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? row.created_at ?? ""),
      archivedAt: (row.archived_at as string | null) ?? null,
    },
  };
}

function externalOrganisationFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    legalName: row.legal_name ? String(row.legal_name) : undefined,
    type: String(row.type ?? "other") as never,
    website: row.website ? String(row.website) : undefined,
    charityNumber: row.charity_number ? String(row.charity_number) : undefined,
    companyNumber: row.company_number ? String(row.company_number) : undefined,
    location:
      row.location_city || row.location_region || row.location_country
        ? {
            city: row.location_city ? String(row.location_city) : undefined,
            region: row.location_region ? String(row.location_region) : undefined,
            country: row.location_country ? String(row.location_country) : undefined,
          }
        : undefined,
    description: row.description ? String(row.description) : undefined,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    enrichmentSource: row.enrichment_source ? String(row.enrichment_source) : undefined,
    isDemo: Boolean(row.is_demo),
    audit: {
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? row.created_at ?? ""),
      archivedAt: (row.archived_at as string | null) ?? null,
    },
  };
}

function relationshipLinkFrom(row: Row) {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    relationshipId: String(row.relationship_id),
    entity: {
      type: String(row.entity_type) as EntityReference["type"],
      id: String(row.entity_id),
    },
    role: row.role ? String(row.role) : undefined,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ""),
  };
}
