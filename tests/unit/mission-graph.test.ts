import { beforeEach, describe, expect, it } from "vitest";
import type { EntityReference } from "@/types/domain";
import {
  createTwoTenantHarness,
  type TwoTenantHarness,
} from "../fixtures/two-tenant";

/**
 * The architectural acceptance test.
 *
 * `docs/MISSION_GRAPH_ARCHITECTURE.md` §5 poses one chain as the test of
 * whether the Mission Graph is real rather than aspirational:
 *
 *   A donor gives £25,000 restricted to Programme A. That money enters Fund X.
 *   Programme A uses £4,000 of it for Activity Y. Activity Y contributes to
 *   Output Z. Output Z contributes to Outcome Q. Outcome Q is measured through
 *   Indicator R. Evidence E supports the measurement. Funder F requires
 *   Outcome Q in its report. The report cites Evidence E and the financial
 *   utilisation of the grant. The relationship owner is reminded 30 days
 *   before reporting.
 *
 * Before MG-1, seven of its twelve links were not representable. This file
 * walks it link by link, so that a regression anywhere along it fails a test
 * with the name of the link that broke rather than a generic assertion.
 *
 * It runs on the seeded demo workspace, over the Henderson Trust grant and the
 * Youth Futures programme, because a chain that only holds for purpose-built
 * fixture data has not been demonstrated on the product's own model.
 */

const GRANT = "grant-henderson";
const FUND = "fund-henderson-youth";
const PROGRAMME = "prog-youth";
const ACTIVITY = "act-mentoring";
const OUTPUT = "outp-mentoring-matches";
const OUTCOME = "out-youth-eet";
const INDICATOR = "ind-eet";
const MEASUREMENT = "meas-eet-2026h1";
const EVIDENCE = "ev-stat-progression";
const REQUIREMENT = "req-henderson-interim";
const PRIORITY = "sp-youth-opportunity";

const ref = (type: EntityReference["type"], id: string): EntityReference => ({ type, id });

