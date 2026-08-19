import { beforeEach, describe, expect, it } from "vitest";
import {
  createTwoTenantHarness,
  ORG_A,
  ORG_B,
  type TwoTenantHarness,
} from "../fixtures/two-tenant";
import { buildAnswerContext, buildCommandContext } from "@/server/services/context";

/**
 * Tenant isolation is non-negotiable, so it is asserted rather than assumed.
 *
 * These tests cover three distinct ways a tenant boundary can leak:
 *   1. Listing   — a query returns another tenant's rows.
 *   2. Direct reference — a caller supplies a valid id belonging to another
 *      tenant (an insecure-direct-object-reference).
 *   3. Mutation  — a write reaches across the boundary.
 *
 * A fourth is covered explicitly because it is unique to this product:
 *   4. AI grounding — another tenant's data reaching a model's context.
 */
describe("tenant isolation", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * Most assertions below are negative ("tenant A sees no Beacon rows"). Those
   * would pass just as happily against an empty fixture, so first prove the
   * fixture actually contains the data that isolation is supposed to withhold.
   */
  describe("fixture is non-vacuous", () => {
    it("holds records for both tenants in the same underlying state", () => {
      const { state } = h;

      expect(state.organisations.map((o) => o.id)).toEqual(
        expect.arrayContaining([ORG_A, ORG_B]),
      );
      for (const rows of [
        state.opportunities,
        state.applications,
        state.applicationAnswers,
        state.grants,
        state.evidenceItems,
        state.tasks,
        state.impactReports,
      ]) {
        const tenants = new Set(rows.map((r) => r.organisationId));
        expect(tenants.has(ORG_A)).toBe(true);
        expect(tenants.has(ORG_B)).toBe(true);
      }
    });

    it("would leak without scoping: the raw state contains tenant B evidence", () => {
      expect(h.state.evidenceItems.some((e) => e.title.includes("Beacon"))).toBe(true);
    });

    it("still returns tenant B's own records to tenant B", async () => {
      const { repo, ctxB } = h;

      expect((await repo.evidence.list(ctxB)).some((e) => e.title.includes("Beacon"))).toBe(
        true,
      );
      expect(await repo.applications.getAnswer(ctxB, "ans-beacon-1")).not.toBeNull();
      expect((await repo.funding.listOpportunities(ctxB)).length).toBeGreaterThan(0);
    });
  });

  describe("listing never crosses the boundary", () => {
    it("scopes every list method to the context organisation", async () => {
      const { repo, ctxA } = h;

      const lists = await Promise.all([
        repo.funding.listOpportunities(ctxA),
        repo.funding.listFunders(ctxA),
        repo.applications.list(ctxA),
        repo.grants.list(ctxA),
        repo.grants.allReports(ctxA),
        repo.programmes.list(ctxA),
        repo.programmes.allIndicators(ctxA),
        repo.evidence.list(ctxA),
        repo.reports.list(ctxA),
        repo.workspace.tasks(ctxA),
        repo.workspace.notifications(ctxA),
        repo.workspace.activity(ctxA),
        repo.audit.list(ctxA),
      ]);

      for (const rows of lists) {
        expect(rows.length).toBeGreaterThanOrEqual(0);
        for (const row of rows) {
          expect((row as { organisationId: string }).organisationId).toBe(ORG_A);
        }
      }
    });

    it("gives each tenant only its own organisation and members", async () => {
      const { repo, ctxA, ctxB } = h;

      expect((await repo.organisations.get(ctxA))?.id).toBe(ORG_A);
      expect((await repo.organisations.get(ctxB))?.id).toBe(ORG_B);
      expect((await repo.organisations.profile(ctxA))?.organisationId).toBe(ORG_A);
      expect((await repo.organisations.profile(ctxB))?.organisationId).toBe(ORG_B);

      const usersA = await repo.organisations.users(ctxA);
      expect(usersA.some((u) => u.id === "user-beacon-lead")).toBe(false);
    });

    it("does not leak tenant B evidence into tenant A's library", async () => {
      const evidence = await h.repo.evidence.list(h.ctxA);
      expect(evidence.some((e) => e.title.includes("Beacon"))).toBe(false);
    });
  });

  describe("direct object references are refused", () => {
    it("returns null when tenant A requests tenant B records by id", async () => {
      const { repo, ctxA } = h;

      expect(await repo.funding.getOpportunity(ctxA, "opp-beacon-1")).toBeNull();
      expect(await repo.funding.getFunder(ctxA, "funder-beacon-1")).toBeNull();
      expect(await repo.applications.get(ctxA, "app-beacon-1")).toBeNull();
      expect(await repo.applications.getAnswer(ctxA, "ans-beacon-1")).toBeNull();
      expect(await repo.grants.get(ctxA, "grant-beacon-1")).toBeNull();
      expect(await repo.evidence.get(ctxA, "ev-beacon-1")).toBeNull();
      expect(await repo.reports.get(ctxA, "report-beacon-1")).toBeNull();
      expect(await repo.organisations.user(ctxA, "user-beacon-lead")).toBeNull();
    });

    it("returns no child rows for another tenant's parent id", async () => {
      const { repo, ctxA } = h;

      expect(await repo.applications.answers(ctxA, "app-beacon-1")).toEqual([]);
      expect(await repo.grants.deliverables(ctxA, "grant-beacon-1")).toEqual([]);
      expect(await repo.grants.reports(ctxA, "grant-beacon-1")).toEqual([]);
      expect(await repo.grants.payments(ctxA, "grant-beacon-1")).toEqual([]);
    });
  });

  describe("mutations cannot cross the boundary", () => {
    it("refuses to write tenant B's answer from tenant A's context", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.applications.saveAnswer(ctxA, "ans-beacon-1", "INJECTED BY TENANT A");

      const answer = await repo.applications.getAnswer(ctxB, "ans-beacon-1");
      expect(answer?.draft).toBe("Tenant B confidential draft.");
    });

    it("refuses to move tenant B's opportunity from tenant A's context", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.funding.moveStage(ctxA, "opp-beacon-1", "submitted");

      expect((await repo.funding.getOpportunity(ctxB, "opp-beacon-1"))?.stage).toBe(
        "discovered",
      );
    });

    it("refuses to toggle tenant B's task from tenant A's context", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.workspace.toggleTask(ctxA, "task-beacon-1");

      const tasks = await repo.workspace.tasks(ctxB);
      expect(tasks.find((t) => t.id === "task-beacon-1")?.status).toBe("todo");
    });

    it("refuses to change tenant B's report status from tenant A's context", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.reports.setStatus(ctxA, "report-beacon-1", "approved");

      expect((await repo.reports.get(ctxB, "report-beacon-1"))?.status).toBe("draft");
    });

    it("stamps new records with the acting tenant, not the supplied one", async () => {
      const { repo, ctxB } = h;

      const id = await repo.evidence.add(ctxB, {
        title: "Beacon new evidence",
        type: "document",
        description: "Created by tenant B.",
        tags: [],
      });

      expect((await repo.evidence.get(ctxB, id))?.organisationId).toBe(ORG_B);
      expect(await repo.evidence.get(h.ctxA, id)).toBeNull();
    });

    it("refuses a fit assessment aimed at another tenant's opportunity", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.funding.saveFitAssessment(ctxA, {
        id: "fit-opp-beacon-1",
        opportunityId: "opp-beacon-1",
        organisationId: ORG_A,
        overallScore: 99,
        category: "strong_match",
        eligibilityStatus: "met",
        factors: [],
        keyRisks: [],
        missingInformation: [],
        recommendedNextAction: "",
        effortEstimate: "low",
        strategicValue: "low",
        generatedAt: "2026-07-21T10:00:00Z",
        generatedBy: "mock",
      });

      expect(await repo.funding.getFitAssessment(ctxB, "opp-beacon-1")).toBeNull();
      expect(await repo.funding.getFitAssessment(ctxA, "opp-beacon-1")).toBeNull();
    });
  });

  describe("AI grounding obeys the same boundary", () => {
    it("never places another tenant's evidence or figures in the model context", async () => {
      const { repo, ctxA } = h;

      const context = await buildCommandContext(ctxA, repo, "What is our pipeline?");
      const serialised = JSON.stringify(context);

      expect(serialised).not.toContain("Beacon");
      expect(context.organisationName).not.toContain("Beacon");
    });

    it("returns empty grounding when asked about another tenant's answer", async () => {
      const { repo, ctxA } = h;

      const context = await buildAnswerContext(ctxA, repo, "ans-beacon-1");

      // The answer is invisible to tenant A, so nothing about it is grounded.
      expect(context.question).toBeUndefined();
      expect(context.draft).toBeUndefined();
      expect(JSON.stringify(context)).not.toContain("confidential");
    });
  });

  describe("audit records are attributed to the acting tenant and actor", () => {
    it("writes audit entries scoped to the acting organisation", async () => {
      const { repo, ctxB } = h;

      await repo.reports.setStatus(ctxB, "report-beacon-1", "approved");

      const auditB = await repo.audit.list(ctxB);
      const auditA = await repo.audit.list(h.ctxA);

      expect(auditB.some((e) => e.action === "report.approved")).toBe(true);
      expect(auditA.some((e) => e.entityId === "report-beacon-1")).toBe(false);
    });

    it("uses the request clock rather than a frozen constant", async () => {
      const { state } = h;
      const movingClock = (() => {
        let tick = 0;
        return () => new Date(Date.UTC(2026, 6, 21, 10, 0, tick++));
      })();

      const { createRequestContext } = await import("@/server/context/request-context");
      const { createInMemoryRepository } = await import("@/server/data/in-memory/adapter");
      const repo = createInMemoryRepository(state);
      const ctx = createRequestContext({
        organisationId: ORG_B,
        userId: "user-beacon-lead",
        role: "owner",
        now: movingClock,
      });

      await repo.audit.record(ctx, {
        action: "test.one",
        entityType: "test",
        entityId: "1",
        summary: "first",
      });
      await repo.audit.record(ctx, {
        action: "test.two",
        entityType: "test",
        entityId: "2",
        summary: "second",
      });

      const events = (await repo.audit.list(ctx)).filter((e) =>
        e.action.startsWith("test."),
      );
      const timestamps = new Set(events.map((e) => e.createdAt));
      expect(timestamps.size).toBe(2);
    });
  });
});

/**
 * The workspace AI switch.
 *
 * `aiEnabled` was stored, rendered as a toggle and written by an action, and
 * read by nothing: turning AI off in Settings changed no behaviour at all. A
 * control that appears to disable something and does not is worse than no
 * control, because a workspace that deliberately turned it off believed it had.
 *
 * The gate itself lives in a `"use server"` module, so what is asserted here is
 * the state it reads — that the setting round-trips per tenant and is therefore
 * a real signal rather than a decoration.
 */
describe("AI enabled is a real, per-tenant setting", () => {
  it("round-trips and is scoped to one organisation", async () => {
    const h = createTwoTenantHarness();

    await h.repo.organisations.setAiEnabled(h.ctxA, false);

    expect((await h.repo.organisations.get(h.ctxA))?.aiEnabled).toBe(false);
    // Tenant B is untouched: the switch is per workspace, not global.
    expect((await h.repo.organisations.get(h.ctxB))?.aiEnabled).toBe(true);

    await h.repo.organisations.setAiEnabled(h.ctxA, true);
    expect((await h.repo.organisations.get(h.ctxA))?.aiEnabled).toBe(true);
  });
});
