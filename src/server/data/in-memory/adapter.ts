import type {
  ActivityEvent,
  AIGeneration,
  AuditEvent,
  Claim,
  Commitment,
  EntityReference,
  EvidenceItem,
  Grant,
  Indicator,
  Interaction,
} from "@/types/domain";
import { createClaim } from "@/lib/knowledge";
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

  return {
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
      async updateIndicator(ctx, indicatorId, value, note) {
        const indicator = scopedFind(state.indicators, ctx, (i) => i.id === indicatorId);
        if (!indicator) return;
        indicator.currentValue = value;
        indicator.lastUpdated = ctx.now().toISOString().slice(0, 10);
        indicator.audit.updatedAt = stamp(ctx);
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
        if (provenance) section.provenance = provenance;
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
    },

    relationships: {
      async listOrganisations(ctx) {
        return scoped(state.externalOrganisations, ctx).filter(isLive);
      },
      async getOrganisation(ctx, id) {
        return scopedFind(state.externalOrganisations, ctx, (o) => o.id === id);
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
}