describe("the §9 acceptance chain", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("1-2. a restricted award establishes a fund with a stated purpose", async () => {
    const fund = await h.repo.finance.getFund(h.ctxA, FUND);

    expect(fund).not.toBeNull();
    expect(fund!.restriction).toBe("restricted");
    // The restriction is a purpose, not a boolean. `Grant.restricted` could
    // say *that* money was restricted; only this says what to.
    expect(fund!.restrictionPurpose).toMatch(/Youth Futures/);
    expect(fund!.originRef).toEqual(
      expect.objectContaining({ type: "grant", id: GRANT }),
    );
  });

  it("3. the money enters the fund as a transaction, not a scalar", async () => {
    const received = await h.repo.finance.transactionsForFund(h.ctxA, FUND);
    const income = received.filter((t) => t.direction === "income");

    expect(income).toHaveLength(1);
    expect(income[0]!.amount).toEqual({ minorUnits: 4_750_000, currency: "GBP" });
    expect(income[0]!.restricted).toBe(true);
    expect(income[0]!.grantId).toBe(GRANT);
  });

  it("4. spend reaches an activity through an allocation that shows its method", async () => {
    const allocations = await h.repo.finance.allocationsFor(h.ctxA, ref("activity", ACTIVITY));

    expect(allocations).toHaveLength(1);
    const allocation = allocations[0]!;
    expect(allocation.amount).toEqual({ minorUnits: 400_000, currency: "GBP" });
    // The point of the allocation entity: a cost-per-outcome figure is only as
    // defensible as this record. Method and basis are what make it checkable.
    expect(allocation.allocationMethod).toBe("direct");
    expect(allocation.allocationBasis).toBe("direct");
    expect(allocation.transactionId).toBeDefined();
    expect(allocation.verifiedBy).toBeDefined();
  });

  it("5-6. activity contributes to output contributes to outcome", async () => {
    const reachable = await h.repo.graph.reach(
      h.ctxA,
      ref("activity", ACTIVITY),
      "contributes_to",
    );

    // One traversal, not two queries stitched together by the caller.
    expect(reachable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "output", id: OUTPUT }),
        expect.objectContaining({ type: "outcome", id: OUTCOME }),
      ]),
    );
  });

  it("5-6. a partial contribution says so, rather than defaulting to all of it", async () => {
    const edges = await h.repo.graph.from(h.ctxA, ref("output", OUTPUT), "contributes_to");
    const toOutcome = edges.find((e) => e.to.id === OUTCOME);

    expect(toOutcome).toBeDefined();
    expect(toOutcome!.weight).toBeLessThan(1);
    expect(toOutcome!.note).toBeTruthy();
  });

  it("7. the outcome is measured, and the measurement has a history", async () => {
    const indicators = await h.repo.programmes.indicatorsForOutcome(h.ctxA, OUTCOME);
    expect(indicators.map((i) => i.id)).toContain(INDICATOR);

    const measurements = await h.repo.programmes.measurements(h.ctxA, INDICATOR);
    // Two readings, newest first. A single overwritten `currentValue` cannot
    // support a trend, and cannot tell a published report what it was written
    // against.
    expect(measurements).toHaveLength(2);
    expect(measurements[0]!.recordedAt > measurements[1]!.recordedAt).toBe(true);
  });

  it("8. evidence supports the measurement, not merely the ambition", async () => {
    const supporting = await h.repo.evidence.forEntity(
      h.ctxA,
      ref("indicator_measurement", MEASUREMENT),
    );

    expect(supporting.map((e) => e.id)).toContain(EVIDENCE);
  });

  it("9. the funder's requirement names the outcome it asked for", async () => {
    const requirements = await h.repo.requirements.forGrant(h.ctxA, GRANT);
    expect(requirements).toHaveLength(1);

    const required = await h.repo.requirements.requires(h.ctxA, requirements[0]!.id);
    // "What did we promise this funder?" is a traversal, not a search over
    // `Grant.conditions: string[]`.
    expect(required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "outcome", id: OUTCOME }),
        expect.objectContaining({ type: "indicator", id: INDICATOR }),
      ]),
    );
  });

  it("11. financial utilisation of the grant is reconstructable", async () => {
    const spent = await h.repo.finance.allocationsFor(h.ctxA, ref("grant", GRANT));
    const total = spent.reduce((sum, a) => sum + a.amount.minorUnits, 0);

    // Not `Grant.spentToDate`, which is a scalar nobody can check. This total
    // is the sum of allocations, each of which names its transaction.
    expect(total).toBe(400_000);
    expect(spent.every((a) => a.transactionId)).toBe(true);
  });

  it("12. the reporting requirement has a due date and the work has an owner", async () => {
    const [requirement] = await h.repo.requirements.forGrant(h.ctxA, GRANT);
    const grant = await h.repo.grants.get(h.ctxA, GRANT);

    expect(requirement!.dueDate).toBe("2026-08-28");
    expect(grant!.grantManagerId).toBeTruthy();
    // The reminder itself is MG-6. What MG-1 owes is the data a scheduler
    // needs: a dated obligation with someone accountable for it.
  });

  it("walks the whole chain from money to funder requirement", async () => {
    // The test the architecture document is actually making a claim about:
    // one path, traversed without reconstructing it by hand.
    const allocation = (
      await h.repo.finance.allocationsFor(h.ctxA, ref("activity", ACTIVITY))
    )[0]!;
    const activity = await h.repo.programmes.getActivity(h.ctxA, allocation.activityId!);
    expect(activity).not.toBeNull();

    const downstream = await h.repo.graph.reach(
      h.ctxA,
      ref("activity", activity!.id),
      "contributes_to",
    );
    const outcome = downstream.find((r) => r.type === "outcome");
    expect(outcome).toBeDefined();

    const indicators = await h.repo.programmes.indicatorsForOutcome(h.ctxA, outcome!.id);
    const measurements = await h.repo.programmes.measurements(h.ctxA, indicators[0]!.id);
    const evidence = await h.repo.evidence.forEntity(
      h.ctxA,
      ref("indicator_measurement", measurements[0]!.id),
    );
    expect(evidence.length).toBeGreaterThan(0);

    const requirements = await h.repo.requirements.list(h.ctxA);
    const required = await h.repo.requirements.requires(h.ctxA, requirements[0]!.id);
    expect(required.some((r) => r.type === "outcome" && r.id === outcome!.id)).toBe(true);
  });

  it("reaches delivery from strategy", async () => {
    const programmes = await h.repo.strategy.programmesFor(h.ctxA, PRIORITY);
    expect(programmes.map((p) => p.id)).toContain(PROGRAMME);
  });
});

/**
 * The mutation test the verification protocol requires: disable the mechanism
 * the phase exists to provide, and demonstrate that named tests fail.
 */
describe("the chain depends on the edges, not on coincidence", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("removing the output-to-outcome edge breaks the traversal", async () => {
    const before = await h.repo.graph.reach(h.ctxA, ref("activity", ACTIVITY), "contributes_to");
    expect(before.some((r) => r.id === OUTCOME)).toBe(true);

    const edge = (await h.repo.graph.from(h.ctxA, ref("output", OUTPUT), "contributes_to")).find(
      (e) => e.to.id === OUTCOME,
    )!;
    await h.repo.graph.disconnect(h.ctxA, edge.id);

    const after = await h.repo.graph.reach(h.ctxA, ref("activity", ACTIVITY), "contributes_to");
    expect(after.some((r) => r.id === OUTPUT)).toBe(true);
    expect(after.some((r) => r.id === OUTCOME)).toBe(false);
  });

  it("traversal follows one kind of edge and does not wander", async () => {
    // `pursues`, `funds` and `evidences` edges all touch these nodes. A
    // traversal that ignored `kind` would appear to work and would return
    // nonsense.
    const reachable = await h.repo.graph.reach(h.ctxA, ref("fund", FUND), "contributes_to");
    expect(reachable).toEqual([]);
  });

  it("terminates on a cycle rather than recursing forever", async () => {
    await h.repo.graph.connect(h.ctxA, {
      from: ref("outcome", OUTCOME),
      to: ref("activity", ACTIVITY),
      kind: "contributes_to",
    });

    const reachable = await h.repo.graph.reach(h.ctxA, ref("activity", ACTIVITY), "contributes_to");
    expect(reachable.length).toBeLessThan(10);
    expect(reachable.some((r) => r.id === OUTCOME)).toBe(true);
  });
});

