import type {
  Activity,
  ActivityEvent,
  AIGeneration,
  AuditEvent,
  Claim,
  Commitment,
  EntityReference,
  EntityType,
  EvidenceItem,
  FinancialAllocation,
  FinancialTransaction,
  Grant,
  Indicator,
  Interaction,
  Output,
  Programme,
  Automation,
  DomainEvent,
  Form,
  FormSubmission,
  Notification,
  Person,
  Task,
  Relation,
  ReportApproval,
  ScheduledJob,
  ReportContributor,
  ReportingRequirement,
  Document,
  DocumentVersion,
  ExtractedClaim,
  OnboardingRun,
} from "@/types/domain";
import { assertKindMayNotStrengthen, createClaim } from "@/lib/knowledge";
import { can } from "@/lib/permissions";
import { resolvePersonByEmail } from "@/lib/logic/relationship-identity";
import {
  answersDueForErasure,
  assessSpam,
  checkPublishable,
  retainUntil,
  validateSubmission,
} from "@/lib/forms";
import {
  buildReportFromDefinition,
  buildReportSnapshot,
  buildReportVersion,
  nextVersionNumber,
} from "@/lib/reporting";
import { applyReview, candidateToClaim } from "@/lib/organisation-intelligence/approve";
import type { RequestContext } from "@/server/context/request-context";
import type { StoreState } from "@/features/store";
import type { MissionRepository } from "../types";

/**
 * In-memory adapter over the seeded store.
 *
 * This is a permanent part of the system, not a placeholder: it is what makes
 * the test suite hermetic and fast, and what powers the demo workspace. The
 * Supabase adapter (Phase 1B) implements the same interface and is verified by
 * the same contract tests.
 *
 * Tenant scoping is applied here on *every* read and write. When Postgres
 * arrives, RLS enforces the same rule independently — neither layer is trusted
 * on its own.
 */

/** Every organisation-owned record carries the tenant it belongs to. */
type Owned = { organisationId: string };

function scoped<T extends Owned>(rows: T[], ctx: RequestContext): T[] {
  return rows.filter((row) => row.organisationId === ctx.organisationId);
}

/** Resolve one record, returning null if it belongs to another tenant. */
function scopedFind<T extends Owned>(
  rows: T[],
  ctx: RequestContext,
  predicate: (row: T) => boolean,
): T | null {
  const row = rows.find((r) => predicate(r) && r.organisationId === ctx.organisationId);
  return row ?? null;
}

function isLive<T extends { audit: { archivedAt?: string | null } }>(row: T): boolean {
  return !row.audit.archivedAt;
}

/**
 * Where each addressable entity kind lives.
 *
 * `Relation` is the first table in the model whose rows can point at anything,
 * so a tenant check on the row is not enough: an edge stamped with the caller's
 * organisation could still name a row belonging to someone else. Verifying an
 * endpoint means resolving it, and resolving it means knowing its table.
 *
 * A kind absent from this map cannot be verified and therefore cannot be
 * connected. That is deliberate — refusing an unverifiable edge is the safe
 * failure, and adding a kind here is a one-line change made deliberately
 * rather than a check someone forgot.
 */
const ENTITY_TABLES: Partial<Record<EntityType, (s: StoreState) => { id: string; organisationId: string }[]>> = {
  programme: (s) => s.programmes,
  activity: (s) => s.activities,
  output: (s) => s.outputs,
  outcome: (s) => s.outcomes,
  indicator: (s) => s.indicators,
  indicator_measurement: (s) => s.indicatorMeasurements,
  evidence: (s) => s.evidenceItems,
  grant: (s) => s.grants,
  funder: (s) => s.funders,
  funding_opportunity: (s) => s.opportunities,
  application: (s) => s.applications,
  application_answer: (s) => s.applicationAnswers,
  claim: (s) => s.claims,
  relationship: (s) => s.relationships,
  person: (s) => s.people,
  external_organisation: (s) => s.externalOrganisations,
  fund: (s) => s.funds,
  transaction: (s) => s.transactions,
  allocation: (s) => s.allocations,
  budget: (s) => s.budgets,
  budget_line: (s) => s.budgetLines,
  strategic_priority: (s) => s.strategicPriorities,
  reporting_requirement: (s) => s.reportingRequirements,
  document: (s) => s.documents,
  document_version: (s) => s.documentVersions,
  extracted_claim: (s) => s.extractedClaims,
  onboarding_run: (s) => s.onboardingRuns,
  impact_report: (s) => s.impactReports,
  report: (s) => s.impactReports,
  task: (s) => s.tasks,
  commitment: (s) => s.commitments,
  interaction: (s) => s.interactions,
};

function entityKey(ref: EntityReference): string {
  return `${ref.type}:${ref.id}`;
}

function newId(prefix: string): string {
  // Collision-free, unlike the array-length counters this replaces, and
  // compatible with the uuid primary keys in the Postgres schema.
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function createInMemoryRepository(state: StoreState): MissionRepository {
  /** Write an audit record. Uses the request clock, not a frozen constant. */
  async function recordAudit(
    ctx: RequestContext,
    event: Omit<AuditEvent, "id" | "createdAt" | "organisationId" | "actorId" | "actorName">,
  ): Promise<void> {
    const actor = state.users.find((u) => u.id === ctx.userId);
    state.auditEvents.push({
      ...event,
      id: newId("aud"),
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      actorName: actor?.name ?? "Unknown actor",
      createdAt: ctx.now().toISOString(),
    });
  }

  function recordActivity(ctx: RequestContext, verb: string, target: string): void {
    const actor = state.users.find((u) => u.id === ctx.userId);
    const event: ActivityEvent = {
      id: newId("act"),
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      actorName: actor?.name ?? "Unknown actor",
      verb,
      target,
      createdAt: ctx.now().toISOString(),
    };
    state.activity.unshift(event);
  }

  const stamp = (ctx: RequestContext) => ctx.now().toISOString();

  /**
   * Resolve a relationship party to the ids that actually exist in this tenant.
   *
   * Interactions and commitments fan out across a person *and* the
   * organisation they work for, so both sets are needed. Resolving the ids
   * here — rather than filtering on the raw column — means an id belonging to
   * another tenant simply does not appear in the set, so it can never match.
   */
  function resolveParty(
    ctx: RequestContext,
    party: { externalOrganisationId?: string; personIds?: string[] },
  ): { organisationIds: Set<string>; personIds: Set<string> } {
    const organisationIds = new Set<string>();
    const personIds = new Set<string>();

    if (party.externalOrganisationId) {
      const org = scopedFind(
        state.externalOrganisations,
        ctx,
        (o) => o.id === party.externalOrganisationId,
      );
      if (org) organisationIds.add(org.id);
    }
    for (const id of party.personIds ?? []) {
      const person = scopedFind(state.people, ctx, (p) => p.id === id);
      if (person) personIds.add(person.id);
    }
    return { organisationIds, personIds };
  }

  /** Two references point at the same thing when type and id both match. */
  const sameRef = (a: EntityReference, b: EntityReference) => a.type === b.type && a.id === b.id;

  /**
   * Does this reference name a record that exists, in this tenant?
   *
   * The organisation itself is special-cased: `Organisation` carries `id`
   * rather than `organisationId`, so it is in-tenant exactly when it *is* the
   * tenant.
   */
  function entityExists(ctx: RequestContext, ref: EntityReference): boolean {
    if (ref.type === "organisation") return ref.id === ctx.organisationId;
    const table = ENTITY_TABLES[ref.type];
    if (!table) return false;
    return table(state).some((row) => row.id === ref.id && row.organisationId === ctx.organisationId);
  }

  // Bound rather than returned inline so that one repository may call another.
  // `evidence.support()` delegates to `graph.connect()` rather than restating
  // its two-endpoint tenant check, which is the kind of duplication that ends
  // with one copy of the check being weaker than the other.
  const repository: MissionRepository = {
    name: "in-memory",

    claims: {
      async list(ctx) {
        return scoped(state.claims, ctx);
      },
      async get(ctx, id) {
        return scopedFind(state.claims, ctx, (c) => c.id === id);
      },
      async forSubject(ctx, subject) {
        return scoped(state.claims, ctx)
          .filter((c) => sameRef(c.subject, subject))
          .sort((a, b) => b.audit.createdAt.localeCompare(a.audit.createdAt));
      },
      async current(ctx, subject, predicate) {
        // "Current" excludes superseded and retired claims, so a corrected
        // figure never resurfaces just because it is still on file.
        return (
          scoped(state.claims, ctx)
            .filter(
              (c) =>
                sameRef(c.subject, subject) &&
                c.predicate === predicate &&
                !c.supersededBy &&
                c.verification !== "outdated",
            )
            .sort((a, b) => b.audit.createdAt.localeCompare(a.audit.createdAt))[0] ?? null
        );
      },
      async create(ctx, init) {
        // `createClaim` enforces that a non-human producer cannot mint a
        // verified claim, so that rule cannot be bypassed by writing here.
        const claim = createClaim({
          ...init,
          id: newId("clm"),
          organisationId: ctx.organisationId,
          now: ctx.now(),
        });
        state.claims.push(claim);
        await recordAudit(ctx, {
          action: "claim.created",
          entityType: "claim",
          entityId: claim.id,
          summary: `Claim recorded (${claim.kind}): ${claim.text.slice(0, 80)}`,
        });
        return claim;
      },
      async supersede(ctx, previousId, next) {
        const previous = scopedFind(state.claims, ctx, (c) => c.id === previousId);
        if (!previous) return null;
        // A machine may not promote a hypothesis into a fact by writing a
        // stronger successor. Enforced here, on the storage path, because that
        // is the only route a successor can reach the tenant by.
        assertKindMayNotStrengthen(previous.kind, next.kind, next.producedBy);
        // Never let a supersede write reach across a tenant boundary, even if
        // the successor object was assembled elsewhere.
        const record = { ...next, organisationId: ctx.organisationId, supersedes: previous.id };
        previous.supersededBy = record.id;
        previous.audit.updatedAt = stamp(ctx);
        state.claims.push(record);
        await recordAudit(ctx, {
          action: "claim.superseded",
          entityType: "claim",
          entityId: record.id,
          summary: `Claim ${previous.id} superseded by ${record.id} (${record.verification})`,
        });
        return record;
      },
      async supportChain(ctx, id) {
        const root = scopedFind(state.claims, ctx, (c) => c.id === id);
        if (!root) return [];
        const byId = new Map(scoped(state.claims, ctx).map((c) => [c.id, c]));
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
        const claim = scopedFind(state.claims, ctx, (c) => c.id === usage.claimId);
        if (!claim) return;
        state.claimUsages.push({
          id: newId("cuse"),
          organisationId: ctx.organisationId,
          claimId: claim.id,
          usedIn: usage.usedIn,
          ...(usage.context ? { context: usage.context } : {}),
          usedAt: stamp(ctx),
        });
      },
      async usages(ctx, claimId) {
        return scoped(state.claimUsages, ctx).filter((u) => u.claimId === claimId);
      },
      async usedIn(ctx, entity) {
        const claimIds = new Set(
          scoped(state.claimUsages, ctx)
            .filter((u) => sameRef(u.usedIn, entity))
            .map((u) => u.claimId),
        );
        return scoped(state.claims, ctx).filter((c) => claimIds.has(c.id));
      },
      async conflicts(ctx) {
        return scoped(state.claimConflicts, ctx);
      },
      async recordConflict(ctx, conflict) {
        state.claimConflicts.push({
          ...conflict,
          id: newId("cconf"),
          organisationId: ctx.organisationId,
          createdAt: stamp(ctx),
        });
      },
    },

    organisations: {
      async get(ctx) {
        return state.organisations.find((o) => o.id === ctx.organisationId) ?? null;
      },
      async profile(ctx) {
        return scopedFind(state.profiles, ctx, () => true);
      },
      async members(ctx) {
        return scoped(state.members, ctx);
      },
      async users(ctx) {
        // Only users holding an active membership of this organisation.
        const memberIds = new Set(scoped(state.members, ctx).map((m) => m.userId));
        return state.users.filter((u) => memberIds.has(u.id));
      },
      async user(ctx, userId) {
        const memberIds = new Set(scoped(state.members, ctx).map((m) => m.userId));
        if (!memberIds.has(userId)) return null;
        return state.users.find((u) => u.id === userId) ?? null;
      },
      async currentUser(ctx) {
        return this.user(ctx, ctx.userId);
      },
      async currentMember(ctx) {
        return scopedFind(state.members, ctx, (m) => m.userId === ctx.userId);
      },
      async setAiEnabled(ctx, enabled) {
        const org = state.organisations.find((o) => o.id === ctx.organisationId);
        if (!org) return;
        org.aiEnabled = enabled;
        org.audit.updatedAt = stamp(ctx);
        await recordAudit(ctx, {
          action: "organisation.ai_setting.changed",
          entityType: "organisation",
          entityId: org.id,
          summary: `AI assistance ${enabled ? "enabled" : "disabled"} for the workspace`,
        });
      },
    },

    graph: {
      async list(ctx) {
        return scoped(state.relations, ctx);
      },
      async from(ctx, entity, kind) {
        return scoped(state.relations, ctx).filter(
          (r) => sameRef(r.from, entity) && (kind === undefined || r.kind === kind),
        );
      },
      async to(ctx, entity, kind) {
        return scoped(state.relations, ctx).filter(
          (r) => sameRef(r.to, entity) && (kind === undefined || r.kind === kind),
        );
      },
      async connect(ctx, init) {
        // Both endpoints, not just the row. A relation stamped with the
        // caller's organisation but naming another tenant's outcome would look
        // perfectly scoped and would still be a cross-tenant read waiting to
        // happen.
        if (!entityExists(ctx, init.from) || !entityExists(ctx, init.to)) return null;

        const relation: Relation = {
          id: newId("rel"),
          organisationId: ctx.organisationId,
          from: { type: init.from.type, id: init.from.id },
          to: { type: init.to.type, id: init.to.id },
          kind: init.kind,
          role: init.role,
          weight: init.weight,
          note: init.note,
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        };
        state.relations.push(relation);
        await recordAudit(ctx, {
          action: "relation.connected",
          entityType: "relation",
          entityId: relation.id,
          summary: `${entityKey(relation.from)} --${relation.kind}--> ${entityKey(relation.to)}`,
        });
        return relation;
      },
      async disconnect(ctx, id) {
        const relation = scopedFind(state.relations, ctx, (r) => r.id === id);
        if (!relation) return;
        state.relations = state.relations.filter((r) => r !== relation);
        await recordAudit(ctx, {
          action: "relation.disconnected",
          entityType: "relation",
          entityId: id,
          summary: `${entityKey(relation.from)} --${relation.kind}--> ${entityKey(relation.to)}`,
        });
      },
      async reach(ctx, from, kind, options) {
        const maxDepth = options?.maxDepth ?? 8;
        const backward = options?.direction === "backward";
        const edges = scoped(state.relations, ctx).filter((r) => r.kind === kind);

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
        const direct = scoped(state.relations, ctx).filter(
          (relation) => entityKey(relation.from) === key || entityKey(relation.to) === key,
        );

        /**
         * The legacy edge table, projected into the same shape.
         *
         * A `RelationshipLink` is a `Relation` whose `from` is always a
         * relationship and whose `kind` is always `party_to`, qualified by the
         * link's role. Expressing it that way here is what lets a caller stop
         * knowing there are two tables.
         *
         * The projected id is prefixed so it can never be mistaken for a row
         * in `relations` and passed to `disconnect`, which would silently do
         * nothing.
         */
        const links = scoped(state.relationshipLinks, ctx)
          .filter((link) => {
            const relationshipKey = `relationship:${link.relationshipId}`;
            return entityKey(link.entity) === key || relationshipKey === key;
          })
          /**
           * The endpoint check `relationship_links` never had.
           *
           * `Relation` verifies both endpoints on write, because a correctly
           * scoped row can still point at another tenant's record. The legacy
           * table predates that rule and has no such check, so a row belonging
           * to this tenant may name an id that resolves in another one.
           *
           * Reading it back unfiltered would let a traversal follow the
           * pointer. The row stays where it is; the projection refuses to
           * present an edge whose other end this tenant cannot see.
           */
          .filter((link) => entityExists(ctx, link.entity));

        const projected: Relation[] = links.map((link) => ({
          id: `link:${link.id}`,
          organisationId: link.organisationId,
          from: { type: "relationship", id: link.relationshipId },
          to: link.entity,
          kind: "party_to",
          role: link.role,
          note: link.note,
          // `RelationshipLink` carries no audit stamp of its own, which is
          // one of the reasons `Relation` superseded it. The projection uses
          // the request clock rather than inventing a creation date.
          audit: { createdAt: stamp(ctx), updatedAt: stamp(ctx) },
        }));

        return [...direct, ...projected];
      },
    },

    documents: {
      async list(ctx) {
        return scoped(state.documents, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.documents, ctx, (d) => d.id === id);
      },
      async versions(ctx, documentId) {
        const document = scopedFind(state.documents, ctx, (d) => d.id === documentId);
        if (!document) return [];
        return scoped(state.documentVersions, ctx)
          .filter((v) => v.documentId === document.id)
          .sort((a, b) => b.version - a.version);
      },
      async currentVersion(ctx, documentId) {
        const document = scopedFind(state.documents, ctx, (d) => d.id === documentId);
        if (!document?.currentVersionId) return null;
        return scopedFind(state.documentVersions, ctx, (v) => v.id === document.currentVersionId);
      },
      async sources(ctx, documentId) {
        const document = scopedFind(state.documents, ctx, (d) => d.id === documentId);
        if (!document) return [];
        return scoped(state.documentSources, ctx).filter((s) => s.documentId === document.id);
      },
      async create(ctx, input) {
        // Identical bytes are not a new document. Without this, re-uploading
        // the same annual report duplicates every claim extracted from it and
        // the review queue doubles for no new information.
        const existingVersion = scoped(state.documentVersions, ctx).find(
          (v) => v.contentHash === input.version.contentHash,
        );
        if (existingVersion) {
          const existingDocument = scopedFind(
            state.documents,
            ctx,
            (d) => d.id === existingVersion.documentId,
          );
          if (existingDocument) {
            return { document: existingDocument, version: existingVersion, deduplicated: true };
          }
        }

        const documentId = newId("doc");
        const versionId = newId("dv");
        const document: Document = {
          id: documentId,
          organisationId: ctx.organisationId,
          title: input.title,
          kind: input.kind,
          reportingPeriod: input.reportingPeriod,
          currentVersionId: versionId,
          containsPersonalData: input.containsPersonalData,
          tags: input.tags ?? [],
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        };
        const version: DocumentVersion = {
          ...input.version,
          id: versionId,
          organisationId: ctx.organisationId,
          documentId,
          version: 1,
          createdAt: stamp(ctx),
        };

        state.documents.push(document);
        state.documentVersions.push(version);
        state.documentSources.push({
          ...input.source,
          id: newId("dsrc"),
          organisationId: ctx.organisationId,
          documentId,
          versionId,
        });

        await recordAudit(ctx, {
          action: "document.added",
          entityType: "document",
          entityId: documentId,
          summary: `${input.title} (${input.version.format}, ${input.version.parseStatus})`,
        });
        return { document, version, deduplicated: false };
      },
      async addVersion(ctx, documentId, version) {
        const document = scopedFind(state.documents, ctx, (d) => d.id === documentId);
        if (!document) return null;

        const existing = scoped(state.documentVersions, ctx).filter(
          (v) => v.documentId === document.id,
        );
        const record: DocumentVersion = {
          ...version,
          id: newId("dv"),
          organisationId: ctx.organisationId,
          documentId: document.id,
          version: existing.length + 1,
          createdAt: stamp(ctx),
        };
        state.documentVersions.push(record);
        // The new version becomes current, and the previous one stays. Claims
        // extracted from it still resolve to the bytes they were read from.
        document.currentVersionId = record.id;
        document.audit.updatedAt = stamp(ctx);

        await recordAudit(ctx, {
          action: "document.version_added",
          entityType: "document",
          entityId: document.id,
          summary: `Version ${record.version} of ${document.title}`,
        });
        return record;
      },
      async extractedClaims(ctx, documentId) {
        const document = scopedFind(state.documents, ctx, (d) => d.id === documentId);
        if (!document) return [];
        return scoped(state.extractedClaims, ctx).filter((c) => c.documentId === document.id);
      },
      async saveExtractedClaims(ctx, claims) {
        const written: ExtractedClaim[] = [];
        for (const claim of claims) {
          // A claim can only be attached to a document this tenant holds.
          const document = scopedFind(state.documents, ctx, (d) => d.id === claim.documentId);
          if (!document) continue;
          const record: ExtractedClaim = {
            ...claim,
            id: newId("exc"),
            organisationId: ctx.organisationId,
            status: "pending",
            createdAt: stamp(ctx),
          };
          state.extractedClaims.push(record);
          written.push(record);
        }
        return written;
      },
      async setExtractedClaimStatus(ctx, id, status, claimId) {
        const record = scopedFind(state.extractedClaims, ctx, (c) => c.id === id);
        if (!record) return;
        record.status = status;
        record.claimId = claimId;
        record.reviewedBy = ctx.userId;
        record.reviewedAt = stamp(ctx);
      },
    },

    onboarding: {
      async runs(ctx) {
        return scoped(state.onboardingRuns, ctx).sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        );
      },
      async getRun(ctx, id) {
        return scopedFind(state.onboardingRuns, ctx, (r) => r.id === id);
      },
      async latestRun(ctx) {
        return (
          scoped(state.onboardingRuns, ctx).sort((a, b) =>
            b.startedAt.localeCompare(a.startedAt),
          )[0] ?? null
        );
      },
      async startRun(ctx, input) {
        const run: OnboardingRun = {
          id: newId("onb"),
          organisationId: ctx.organisationId,
          input,
          stage: "identity",
          status: "running",
          startedAt: stamp(ctx),
          counts: {
            sourcesDiscovered: 0,
            pagesRead: 0,
            documentsFound: 0,
            documentsParsed: 0,
            candidatesFound: 0,
            conflicts: 0,
          },
          startedBy: ctx.userId,
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        };
        state.onboardingRuns.push(run);
        await recordAudit(ctx, {
          action: "onboarding.started",
          entityType: "onboarding_run",
          entityId: run.id,
          summary: `Research started for ${input.name}`,
        });
        return run;
      },
      async updateRun(ctx, id, patch) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === id);
        if (!run) return;
        Object.assign(run, patch);
        run.audit.updatedAt = stamp(ctx);
      },
      async sources(ctx, runId) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === runId);
        if (!run) return [];
        return scoped(state.researchSources, ctx).filter((s) => s.runId === run.id);
      },
      async saveSources(ctx, runId, sources) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === runId);
        if (!run) return;
        for (const source of sources) {
          state.researchSources.push({
            ...source,
            organisationId: ctx.organisationId,
            runId: run.id,
          });
        }
      },
      async candidates(ctx, runId) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === runId);
        if (!run) return [];
        return scoped(state.profileCandidates, ctx).filter((c) => c.runId === run.id);
      },
      async getCandidate(ctx, id) {
        return scopedFind(state.profileCandidates, ctx, (c) => c.id === id);
      },
      async saveCandidates(ctx, runId, candidates) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === runId);
        if (!run) return;
        for (const candidate of candidates) {
          state.profileCandidates.push({
            ...candidate,
            organisationId: ctx.organisationId,
            runId: run.id,
          });
        }
      },
      async decide(ctx, candidateId, decision, editedValue) {
        const candidate = scopedFind(state.profileCandidates, ctx, (c) => c.id === candidateId);
        if (!candidate) return null;

        const actor = state.users.find((u) => u.id === ctx.userId);
        // `applyReview` owns the rule that a confirmation yields `verified`
        // and an edit yields `provided` — the value became the human's, not
        // the source's. Restating it here would be a second copy to drift.
        const outcome = applyReview(candidate, {
          decision,
          value: editedValue,
          reviewerId: ctx.userId,
          reviewerName: actor?.name ?? "Unknown reviewer",
          at: ctx.now(),
        });

        state.candidateDecisions.push({
          runId: candidate.runId,
          candidateId,
          organisationId: ctx.organisationId,
          decision,
          editedValue,
          at: stamp(ctx),
          by: ctx.userId,
        });

        let claimId: string | undefined;
        if (outcome.attested) {
          // An approved candidate becomes a claim, which is what carries its
          // provenance everywhere else in the product. Rejection writes
          // nothing but the decision itself.
          const claim = candidateToClaim(
            { ...candidate, value: outcome.attested.value },
            ctx.organisationId,
            ctx.now(),
            newId("clm"),
          );
          const stored = {
            ...claim,
            verification: outcome.verificationState as Claim["verification"],
            verifiedBy: ctx.userId,
            verifiedAt: stamp(ctx),
            producedBy: { method: "human", actorId: ctx.userId } as const,
          };
          state.claims.push(stored);
          claimId = stored.id;
        }

        await recordAudit(ctx, {
          action: `onboarding.candidate_${decision}`,
          entityType: "research_source",
          entityId: candidateId,
          summary: `${candidate.field}: ${decision}${
            editedValue ? ` (edited)` : ""
          } from ${candidate.sourceUrl}`,
        });

        return { candidate, claimId };
      },
      async decisions(ctx, runId) {
        const run = scopedFind(state.onboardingRuns, ctx, (r) => r.id === runId);
        if (!run) return {};
        const out: Record<string, { decision: "confirm" | "edit" | "reject"; at: string; by?: string }> =
          {};
        for (const record of scoped(state.candidateDecisions, ctx)) {
          if (record.runId !== run.id) continue;
          out[record.candidateId] = {
            decision: record.decision,
            at: record.at,
            by: record.by,
          };
        }
        return out;
      },
    },

    strategy: {
      async priorities(ctx) {
        return scoped(state.strategicPriorities, ctx).sort((a, b) => a.order - b.order);
      },
      async getPriority(ctx, id) {
        return scopedFind(state.strategicPriorities, ctx, (p) => p.id === id);
      },
      async programmesFor(ctx, priorityId) {
        const priority = scopedFind(state.strategicPriorities, ctx, (p) => p.id === priorityId);
        if (!priority) return [];
        const programmeIds = new Set(
          scoped(state.relations, ctx)
            .filter(
              (r) =>
                r.kind === "pursues" &&
                r.from.type === "strategic_priority" &&
                r.from.id === priority.id &&
                r.to.type === "programme",
            )
            .map((r) => r.to.id),
        );
        return scoped(state.programmes, ctx).filter((p: Programme) => programmeIds.has(p.id));
      },
    },

    finance: {
      async funds(ctx) {
        return scoped(state.funds, ctx);
      },
      async getFund(ctx, id) {
        return scopedFind(state.funds, ctx, (f) => f.id === id);
      },
      async transactions(ctx) {
        return scoped(state.transactions, ctx);
      },
      async transactionsForFund(ctx, fundId) {
        const fund = scopedFind(state.funds, ctx, (f) => f.id === fundId);
        if (!fund) return [];
        return scoped(state.transactions, ctx).filter(
          (t: FinancialTransaction) => t.fundId === fund.id,
        );
      },
      async getTransaction(ctx, id) {
        return scopedFind(state.transactions, ctx, (t) => t.id === id);
      },
      async allocations(ctx) {
        return scoped(state.allocations, ctx);
      },
      async allocationsFor(ctx, entity) {
        // The typed columns carry the common attributions; the `allocated_to`
        // relation carries anything the columns cannot name.
        const viaRelation = new Set(
          scoped(state.relations, ctx)
            .filter((r) => r.kind === "allocated_to" && sameRef(r.to, entity))
            .map((r) => r.from.id),
        );
        return scoped(state.allocations, ctx).filter((a: FinancialAllocation) => {
          if (viaRelation.has(a.id)) return true;
          switch (entity.type) {
            case "programme":
              return a.programmeId === entity.id;
            case "activity":
              return a.activityId === entity.id;
            case "grant":
              return a.grantId === entity.id;
            case "outcome":
              return a.outcomeId === entity.id;
            case "fund":
              return a.fundId === entity.id;
            case "strategic_priority":
              return a.strategicPriorityId === entity.id;
            default:
              return false;
          }
        });
      },
      async budgets(ctx) {
        return scoped(state.budgets, ctx);
      },
      async budgetLines(ctx, budgetId) {
        const budget = scopedFind(state.budgets, ctx, (b) => b.id === budgetId);
        if (!budget) return [];
        return scoped(state.budgetLines, ctx).filter((l) => l.budgetId === budget.id);
      },
      async recordTransaction(ctx, input) {
        const id = newId("txn");
        state.transactions.push({ ...input, id, organisationId: ctx.organisationId });
        await recordAudit(ctx, {
          action: "transaction.recorded",
          entityType: "transaction",
          entityId: id,
          summary: `${input.direction} ${input.amount.minorUnits} ${input.amount.currency}: ${input.description}`,
        });
        return id;
      },
      async allocate(ctx, input) {
        // Every id the allocation names must be this tenant's. An allocation is
        // the record that makes a cost-per-outcome figure defensible, so an
        // allocation pointing at a foreign programme is worse than no figure.
        const targets: EntityReference[] = [];
        if (input.transactionId) targets.push({ type: "transaction", id: input.transactionId });
        if (input.fundId) targets.push({ type: "fund", id: input.fundId });
        if (input.programmeId) targets.push({ type: "programme", id: input.programmeId });
        if (input.grantId) targets.push({ type: "grant", id: input.grantId });
        if (input.activityId) targets.push({ type: "activity", id: input.activityId });
        if (input.outcomeId) targets.push({ type: "outcome", id: input.outcomeId });
        if (input.budgetLineId) targets.push({ type: "budget_line", id: input.budgetLineId });
        if (input.strategicPriorityId) {
          targets.push({ type: "strategic_priority", id: input.strategicPriorityId });
        }
        if (targets.length === 0) return null;
        if (!targets.every((ref) => entityExists(ctx, ref))) return null;

        const id = newId("alloc");
        state.allocations.push({ ...input, id, organisationId: ctx.organisationId });
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
        return scoped(state.reportingRequirements, ctx);
      },
      async get(ctx, id) {
        return scopedFind(state.reportingRequirements, ctx, (r) => r.id === id);
      },
      async forGrant(ctx, grantId) {
        const grant = scopedFind(state.grants, ctx, (g) => g.id === grantId);
        if (!grant) return [];
        return scoped(state.reportingRequirements, ctx).filter(
          (r: ReportingRequirement) => r.grantId === grant.id,
        );
      },
      async requires(ctx, requirementId) {
        const requirement = scopedFind(
          state.reportingRequirements,
          ctx,
          (r) => r.id === requirementId,
        );
        if (!requirement) return [];
        return scoped(state.relations, ctx)
          .filter(
            (r) =>
              r.kind === "requires" &&
              r.from.type === "reporting_requirement" &&
              r.from.id === requirement.id,
          )
          .map((r) => r.to);
      },
    },

    funding: {
      async listOpportunities(ctx) {
        return scoped(state.opportunities, ctx).filter(isLive);
      },
      async getOpportunity(ctx, id) {
        return scopedFind(state.opportunities, ctx, (o) => o.id === id);
      },
      async opportunityQuestions(ctx, opportunityId) {
        return scoped(state.opportunityQuestions, ctx)
          .filter((question) => question.opportunityId === opportunityId)
          .sort((a, b) => a.order - b.order);
      },
      async listFunders(ctx) {
        return scoped(state.funders, ctx);
      },
      async getFunder(ctx, id) {
        return scopedFind(state.funders, ctx, (f) => f.id === id);
      },
      async moveStage(ctx, id, stage) {
        const opp = scopedFind(state.opportunities, ctx, (o) => o.id === id);
        if (!opp) return;
        opp.stage = stage;
        opp.audit.updatedAt = stamp(ctx);
        recordActivity(
          ctx,
          "moved opportunity to",
          `${opp.programmeName}: ${stage.replace(/_/g, " ")}`,
        );
      },
      async toggleSaved(ctx, id) {
        const opp = scopedFind(state.opportunities, ctx, (o) => o.id === id);
        if (!opp) return;
        opp.saved = !opp.saved;
        opp.audit.updatedAt = stamp(ctx);
      },
      async getFitAssessment(ctx, opportunityId) {
        return scopedFind(state.fitAssessments, ctx, (f) => f.opportunityId === opportunityId);
      },
      async saveFitAssessment(ctx, assessment) {
        // Never accept an assessment for another tenant's opportunity.
        const opp = scopedFind(
          state.opportunities,
          ctx,
          (o) => o.id === assessment.opportunityId,
        );
        if (!opp) return;
        const record = { ...assessment, organisationId: ctx.organisationId };
        const index = state.fitAssessments.findIndex(
          (f) =>
            f.opportunityId === assessment.opportunityId &&
            f.organisationId === ctx.organisationId,
        );
        if (index >= 0) state.fitAssessments[index] = record;
        else state.fitAssessments.push(record);
      },
    },

    applications: {
      async list(ctx) {
        return scoped(state.applications, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.applications, ctx, (a) => a.id === id);
      },
      async answers(ctx, applicationId) {
        return scoped(state.applicationAnswers, ctx)
          .filter((a) => a.applicationId === applicationId)
          .sort((a, b) => a.order - b.order);
      },
      async getAnswer(ctx, answerId) {
        return scopedFind(state.applicationAnswers, ctx, (a) => a.id === answerId);
      },
      async saveAnswer(ctx, answerId, draft, provenance) {
        const answer = scopedFind(state.applicationAnswers, ctx, (a) => a.id === answerId);
        if (!answer) return;
        answer.draft = draft;
        if (provenance) answer.provenance = provenance;
        if (answer.status === "not_started" || answer.status === "approved") {
          answer.status = "drafting";
        }
        answer.audit.updatedAt = stamp(ctx);
      },
      async setAnswerStatus(ctx, answerId, status) {
        const answer = scopedFind(state.applicationAnswers, ctx, (a) => a.id === answerId);
        if (!answer) return;
        answer.status = status;
        answer.audit.updatedAt = stamp(ctx);
        if (status === "approved") {
          recordActivity(ctx, "approved answer", answer.questionText);
          await recordAudit(ctx, {
            action: "application.answer.approved",
            entityType: "application_answer",
            entityId: answerId,
            summary: `Approved answer: ${answer.questionText.slice(0, 60)}`,
          });
        }
      },
      async convertToGrant(ctx, applicationId) {
        const app = scopedFind(state.applications, ctx, (a) => a.id === applicationId);
        if (!app) return null;
        const opp = scopedFind(state.opportunities, ctx, (o) => o.id === app.opportunityId);
        if (!opp) return null;

        app.status = "successful";
        app.audit.updatedAt = stamp(ctx);

        const grantId = newId("grant");
        const funder = scopedFind(state.funders, ctx, (f) => f.id === opp.funderId);
        state.grants.push({
          id: grantId,
          organisationId: ctx.organisationId,
          applicationId,
          funderId: opp.funderId,
          title: app.title.replace(/application/i, "grant"),
          awardValue: opp.maxAward ?? opp.minAward ?? 0,
          currency: opp.currency,
          restricted: opp.fundingType === "restricted" || opp.fundingType === "project",
          startDate: "2026-08-01",
          endDate: "2027-07-31",
          grantManagerId: app.ownerId,
          funderContact: funder?.contactName,
          spentToDate: 0,
          conditions: opp.reportingRequirements,
          status: "active",
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        });
        state.grantReports.push({
          id: newId("rep"),
          grantId,
          organisationId: ctx.organisationId,
          title: "First progress report",
          dueDate: "2026-11-01",
          status: "not_started",
        });

        recordActivity(ctx, "converted application to grant", app.title);
        await recordAudit(ctx, {
          action: "grant.created",
          entityType: "grant",
          entityId: grantId,
          summary: `Converted successful application '${app.title}' into an active grant`,
        });
        return grantId;
      },
    },

    grants: {
      async list(ctx) {
        return scoped(state.grants, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.grants, ctx, (g) => g.id === id);
      },
      async payments(ctx, grantId) {
        return scoped(state.grantPayments, ctx).filter((p) => p.grantId === grantId);
      },
      async deliverables(ctx, grantId) {
        return scoped(state.grantDeliverables, ctx).filter((d) => d.grantId === grantId);
      },
      async reports(ctx, grantId) {
        return scoped(state.grantReports, ctx).filter((r) => r.grantId === grantId);
      },
      async allReports(ctx) {
        return scoped(state.grantReports, ctx);
      },
    },

    programmes: {
      async list(ctx) {
        return scoped(state.programmes, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.programmes, ctx, (p) => p.id === id);
      },
      async outcomes(ctx, programmeId) {
        return scoped(state.outcomes, ctx).filter((o) => o.programmeId === programmeId);
      },
      async indicatorsForOutcome(ctx, outcomeId) {
        return scoped(state.indicators, ctx).filter((i) => i.outcomeId === outcomeId);
      },
      async indicatorsForProgramme(ctx, programmeId) {
        const outcomeIds = new Set(
          scoped(state.outcomes, ctx)
            .filter((o) => o.programmeId === programmeId)
            .map((o) => o.id),
        );
        return scoped(state.indicators, ctx).filter((i: Indicator) =>
          outcomeIds.has(i.outcomeId),
        );
      },
      async allIndicators(ctx) {
        return scoped(state.indicators, ctx);
      },
      async getIndicator(ctx, id) {
        return scopedFind(state.indicators, ctx, (i) => i.id === id);
      },
      async getOutcome(ctx, id) {
        return scopedFind(state.outcomes, ctx, (o) => o.id === id);
      },
      async activities(ctx, programmeId) {
        const programme = scopedFind(state.programmes, ctx, (p) => p.id === programmeId);
        if (!programme) return [];
        return scoped(state.activities, ctx).filter((a: Activity) => a.programmeId === programme.id);
      },
      async getActivity(ctx, id) {
        return scopedFind(state.activities, ctx, (a) => a.id === id);
      },
      async outputs(ctx, programmeId) {
        const programme = scopedFind(state.programmes, ctx, (p) => p.id === programmeId);
        if (!programme) return [];
        return scoped(state.outputs, ctx).filter((o: Output) => o.programmeId === programme.id);
      },
      async getOutput(ctx, id) {
        return scopedFind(state.outputs, ctx, (o) => o.id === id);
      },
      async measurements(ctx, indicatorId) {
        const indicator = scopedFind(state.indicators, ctx, (i) => i.id === indicatorId);
        if (!indicator) return [];
        return scoped(state.indicatorMeasurements, ctx)
          .filter((m) => m.indicatorId === indicator.id)
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      },
      async updateIndicator(ctx, indicatorId, value, note) {
        const indicator = scopedFind(state.indicators, ctx, (i) => i.id === indicatorId);
        if (!indicator) return;
        indicator.currentValue = value;
        indicator.lastUpdated = ctx.now().toISOString().slice(0, 10);
        indicator.audit.updatedAt = stamp(ctx);
        // Record the reading as well as the current value. Overwriting alone
        // loses the previous figure, and a report published against it can
        // then no longer resolve what it was written from.
        state.indicatorMeasurements.push({
          id: newId("meas"),
          organisationId: ctx.organisationId,
          indicatorId: indicator.id,
          value,
          recordedAt: ctx.now().toISOString().slice(0, 10),
          note,
          recordedBy: ctx.userId,
        });
        recordActivity(
          ctx,
          "updated indicator",
          `${indicator.name} (${value} ${indicator.unit})`,
        );
        await recordAudit(ctx, {
          action: "indicator.updated",
          entityType: "indicator",
          entityId: indicatorId,
          summary: `Updated '${indicator.name}' to ${value}${note ? ` (${note})` : ""}`,
        });
      },
      async grantsFor(ctx, programmeId) {
        const grantIds = new Set(
          scoped(state.programmeGrantLinks, ctx)
            .filter((l) => l.programmeId === programmeId)
            .map((l) => l.grantId),
        );
        return scoped(state.grants, ctx).filter((g: Grant) => grantIds.has(g.id));
      },
    },

    evidence: {
      async list(ctx) {
        return scoped(state.evidenceItems, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.evidenceItems, ctx, (e) => e.id === id);
      },
      async forTarget(ctx, targetType, targetId) {
        const evidenceIds = new Set(
          scoped(state.evidenceLinks, ctx)
            .filter((l) => l.targetType === targetType && l.targetId === targetId)
            .map((l) => l.evidenceId),
        );
        return scoped(state.evidenceItems, ctx).filter((e: EvidenceItem) =>
          evidenceIds.has(e.id),
        );
      },
      async forEntity(ctx, entity) {
        const evidenceIds = new Set(
          scoped(state.relations, ctx)
            .filter((r) => r.kind === "evidences" && r.from.type === "evidence" && sameRef(r.to, entity))
            .map((r) => r.from.id),
        );
        return scoped(state.evidenceItems, ctx).filter((e: EvidenceItem) => evidenceIds.has(e.id));
      },
      async support(ctx, evidenceId, entity, note) {
        const item = scopedFind(state.evidenceItems, ctx, (e) => e.id === evidenceId);
        if (!item) return null;
        const relation = await repository.graph.connect(ctx, {
          from: { type: "evidence", id: item.id },
          to: entity,
          kind: "evidences",
          note,
        });
        return relation?.id ?? null;
      },
      async add(ctx, item) {
        const id = newId("ev");
        state.evidenceItems.push({
          id,
          organisationId: ctx.organisationId,
          title: item.title,
          type: item.type,
          description: item.description,
          verification: item.verification ?? "provided",
          tags: item.tags,
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        });
        recordActivity(ctx, "added evidence", item.title);
        return id;
      },
    },

    reports: {
      async list(ctx) {
        return scoped(state.impactReports, ctx);
      },
      async get(ctx, id) {
        return scopedFind(state.impactReports, ctx, (r) => r.id === id);
      },
      async saveSection(ctx, reportId, sectionKey, content, provenance) {
        const report = scopedFind(state.impactReports, ctx, (r) => r.id === reportId);
        if (!report) return;
        const section = report.sections.find((s) => s.key === sectionKey);
        if (!section) return;
        section.content = content;
        if (provenance) {
          section.provenance = provenance;
          section.claimIds = provenance.used
            .filter((ref) => ref.type === "claim")
            .map((ref) => ref.id);
        }
        report.audit.updatedAt = stamp(ctx);
      },
      async setStatus(ctx, reportId, status) {
        const report = scopedFind(state.impactReports, ctx, (r) => r.id === reportId);
        if (!report) return;
        report.status = status;
        report.audit.updatedAt = stamp(ctx);
        if (status === "approved") {
          await recordAudit(ctx, {
            action: "report.approved",
            entityType: "impact_report",
            entityId: reportId,
            summary: `Approved impact report '${report.title}'`,
          });
        }
      },

      // --- Templates ---------------------------------------------------

      async definitions(ctx) {
        return scoped(state.reportDefinitions, ctx).filter(isLive);
      },
      async getDefinition(ctx, id) {
        return scopedFind(state.reportDefinitions, ctx, (d) => d.id === id);
      },
      async requirements(ctx, definitionId) {
        return scoped(state.reportRequirements, ctx)
          .filter((r) => r.definitionId === definitionId)
          .sort((a, b) => a.order - b.order);
      },
      async saveDefinition(ctx, definition, requirements) {
        // Rejected rather than re-stamped. Accepting a record carrying another
        // tenant's id and silently rewriting it would make a cross-tenant write
        // look like a successful one.
        if (definition.organisationId !== ctx.organisationId) return;
        const index = state.reportDefinitions.findIndex(
          (d) => d.id === definition.id && d.organisationId === ctx.organisationId,
        );
        if (index >= 0) state.reportDefinitions[index] = definition;
        else state.reportDefinitions.push(definition);

        state.reportRequirements = state.reportRequirements.filter(
          (r) => !(r.definitionId === definition.id && r.organisationId === ctx.organisationId),
        );
        for (const requirement of requirements) {
          if (requirement.organisationId !== ctx.organisationId) continue;
          state.reportRequirements.push(requirement);
        }
      },

      async create(ctx, init) {
        const definition = init.definitionId
          ? scopedFind(state.reportDefinitions, ctx, (d) => d.id === init.definitionId)
          : null;
        const report = buildReportFromDefinition({
          id: newId("report"),
          organisationId: ctx.organisationId,
          title: init.title,
          type: init.type,
          reportingPeriod: init.reportingPeriod,
          definition: definition ?? undefined,
          programmeId: init.programmeId,
          grantId: init.grantId,
          ownerId: ctx.userId,
          includedIndicatorIds: init.includedIndicatorIds,
          includedEvidenceIds: init.includedEvidenceIds,
          now: ctx.now(),
        });
        state.impactReports.push(report);
        await recordAudit(ctx, {
          action: "report.created",
          entityType: "impact_report",
          entityId: report.id,
          summary: `Created '${report.title}'${definition ? ` from the ${definition.name} template` : ""}`,
        });
        return report.id;
      },

      // --- Versions and snapshots ---------------------------------------

      async versions(ctx, reportId) {
        return scoped(state.reportVersions, ctx)
          .filter((v) => v.reportId === reportId)
          .sort((a, b) => a.versionNumber - b.versionNumber);
      },
      async getSnapshot(ctx, snapshotId) {
        return scopedFind(state.reportSnapshots, ctx, (s) => s.id === snapshotId);
      },
      async cutVersion(ctx, reportId, reason, note) {
        const report = scopedFind(state.impactReports, ctx, (r) => r.id === reportId);
        if (!report) return null;

        const now = ctx.now();
        const versionNumber = nextVersionNumber(
          state.reportVersions.filter(
            (v) => v.reportId === reportId && v.organisationId === ctx.organisationId,
          ),
        );

        const snapshot = buildReportSnapshot({
          id: newId("snap"),
          report,
          claims: scoped(state.claims, ctx),
          indicators: scoped(state.indicators, ctx),
          measurements: scoped(state.indicatorMeasurements, ctx),
          evidence: scoped(state.evidenceItems, ctx),
          takenAt: now,
        });

        const version = buildReportVersion({
          id: newId("ver"),
          report,
          versionNumber,
          reason,
          snapshotId: snapshot.id,
          note,
          createdBy: ctx.userId,
          createdAt: now,
        });
        snapshot.versionId = version.id;

        state.reportSnapshots.push(snapshot);
        state.reportVersions.push(version);

        await recordAudit(ctx, {
          action: "report.version.cut",
          entityType: "impact_report",
          entityId: reportId,
          summary: `Cut version ${versionNumber} of '${report.title}' (${reason.replace(/_/g, " ")}), pinning ${snapshot.figures.length} figures`,
        });

        return version;
      },

      // --- People and decisions ------------------------------------------

      async contributors(ctx, reportId) {
        return scoped(state.reportContributors, ctx).filter((c) => c.reportId === reportId);
      },
      async addContributor(ctx, input) {
        const report = scopedFind(state.impactReports, ctx, (r) => r.id === input.reportId);
        if (!report) return null;
        const user = scopedFind(state.members, ctx, (m) => m.userId === input.userId);
        // A contributor who is not a member of this organisation would be an
        // assignment nobody can act on, and a route to naming an outsider on a
        // tenant record.
        if (!user) return null;

        const contributor: ReportContributor = {
          ...input,
          id: newId("repcon"),
          organisationId: ctx.organisationId,
          invitedAt: ctx.now().toISOString(),
        };
        state.reportContributors.push(contributor);
        return contributor.id;
      },
      async approvals(ctx, reportId) {
        return scoped(state.reportApprovals, ctx)
          .filter((a) => a.reportId === reportId)
          .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
      },
      async recordApproval(ctx, input) {
        const report = scopedFind(state.impactReports, ctx, (r) => r.id === input.reportId);
        if (!report) return null;
        const version = scopedFind(
          state.reportVersions,
          ctx,
          (v) => v.id === input.versionId && v.reportId === input.reportId,
        );
        if (!version) return null;
        // Enforced here as well as in the schema. An unexplained rejection
        // cannot be acted on, and the two layers are independent on purpose.
        if (input.decision === "changes_requested" && !input.comment?.trim()) return null;

        const approval: ReportApproval = {
          id: newId("repapp"),
          organisationId: ctx.organisationId,
          reportId: input.reportId,
          versionId: input.versionId,
          userId: ctx.userId,
          decision: input.decision,
          comment: input.comment,
          decidedAt: ctx.now().toISOString(),
        };
        state.reportApprovals.push(approval);

        await recordAudit(ctx, {
          action: `report.${input.decision}`,
          entityType: "impact_report",
          entityId: input.reportId,
          summary: `${input.decision === "approved" ? "Approved" : "Requested changes to"} version ${version.versionNumber} of '${report.title}'`,
        });

        return approval.id;
      },

      // --- Funder template ingestion ---------------------------------------

      async ingestions(ctx) {
        return scoped(state.reportTemplateIngestions, ctx).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
      },
      async getIngestion(ctx, id) {
        return scopedFind(state.reportTemplateIngestions, ctx, (i) => i.id === id);
      },
      async saveIngestion(ctx, ingestion) {
        if (ingestion.organisationId !== ctx.organisationId) return;
        const index = state.reportTemplateIngestions.findIndex(
          (i) => i.id === ingestion.id && i.organisationId === ctx.organisationId,
        );
        if (index >= 0) state.reportTemplateIngestions[index] = ingestion;
        else state.reportTemplateIngestions.push(ingestion);
      },
    },

    relationships: {
      async listOrganisations(ctx) {
        return scoped(state.externalOrganisations, ctx).filter(isLive);
      },
      async getOrganisation(ctx, id) {
        return scopedFind(state.externalOrganisations, ctx, (o) => o.id === id);
      },
      async upsertPersonByEmail(ctx, input) {
        const people = scoped(state.people, ctx).filter(isLive);
        const match = resolvePersonByEmail(people, input.email);
        // Only a confident match attaches. A low-confidence match would merge
        // two people on the strength of a shared mailbox, which is far harder
        // to undo than a duplicate.
        if (match && match.confidence === "high") return { person: match.record, created: false };

        const now = stamp(ctx);
        const person: Person = {
          id: newId("person"),
          organisationId: ctx.organisationId,
          firstName: input.firstName?.trim() || input.email.split("@")[0] || "Unknown",
          lastName: input.lastName?.trim() || "",
          emails: [
            {
              id: newId("cp"),
              kind: "email",
              value: input.email,
              isPrimary: true,
              // Somebody typed it into a form. Nobody has confirmed it is
              // theirs, and `provided` is what that state is called.
              verification: "provided",
            },
          ],
          phones: [],
          tags: [],
          isDemo: false,
          audit: { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
        };
        state.people.push(person);
        return { person, created: true };
      },
      async listPeople(ctx) {
        return scoped(state.people, ctx).filter(isLive);
      },
      async getPerson(ctx, id) {
        return scopedFind(state.people, ctx, (p) => p.id === id);
      },
      async peopleForOrganisation(ctx, externalOrganisationId) {
        // Resolve the parent within the tenant first, so a foreign id yields
        // nothing rather than matching on the raw column.
        const parent = scopedFind(
          state.externalOrganisations,
          ctx,
          (o) => o.id === externalOrganisationId,
        );
        if (!parent) return [];
        return scoped(state.people, ctx).filter(
          (p) => p.primaryExternalOrganisationId === parent.id,
        );
      },

      async list(ctx) {
        return scoped(state.relationships, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.relationships, ctx, (r) => r.id === id);
      },
      async forOrganisation(ctx, externalOrganisationId) {
        return scopedFind(
          state.relationships,
          ctx,
          (r) => r.externalOrganisationId === externalOrganisationId,
        );
      },
      async forPerson(ctx, personId) {
        return scopedFind(state.relationships, ctx, (r) => r.personId === personId);
      },

      async links(ctx, relationshipId) {
        const relationship = scopedFind(
          state.relationships,
          ctx,
          (r) => r.id === relationshipId,
        );
        if (!relationship) return [];
        return scoped(state.relationshipLinks, ctx).filter(
          (l) => l.relationshipId === relationship.id,
        );
      },
      async linksForEntity(ctx, entity) {
        return scoped(state.relationshipLinks, ctx).filter(
          (l) => l.entity.type === entity.type && l.entity.id === entity.id,
        );
      },

      async listInteractions(ctx) {
        return scoped(state.interactions, ctx).sort((a, b) =>
          b.occurredAt.localeCompare(a.occurredAt),
        );
      },
      async interactionsFor(ctx, party) {
        const { organisationIds, personIds } = resolveParty(ctx, party);
        if (organisationIds.size === 0 && personIds.size === 0) return [];
        return scoped(state.interactions, ctx)
          .filter(
            (i: Interaction) =>
              i.externalOrganisationIds.some((id) => organisationIds.has(id)) ||
              i.personIds.some((id) => personIds.has(id)),
          )
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      },
      async logInteraction(ctx, input) {
        // Participants are filtered to this tenant. An interaction must never
        // become a pointer to another organisation's person record.
        const validPersonIds = input.personIds.filter((id) =>
          Boolean(scopedFind(state.people, ctx, (p) => p.id === id)),
        );
        const validOrgIds = input.externalOrganisationIds.filter((id) =>
          Boolean(scopedFind(state.externalOrganisations, ctx, (o) => o.id === id)),
        );

        const id = newId("int");
        state.interactions.push({
          ...input,
          id,
          organisationId: ctx.organisationId,
          personIds: validPersonIds,
          externalOrganisationIds: validOrgIds,
          recordedBy: ctx.userId,
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        });
        recordActivity(ctx, `logged ${input.type}`, input.subject);
        await recordAudit(ctx, {
          action: "relationship.interaction.logged",
          entityType: "interaction",
          entityId: id,
          summary: `Logged ${input.type}: ${input.subject.slice(0, 60)}`,
        });
        return id;
      },

      async listCommitments(ctx) {
        return scoped(state.commitments, ctx);
      },
      async commitmentsFor(ctx, party) {
        const { organisationIds, personIds } = resolveParty(ctx, party);
        if (organisationIds.size === 0 && personIds.size === 0) return [];
        return scoped(state.commitments, ctx).filter(
          (c: Commitment) =>
            (c.externalOrganisationId !== undefined &&
              organisationIds.has(c.externalOrganisationId)) ||
            (c.personId !== undefined && personIds.has(c.personId)),
        );
      },
      async createCommitment(ctx, input) {
        const id = newId("com");
        state.commitments.push({
          ...input,
          id,
          organisationId: ctx.organisationId,
          // Resolve the counterparty inside the tenant, or drop it.
          externalOrganisationId: input.externalOrganisationId
            ? (scopedFind(
                state.externalOrganisations,
                ctx,
                (o) => o.id === input.externalOrganisationId,
              )?.id ?? undefined)
            : undefined,
          personId: input.personId
            ? (scopedFind(state.people, ctx, (p) => p.id === input.personId)?.id ?? undefined)
            : undefined,
          audit: {
            createdAt: stamp(ctx),
            updatedAt: stamp(ctx),
            createdBy: ctx.userId,
            archivedAt: null,
          },
        });
        await recordAudit(ctx, {
          action: "relationship.commitment.created",
          entityType: "commitment",
          entityId: id,
          summary: `Recorded commitment: ${input.title.slice(0, 60)}`,
        });
        return id;
      },
      async setCommitmentStatus(ctx, commitmentId, status) {
        const commitment = scopedFind(state.commitments, ctx, (c) => c.id === commitmentId);
        if (!commitment) return;
        commitment.status = status;
        commitment.completedAt = status === "completed" ? stamp(ctx) : undefined;
        commitment.audit.updatedAt = stamp(ctx);
        recordActivity(ctx, `marked commitment ${status}`, commitment.title);
        await recordAudit(ctx, {
          action: "relationship.commitment.status_changed",
          entityType: "commitment",
          entityId: commitmentId,
          summary: `Commitment '${commitment.title.slice(0, 50)}' marked ${status}`,
        });
      },

      async organisationForFunder(ctx, funderId) {
        const funder = scopedFind(state.funders, ctx, (f) => f.id === funderId);
        if (!funder?.externalOrganisationId) return null;
        return scopedFind(
          state.externalOrganisations,
          ctx,
          (o) => o.id === funder.externalOrganisationId,
        );
      },
      async funderForOrganisation(ctx, externalOrganisationId) {
        return scopedFind(
          state.funders,
          ctx,
          (f) => f.externalOrganisationId === externalOrganisationId,
        );
      },
    },

    workspace: {
      async tasks(ctx) {
        return scoped(state.tasks, ctx);
      },
      async openTasks(ctx) {
        return scoped(state.tasks, ctx).filter((t) => t.status !== "done");
      },
      async notifications(ctx) {
        return scoped(state.notifications, ctx);
      },
      async activity(ctx) {
        return [...scoped(state.activity, ctx)].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
      },
      async toggleTask(ctx, taskId) {
        const task = scopedFind(state.tasks, ctx, (t) => t.id === taskId);
        if (!task) return;
        task.status = task.status === "done" ? "todo" : "done";
        task.audit.updatedAt = stamp(ctx);
      },
      async createTask(ctx, input) {
        const now = stamp(ctx);
        const task: Task = {
          ...input,
          id: newId("task"),
          organisationId: ctx.organisationId,
          status: input.status ?? "todo",
          audit: { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
        };
        state.tasks.push(task);
        return task.id;
      },
      async notify(ctx, input) {
        const notification: Notification = {
          ...input,
          id: newId("notif"),
          organisationId: ctx.organisationId,
          read: false,
          createdAt: stamp(ctx),
        };
        state.notifications.push(notification);
        return notification.id;
      },
    },

    /**
     * Events, automation and scheduling.
     *
     * The write surface here is deliberately narrow. There is no `updateRun`:
     * a run is the record of something the system did without a person
     * present, and a record that can be rewritten is not evidence. `approveRun`
     * is the one mutation a person is entitled to make, and it refuses a run
     * that is not actually awaiting approval.
     */

    /**
     * Forms.
     *
     * `submit` is the only write surface in the product a member of the public
     * can reach, so everything that must be true of a submission is enforced
     * here rather than by the caller: validation against the version that was
     * answered, refusal of answers to hidden fields, sensitivity carried from
     * the field onto the answer, consent recorded verbatim, and a retention
     * date stamped on arrival.
     *
     * `answers` filters by capability rather than refusing outright. A role
     * without `beneficiary_data:view` gets the submission without its special
     * category answers, because refusing the whole thing would make ordinary
     * review impossible and returning everything would defeat the
     * classification.
     */
    forms: {
      async list(ctx) {
        return scoped(state.forms, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.forms, ctx, (f) => f.id === id);
      },
      async getBySlug(ctx, slug) {
        const form = scopedFind(state.forms, ctx, (f) => f.slug === slug);
        // A closed form resolves to null rather than to a form that refuses on
        // submit: telling somebody the form exists and then rejecting their
        // answers wastes their time twice.
        return form && form.status === "open" ? form : null;
      },
      async versions(ctx, formId) {
        return scoped(state.formVersions, ctx)
          .filter((v) => v.formId === formId)
          .sort((a, b) => a.versionNumber - b.versionNumber);
      },
      async getVersion(ctx, versionId) {
        return scopedFind(state.formVersions, ctx, (v) => v.id === versionId);
      },
      async fields(ctx, versionId) {
        return scoped(state.formFields, ctx)
          .filter((f) => f.versionId === versionId)
          .sort((a, b) => a.order - b.order);
      },
      async mappings(ctx, formId) {
        return scoped(state.formMappings, ctx).filter((m) => m.formId === formId);
      },

      async saveDraft(ctx, input) {
        const now = stamp(ctx);
        const formId = input.form.id ?? newId("form");
        const existing = scopedFind(state.forms, ctx, (f) => f.id === formId);

        const form: Form = {
          ...input.form,
          id: formId,
          organisationId: ctx.organisationId,
          audit: existing
            ? { ...existing.audit, updatedAt: now, updatedBy: ctx.userId }
            : { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
        };
        if (existing) Object.assign(existing, form);
        else state.forms.push(form);

        // A new draft version every time, never an edit to a published one.
        // Editing a published version would make every submission that
        // answered it unreadable.
        const versionNumber =
          state.formVersions.filter(
            (v) => v.formId === formId && v.organisationId === ctx.organisationId,
          ).length + 1;
        const versionId = newId("formv");
        state.formVersions.push({
          id: versionId,
          organisationId: ctx.organisationId,
          formId,
          versionNumber,
          status: "draft",
          sections: input.sections,
          audit: { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
        });

        for (const field of input.fields) {
          state.formFields.push({
            ...field,
            id: newId("formf"),
            organisationId: ctx.organisationId,
            versionId,
          });
        }

        state.formMappings = state.formMappings.filter(
          (m) => !(m.formId === formId && m.organisationId === ctx.organisationId),
        );
        for (const mapping of input.mappings) {
          state.formMappings.push({
            ...mapping,
            id: newId("formm"),
            organisationId: ctx.organisationId,
            formId,
            audit: { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
          });
        }

        return { formId, versionId };
      },

      async publish(ctx, versionId) {
        const version = scopedFind(state.formVersions, ctx, (v) => v.id === versionId);
        if (!version) {
          return { ok: false, problems: [{ code: "not_found", message: "No such version." }] };
        }
        const form = scopedFind(state.forms, ctx, (f) => f.id === version.formId);
        if (!form) {
          return { ok: false, problems: [{ code: "not_found", message: "No such form." }] };
        }

        const fields = scoped(state.formFields, ctx).filter((f) => f.versionId === versionId);
        const problems = checkPublishable(form, fields);
        if (problems.length > 0) return { ok: false, problems };

        version.status = "published";
        version.publishedAt = stamp(ctx);
        version.publishedBy = ctx.userId;
        form.currentVersionId = versionId;
        form.audit.updatedAt = stamp(ctx);

        for (const other of scoped(state.formVersions, ctx)) {
          if (other.formId !== form.id || other.id === versionId) continue;
          if (other.status !== "published") continue;
          other.status = "retired";
          other.retiredAt = stamp(ctx);
        }

        await recordAudit(ctx, {
          action: "form.published",
          entityType: "task",
          entityId: form.id,
          summary: `Published version ${version.versionNumber} of '${form.name}'`,
        });

        return { ok: true, problems: [] };
      },

      async submit(ctx, init) {
        const form = scopedFind(state.forms, ctx, (f) => f.id === init.formId);
        if (!form || form.status !== "open") {
          return { ok: false, message: "That form is not accepting responses." };
        }
        if (!form.currentVersionId) {
          return { ok: false, message: "That form has no published version." };
        }
        const versionId = form.currentVersionId;
        const fields = scoped(state.formFields, ctx)
          .filter((f) => f.versionId === versionId)
          .sort((a, b) => a.order - b.order);

        const now = ctx.now();
        const problems = validateSubmission({ fields, values: init.values, now });
        if (problems.length > 0) return { ok: false, problems };

        const spam = assessSpam({
          fields,
          values: init.values,
          honeypotValue: init.honeypotValue,
          secondsOnPage: init.secondsOnPage,
        });

        const fieldByKey = new Map(fields.map((field) => [field.key, field]));
        const submissionId = newId("sub");

        const submission: FormSubmission = {
          id: submissionId,
          organisationId: ctx.organisationId,
          formId: form.id,
          versionId,
          // Suspected spam is stored and flagged, never discarded. A false
          // positive costs a person who needed help; a false negative costs
          // somebody thirty seconds.
          status: spam.suspected
            ? "spam"
            : init.source === "internal"
              ? "awaiting_review"
              : "awaiting_review",
          source: init.source,
          submittedAt: now.toISOString(),
          submittedBy: init.source === "internal" ? ctx.userId : undefined,
          sourceToken: init.sourceToken,
          retainUntil: retainUntil(form, now),
        };
        state.formSubmissions.push(submission);

        for (const [key, value] of Object.entries(init.values)) {
          if (value === undefined) continue;
          const field = fieldByKey.get(key);
          if (!field) continue;
          state.submissionAnswers.push({
            id: newId("suba"),
            organisationId: ctx.organisationId,
            submissionId,
            fieldKey: key,
            fieldLabel: field.label,
            fieldType: field.type,
            // Carried from the field, never decided here. Classifying at
            // write time would let two answers to the same question be
            // classified differently.
            sensitivity: field.sensitivity,
            value,
          });

          if (field.type === "consent" && value.type === "boolean") {
            state.consentRecords.push({
              id: newId("consent"),
              organisationId: ctx.organisationId,
              submissionId,
              versionId,
              fieldKey: key,
              // Verbatim from the version answered, so the wording somebody
              // actually agreed to can always be recovered.
              purpose: field.consentPurpose ?? field.label,
              granted: value.boolean,
              recordedAt: now.toISOString(),
            });
          }
        }

        return { ok: true, submissionId, spamScore: spam.score };
      },

      async submissions(ctx, formId) {
        return scoped(state.formSubmissions, ctx)
          .filter((s) => !formId || s.formId === formId)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      },
      async getSubmission(ctx, id) {
        return scopedFind(state.formSubmissions, ctx, (s) => s.id === id);
      },
      async answers(ctx, submissionId) {
        const mayReadSpecial = can(ctx.role, "beneficiary_data:view");
        return scoped(state.submissionAnswers, ctx)
          .filter((a) => a.submissionId === submissionId)
          .filter((a) => mayReadSpecial || a.sensitivity !== "special_category");
      },
      async consent(ctx, submissionId) {
        return scoped(state.consentRecords, ctx).filter((c) => c.submissionId === submissionId);
      },
      async reviewSubmission(ctx, submissionId, status, note) {
        const submission = scopedFind(state.formSubmissions, ctx, (s) => s.id === submissionId);
        if (!submission) return;
        if (status === "rejected" && !note?.trim()) return;
        submission.status = status;
        submission.reviewedBy = ctx.userId;
        submission.reviewedAt = stamp(ctx);
        submission.reviewNote = note;
      },
      async withdrawConsent(ctx, consentId) {
        const record = scopedFind(state.consentRecords, ctx, (c) => c.id === consentId);
        if (!record || record.withdrawnAt) return;
        // Recorded, never deleted. A deleted consent record cannot prove that
        // consent was withdrawn.
        record.withdrawnAt = stamp(ctx);
      },

      async redactExpired(ctx) {
        const due = answersDueForErasure(scoped(state.formSubmissions, ctx), ctx.now());
        if (due.length === 0) return { submissions: 0, answers: 0 };

        let erased = 0;
        for (const answer of scoped(state.submissionAnswers, ctx)) {
          if (!due.includes(answer.submissionId) || answer.redacted) continue;
          answer.value = { type: "text", text: "" };
          answer.redacted = true;
          answer.redactedAt = stamp(ctx);
          erased += 1;
        }

        await recordAudit(ctx, {
          action: "form.answers.redacted",
          entityType: "task",
          entityId: due[0]!,
          summary: `Erased ${erased} answers across ${due.length} submissions whose retention period expired`,
        });

        // The submission rows stay. "Somebody submitted this on this date and
        // the answers were deleted under our retention policy" is a true and
        // useful statement, and deleting the row would make the erasure itself
        // unprovable.
        return { submissions: due.length, answers: erased };
      },
    },

    /**
     * The public form surface.
     *
     * Unscoped, because a slug is what identifies the organisation and there
     * is no session to scope by. Narrowed to almost nothing in compensation:
     * only `public` forms that are `open` and have a published version resolve
     * at all, only that version's fields are readable, and no other table is
     * reachable from here.
     *
     * The submit path synthesises a context from the form's own organisation
     * and then calls the same `forms.submit` an authenticated caller uses, so
     * validation, sensitivity classification, consent and retention are the
     * same code rather than a second, laxer copy.
     */
    publicForms: {
      async resolveBySlug(slug) {
        const form = state.forms.find(
          (candidate) =>
            candidate.slug === slug &&
            candidate.access === "public" &&
            candidate.status === "open" &&
            !candidate.audit.archivedAt,
        );
        if (!form?.currentVersionId) return null;
        const version = state.formVersions.find(
          (candidate) =>
            candidate.id === form.currentVersionId &&
            candidate.organisationId === form.organisationId &&
            candidate.status === "published",
        );
        return version ? { form, version } : null;
      },
      async fields(slug) {
        const resolved = await repository.publicForms.resolveBySlug(slug);
        if (!resolved) return [];
        return state.formFields
          .filter(
            (field) =>
              field.versionId === resolved.version.id &&
              field.organisationId === resolved.form.organisationId,
          )
          .sort((a, b) => a.order - b.order);
      },
      async submit(slug, init) {
        const resolved = await repository.publicForms.resolveBySlug(slug);
        if (!resolved) return { ok: false, message: "That form is not available." };

        // A synthesised context, scoped to the form's own organisation and to
        // nothing else. The acting user is the form's creator rather than a
        // shared system identity, so the audit trail names somebody real.
        const publicCtx: RequestContext = {
          organisationId: resolved.form.organisationId,
          userId: resolved.form.audit.createdBy ?? "public",
          // The narrowest role that can write a submission. A public
          // respondent must never inherit the capabilities of whoever built
          // the form.
          role: "contributor",
          now: () => new Date(),
        };

        return repository.forms.submit(publicCtx, {
          ...init,
          formId: resolved.form.id,
          source: "public",
        });
      },
    },
    automation: {
      async list(ctx) {
        return scoped(state.automations, ctx).filter(isLive);
      },
      async get(ctx, id) {
        return scopedFind(state.automations, ctx, (a) => a.id === id);
      },
      async activeFor(ctx, kind) {
        return scoped(state.automations, ctx)
          .filter(isLive)
          .filter((a) => a.status === "active" && a.trigger.kind === kind);
      },
      async save(ctx, input) {
        const now = stamp(ctx);
        const existing = input.id
          ? scopedFind(state.automations, ctx, (a) => a.id === input.id)
          : null;

        if (existing) {
          Object.assign(existing, input, {
            id: existing.id,
            organisationId: existing.organisationId,
            audit: { ...existing.audit, updatedAt: now, updatedBy: ctx.userId },
          });
          return existing.id;
        }

        const automation: Automation = {
          ...input,
          id: input.id ?? newId("auto"),
          organisationId: ctx.organisationId,
          audit: { createdAt: now, updatedAt: now, createdBy: ctx.userId, archivedAt: null },
        };
        state.automations.push(automation);
        await recordAudit(ctx, {
          action: "automation.created",
          entityType: "task",
          entityId: automation.id,
          summary: `Created automation '${automation.name}'`,
        });
        return automation.id;
      },
      async setStatus(ctx, id, status) {
        const automation = scopedFind(state.automations, ctx, (a) => a.id === id);
        if (!automation) return;
        const previous = automation.status;
        automation.status = status;
        automation.audit.updatedAt = stamp(ctx);
        automation.audit.updatedBy = ctx.userId;
        await recordAudit(ctx, {
          action: "automation.status_changed",
          entityType: "task",
          entityId: id,
          summary: `Automation '${automation.name}' moved from ${previous} to ${status}`,
        });
      },

      async recordEvent(ctx, event) {
        const record: DomainEvent = {
          ...event,
          id: newId("evt"),
          organisationId: ctx.organisationId,
        };
        state.domainEvents.push(record);
        return record;
      },
      async events(ctx, options) {
        const rows = scoped(state.domainEvents, ctx);
        return (options?.unprocessedOnly ? rows.filter((e) => !e.processedAt) : rows).sort((a, b) =>
          a.occurredAt.localeCompare(b.occurredAt),
        );
      },
      async markEventProcessed(ctx, eventId) {
        const event = scopedFind(state.domainEvents, ctx, (e) => e.id === eventId);
        if (!event) return;
        event.processedAt = stamp(ctx);
      },

      async runs(ctx, options) {
        return scoped(state.automationRuns, ctx)
          .filter((run) => !options?.automationId || run.automationId === options.automationId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      },
      async getRun(ctx, runId) {
        return scopedFind(state.automationRuns, ctx, (r) => r.id === runId);
      },
      async steps(ctx, runId) {
        return scoped(state.automationSteps, ctx)
          .filter((step) => step.runId === runId)
          .sort((a, b) => a.order - b.order);
      },
      async failures(ctx, runId) {
        return scoped(state.automationFailures, ctx).filter((f) => f.runId === runId);
      },
      async recordRun(ctx, run, steps) {
        if (run.organisationId !== ctx.organisationId) return;
        state.automationRuns.push(run);
        for (const step of steps) {
          if (step.organisationId !== ctx.organisationId) continue;
          state.automationSteps.push(step);
        }
        const automation = scopedFind(state.automations, ctx, (a) => a.id === run.automationId);
        if (automation && !run.simulated) automation.lastRunAt = run.startedAt;
      },
      async updateStep(ctx, stepId, patch) {
        const step = scopedFind(state.automationSteps, ctx, (s) => s.id === stepId);
        if (!step) return;
        Object.assign(step, patch);
      },
      async completeRun(ctx, runId, outcome, finishedAt) {
        const run = scopedFind(state.automationRuns, ctx, (r) => r.id === runId);
        if (!run) return;
        run.outcome = outcome;
        run.finishedAt = finishedAt;
      },
      async approveRun(ctx, runId) {
        const run = scopedFind(state.automationRuns, ctx, (r) => r.id === runId);
        // Approving a run that is not waiting is not a no-op: it would mean a
        // completed run could be "approved" retrospectively, which makes the
        // approval record meaningless.
        if (!run || run.outcome !== "awaiting_approval") return null;
        run.approvedBy = ctx.userId;
        run.approvedAt = stamp(ctx);
        await recordAudit(ctx, {
          action: "automation.run.approved",
          entityType: "task",
          entityId: runId,
          summary: `Approved an automation run against ${run.subject.type} ${run.subject.id}`,
        });
        return run;
      },
      async recordFailure(ctx, failure) {
        state.automationFailures.push({
          ...failure,
          id: newId("autofail"),
          organisationId: ctx.organisationId,
        });
      },

      async scheduleJob(ctx, job) {
        // Deduplicated on write. A scanner that runs twice must not produce two
        // reminders, and nowhere downstream can undo a duplicate reliably.
        const existing = state.scheduledJobs.find(
          (j) => j.organisationId === ctx.organisationId && j.dedupeKey === job.dedupeKey,
        );
        if (existing) return null;

        const record: ScheduledJob = {
          ...job,
          id: newId("job"),
          organisationId: ctx.organisationId,
          status: "pending",
          attempts: 0,
          createdAt: stamp(ctx),
        };
        state.scheduledJobs.push(record);
        return record;
      },
      async dueJobs(ctx, now) {
        return scoped(state.scheduledJobs, ctx)
          .filter((job) => job.status === "pending" && Date.parse(job.runAfter) <= now.getTime())
          .sort((a, b) => a.runAfter.localeCompare(b.runAfter));
      },
      async completeJob(ctx, jobId, status, error) {
        const job = scopedFind(state.scheduledJobs, ctx, (j) => j.id === jobId);
        if (!job) return;
        job.status = status;
        job.attempts += 1;
        job.lastError = error;
        job.finishedAt = stamp(ctx);
      },
    },

    audit: {
      async list(ctx) {
        return [...scoped(state.auditEvents, ctx)].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
      },
      async record(ctx, event) {
        await recordAudit(ctx, event);
      },
      async recordAiGeneration(ctx, generation) {
        const record: AIGeneration = {
          ...generation,
          id: newId("ai"),
          organisationId: ctx.organisationId,
          userId: ctx.userId,
          createdAt: ctx.now().toISOString(),
        };
        state.aiGenerations.push(record);
        await recordAudit(ctx, {
          action: "ai.generation.created",
          entityType: "ai_generation",
          entityId: record.id,
          summary: `AI ${generation.feature} generated with ${generation.model}`,
        });
        return record;
      },
      async aiGenerations(ctx) {
        return scoped(state.aiGenerations, ctx);
      },
    },
  };

  return repository;
}