/**
 * `Relation` is the first table whose rows can point at anything, so the tenant
 * check that suffices everywhere else — a correctly stamped `organisationId` —
 * is not enough here.
 */
describe("relations cannot cross the tenant boundary", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("refuses an edge whose target belongs to another tenant", async () => {
    const foreign = (await h.repo.funding.listOpportunities(h.ctxB))[0]!;

    const relation = await h.repo.graph.connect(h.ctxA, {
      from: ref("programme", PROGRAMME),
      to: ref("funding_opportunity", foreign.id),
      kind: "funds",
    });

    expect(relation).toBeNull();
  });

  it("refuses an edge whose source belongs to another tenant", async () => {
    const foreign = (await h.repo.funding.listOpportunities(h.ctxB))[0]!;

    const relation = await h.repo.graph.connect(h.ctxB, {
      from: ref("funding_opportunity", foreign.id),
      to: ref("outcome", OUTCOME),
      kind: "requires",
    });

    expect(relation).toBeNull();
  });

  it("refuses an edge to an entity kind it cannot resolve", async () => {
    // An unmapped kind cannot be checked, so it cannot be connected. Refusing
    // is the safe failure: an unverifiable edge is indistinguishable from a
    // cross-tenant one.
    const relation = await h.repo.graph.connect(h.ctxA, {
      from: ref("programme", PROGRAMME),
      to: ref("campaign", "campaign-that-does-not-exist"),
      kind: "contributes_to",
    });

    expect(relation).toBeNull();
  });

  it("does not list another tenant's edges", async () => {
    const a = await h.repo.graph.list(h.ctxA);
    const b = await h.repo.graph.list(h.ctxB);

    expect(a.length).toBeGreaterThan(0);
    expect(a.every((r) => r.organisationId === "org-northstar")).toBe(true);
    expect(b.some((r) => r.organisationId === "org-northstar")).toBe(false);
  });

  it("does not traverse into another tenant", async () => {
    const reachable = await h.repo.graph.reach(
      h.ctxB,
      ref("activity", ACTIVITY),
      "contributes_to",
    );

    // Tenant B can name tenant A's activity id. It reaches nothing, because
    // the edges are scoped before the walk begins rather than filtered after.
    expect(reachable).toEqual([]);
  });

  it("refuses an allocation naming another tenant's programme", async () => {
    const id = await h.repo.finance.allocate(h.ctxB, {
      programmeId: PROGRAMME,
      amount: { minorUnits: 100_000, currency: "GBP" },
      allocationMethod: "direct",
      effectiveDate: "2026-07-01",
      verificationState: "provided",
    });

    expect(id).toBeNull();
  });

  it("scopes funds, transactions and requirements to the caller", async () => {
    expect(await h.repo.finance.funds(h.ctxB)).toEqual([]);
    expect(await h.repo.finance.transactions(h.ctxB)).toEqual([]);
    expect(await h.repo.requirements.list(h.ctxB)).toEqual([]);
    expect(await h.repo.strategy.priorities(h.ctxB)).toEqual([]);

    expect((await h.repo.finance.funds(h.ctxA)).length).toBeGreaterThan(0);
  });

  it("does not resolve another tenant's requirement through a grant id", async () => {
    expect(await h.repo.requirements.forGrant(h.ctxB, GRANT)).toEqual([]);
  });
});

describe("recording a measurement", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("appends a reading rather than only overwriting the current value", async () => {
    const before = await h.repo.programmes.measurements(h.ctxA, INDICATOR);

    await h.repo.programmes.updateIndicator(h.ctxA, INDICATOR, 63, "Third follow-up cohort.");

    const after = await h.repo.programmes.measurements(h.ctxA, INDICATOR);
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]!.value).toBe(63);
    expect(after[0]!.note).toBe("Third follow-up cohort.");
    expect(after[0]!.recordedBy).toBe("user-amara");

    const indicator = await h.repo.programmes.getIndicator(h.ctxA, INDICATOR);
    expect(indicator!.currentValue).toBe(63);
  });

  it("does not record a measurement against another tenant's indicator", async () => {
    await h.repo.programmes.updateIndicator(h.ctxB, INDICATOR, 99);

    const measurements = await h.repo.programmes.measurements(h.ctxA, INDICATOR);
    expect(measurements.some((m) => m.value === 99)).toBe(false);
  });
});
