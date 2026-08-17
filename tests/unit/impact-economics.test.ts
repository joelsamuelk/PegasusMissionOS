import { describe, expect, it } from "vitest";
import {
  allocateDirect,
  allocateSharedCost,
  reviseAllocation,
  suggestAllocation,
  validateAllocations,
  verifyAllocation,
} from "@/lib/finance-intelligence/allocate";
import { breakdownOf, costOf, rollUpCosts } from "@/lib/finance-intelligence/cost-rollup";
import {
  CurrencyMismatchError,
  addMoney,
  divideMoney,
  formatMoney,
  fromMajor,
  roundMoneyTo,
  splitMoney,
  subtractMoney,
  sumMoney,
  toMajor,
} from "@/lib/finance-intelligence/money";
import { computeSubsidy, describeStructuralSubsidy, detectStructuralSubsidy } from "@/lib/finance-intelligence/subsidy";
import { compareProgrammeEconomics, compareUnitCost } from "@/lib/finance-intelligence/trends";
import type { FinancialTransaction } from "@/lib/finance-intelligence/types";
import {
  FORBIDDEN_METRIC_LANGUAGE,
  buildProgrammeEconomics,
  computeUnitEconomics,
  socialReturnOnInvestment,
} from "@/lib/finance-intelligence/unit-economics";
import {
  ALL_ALLOCATIONS_2026,
  COMMUNITY_HEALTH_DELIVERY_2026,
  COST_NODES,
  CURRENCY,
  FINANCE_TEAM_SHARED,
  ORG,
  PERIOD_2024,
  PERIOD_2025,
  PERIOD_2026,
  TOTAL_EXPENDITURE_2026,
  YOUTH_FUTURES_COST_2024,
  YOUTH_FUTURES_COST_2025,
  YOUTH_FUTURES_DELIVERY_2025,
  YOUTH_FUTURES_DELIVERY_2026,
  YOUTH_FUTURES_RESTRICTED_2024,
  YOUTH_FUTURES_RESTRICTED_2025,
  YOUTH_FUTURES_RESTRICTED_2026,
  gbp,
} from "../fixtures/finance-fixture";

const rollup = rollUpCosts({
  period: PERIOD_2026,
  currency: CURRENCY,
  nodes: COST_NODES,
  allocations: ALL_ALLOCATIONS_2026,
  totalExpenditure: TOTAL_EXPENDITURE_2026,
});

const youthFuturesCost = costOf(rollup, "prog:youth-futures");

const economics2026 = buildProgrammeEconomics({
  programmeId: "prog:youth-futures",
  programmeName: "Youth Futures",
  period: PERIOD_2026,
  cost: youthFuturesCost,
  budget: gbp(450_000),
  measures: YOUTH_FUTURES_DELIVERY_2026,
  allocationMethods: ["direct", "shared_cost"],
  includedCosts: ["Delivery staff", "Venue hire", "Participant costs", "Evaluation", "Finance team share"],
  excludedCosts: ["Fundraising costs", "Trustee expenses"],
  financialDataQuality: rollup.coverage,
  assumptions: ["Shared costs apportioned on prior-year programme expenditure."],
  restrictedFunding: YOUTH_FUTURES_RESTRICTED_2026,
  unrestrictedFunding: gbp(50_000),
});

const economics2025 = buildProgrammeEconomics({
  programmeId: "prog:youth-futures",
  programmeName: "Youth Futures",
  period: PERIOD_2025,
  cost: YOUTH_FUTURES_COST_2025,
  measures: YOUTH_FUTURES_DELIVERY_2025,
  allocationMethods: ["direct", "shared_cost"],
  includedCosts: ["Delivery staff", "Venue hire", "Participant costs", "Evaluation", "Finance team share"],
  excludedCosts: ["Fundraising costs", "Trustee expenses"],
  financialDataQuality: rollup.coverage,
  restrictedFunding: YOUTH_FUTURES_RESTRICTED_2025,
  unrestrictedFunding: gbp(55_000),
});

describe("money", () => {
  it("splits exactly, so apportioned costs reconcile to the pound", () => {
    const parts = splitMoney(gbp(72_000), [420_000, 350_000, 230_000]);
    expect(parts.map(toMajor)).toEqual([30_240, 25_200, 16_560]);
    expect(sumMoney(parts, CURRENCY)).toEqual(gbp(72_000));
  });

  it("gives leftover minor units to the largest remainders rather than losing them", () => {
    for (const [total, weights] of [
      [100.01, [1, 1, 1]],
      [0.05, [1, 1, 1, 1, 1, 1, 1]],
      [999.99, [7, 11, 13]],
      [-250.5, [3, 2]],
    ] as Array<[number, number[]]>) {
      const parts = splitMoney(gbp(total), weights);
      expect(sumMoney(parts, CURRENCY)).toEqual(gbp(total));
    }
  });

  it("returns zeros rather than dividing by zero when every weight is zero", () => {
    const parts = splitMoney(gbp(1_000), [0, 0]);
    expect(parts.map(toMajor)).toEqual([0, 0]);
  });

  it("refuses to combine currencies instead of coercing them", () => {
    expect(() => addMoney(gbp(10), fromMajor(10, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => sumMoney([gbp(10), fromMajor(10, "USD")], CURRENCY)).toThrow(CurrencyMismatchError);
  });

  it("keeps whole minor units through conversion and rounding", () => {
    expect(fromMajor(420_000, "GBP").minorUnits).toBe(42_000_000);
    expect(toMajor(gbp(1.005))).toBe(1.01);
    expect(divideMoney(gbp(420_000), 984).minorUnits).toBe(42_683);
    expect(toMajor(roundMoneyTo(gbp(41_283), 500_000))).toBe(40_000);
  });
});

describe("allocation layer", () => {
  it("apportions a shared cost by its basis and keeps the methodology (§5)", () => {
    expect(FINANCE_TEAM_SHARED.shares.map((s) => s.proportionPercent)).toEqual([42, 35, 23]);
    expect(FINANCE_TEAM_SHARED.shares.map((s) => toMajor(s.amount))).toEqual([30_240, 25_200, 16_560]);
    expect(FINANCE_TEAM_SHARED.methodologyNote).toBe(
      "Finance Team: apportioned by programme expenditure.",
    );
    for (const allocation of FINANCE_TEAM_SHARED.allocations) {
      expect(allocation.allocationMethod).toBe("shared_cost");
      expect(allocation.allocationBasis).toBe("programme_expenditure");
      expect(allocation.confidence).toBe(0.75);
      expect(allocation.allocationNote).toMatch(/programme expenditure/);
    }
  });

  it("holds back a share as genuinely organisational when asked", () => {
    const result = allocateSharedCost({
      organisationId: ORG,
      label: "Chief Executive",
      amount: gbp(90_000),
      basis: "staff_time",
      effectiveDate: "2026-03-31",
      idPrefix: "alloc-ceo",
      unallocatedShare: 0.4,
      targets: [
        { label: "Youth Futures", programmeId: "prog:youth-futures", weight: 3 },
        { label: "Community Health", programmeId: "prog:community-health", weight: 2 },
      ],
    });
    expect(toMajor(result.unallocated)).toBe(36_000);
    expect(sumMoney([...result.shares.map((s) => s.amount), result.unallocated], CURRENCY)).toEqual(
      gbp(90_000),
    );
  });

  it("never produces a verified allocation on its own, whatever the confidence", () => {
    const direct = allocateDirect({
      id: "a1",
      organisationId: ORG,
      programmeId: "prog:youth-futures",
      amount: gbp(1_000),
      effectiveDate: "2026-04-01",
    });
    expect(direct.confidence).toBe(1);
    expect(direct.verificationState).toBe("needs_review");

    const verified = verifyAllocation(direct, "user-1", "2026-08-17T10:00:00.000Z");
    expect(verified.verificationState).toBe("verified");
    expect(verified.verifiedBy).toBe("user-1");
  });

  it("records a human revision as provided and manual, not verified", () => {
    const direct = allocateDirect({
      id: "a2",
      organisationId: ORG,
      programmeId: "prog:youth-futures",
      amount: gbp(1_000),
      effectiveDate: "2026-04-01",
    });
    const revised = reviseAllocation(direct, { amount: gbp(800) }, "user-1", "2026-08-17T10:00:00.000Z");
    expect(revised.verificationState).toBe("provided");
    expect(revised.allocationMethod).toBe("manual");
    expect(toMajor(revised.amount)).toBe(800);
  });

  it("suggests only where a rule decides, and stays unallocated otherwise", () => {
    const base: FinancialTransaction = {
      id: "txn-1",
      organisationId: ORG,
      date: "2026-05-04",
      description: "Venue hire",
      amount: gbp(1_200),
      direction: "expenditure",
      restricted: true,
      source: "bank_feed",
      verificationState: "provided",
    };

    const single = suggestAllocation({
      transaction: { ...base, grantId: "grant-yf-core" },
      programmesByGrant: { "grant-yf-core": ["prog:youth-futures"] },
      idPrefix: "s1",
    });
    expect(single.method).toBe("direct");
    expect(single.allocation?.programmeId).toBe("prog:youth-futures");

    const multi = suggestAllocation({
      transaction: { ...base, grantId: "grant-multi" },
      programmesByGrant: { "grant-multi": ["prog:youth-futures", "prog:skills-lab"] },
      idPrefix: "s2",
    });
    expect(multi.allocation).toBeUndefined();
    expect(multi.reason).toMatch(/several programmes/);

    const named = suggestAllocation({
      transaction: { ...base, description: "Youth Futures mentoring venue" },
      programmes: [{ id: "prog:youth-futures", name: "Youth Futures" }],
      idPrefix: "s3",
    });
    expect(named.method).toBe("suggested");
    expect(named.allocation?.confidence).toBe(0.5);
    expect(named.allocation?.verificationState).toBe("needs_review");

    const unknown = suggestAllocation({
      transaction: base,
      programmes: [{ id: "prog:youth-futures", name: "Youth Futures" }],
      idPrefix: "s4",
    });
    expect(unknown.method).toBe("unknown");
    expect(unknown.allocation).toBeUndefined();
  });

  it("catches allocations that exceed or under-cover their transaction", () => {
    const txn: FinancialTransaction = {
      id: "txn-2",
      organisationId: ORG,
      date: "2026-05-04",
      description: "Staff costs",
      amount: gbp(1_000),
      direction: "expenditure",
      restricted: false,
      source: "accounting_system",
      verificationState: "provided",
    };
    const over = allocateDirect({
      id: "a3",
      organisationId: ORG,
      programmeId: "prog:youth-futures",
      amount: gbp(1_200),
      effectiveDate: "2026-05-04",
    });
    expect(validateAllocations(txn, [over]).map((i) => i.code)).toContain("over_allocated");

    const untargeted = { ...over, amount: gbp(1_000), programmeId: undefined };
    expect(validateAllocations(txn, [untargeted]).map((i) => i.code)).toContain("no_target");
  });
});

describe("cost hierarchy (§3)", () => {
  it("rolls activity and workstream costs up into the programme", () => {
    expect(toMajor(youthFuturesCost)).toBe(420_000);
    expect(toMajor(costOf(rollup, "act:mentoring"))).toBe(42_000);
    expect(toMajor(costOf(rollup, "ws:employability"))).toBe(352_000);
  });

  it("rolls programmes up into the strategic priority and the organisation", () => {
    expect(toMajor(costOf(rollup, "sp:youth-economic-opportunity"))).toBe(420_000 + 16_560);
    expect(toMajor(costOf(rollup, "org:northstar"))).toBe(461_760);
  });

  it("separates apportioned cost from direct cost at every level", () => {
    const programme = rollup.byId["prog:youth-futures"];
    expect(toMajor(programme?.apportionedCost ?? gbp(0))).toBe(30_240);
    expect(programme?.methods).toContain("shared_cost");
    expect(programme?.methods).toContain("direct");
  });

  it("reports unallocated expenditure rather than assuming full coverage", () => {
    expect(toMajor(rollup.unallocated)).toBe(38_240);
    expect(rollup.coverage.level).toBe("high");
    expect(rollup.coverage.reasons.join(" ")).toMatch(/92% of period expenditure is allocated/);
  });

  it("counts allocations outside the hierarchy separately instead of dropping them", () => {
    const stray = allocateDirect({
      id: "a-stray",
      organisationId: ORG,
      programmeId: "prog:not-in-tree",
      amount: gbp(5_000),
      effectiveDate: "2026-06-01",
    });
    const withStray = rollUpCosts({
      period: PERIOD_2026,
      currency: CURRENCY,
      nodes: COST_NODES,
      allocations: [...ALL_ALLOCATIONS_2026, stray],
      totalExpenditure: TOTAL_EXPENDITURE_2026,
    });
    expect(toMajor(withStray.offHierarchy)).toBe(5_000);
    expect(toMajor(costOf(withStray, "org:northstar"))).toBe(461_760);
  });

  it("excludes allocations outside the period", () => {
    const nextYear = allocateDirect({
      id: "a-next",
      organisationId: ORG,
      programmeId: "prog:youth-futures",
      amount: gbp(9_999),
      effectiveDate: "2027-02-01",
    });
    const filtered = rollUpCosts({
      period: PERIOD_2026,
      currency: CURRENCY,
      nodes: COST_NODES,
      allocations: [...ALL_ALLOCATIONS_2026, nextYear],
    });
    expect(toMajor(costOf(filtered, "prog:youth-futures"))).toBe(420_000);
  });

  it("orders a breakdown by size", () => {
    const children = breakdownOf(rollup, "org:northstar").map((n) => n.node.id);
    expect(children[0]).toBe("sp:youth-economic-opportunity");
  });
});

describe("unit economics (§3, §4, §7)", () => {
  const metrics = economics2026.economics;
  const byKey = (key: string) => metrics.find((m) => m.key === key);

  it("reproduces the brief's unit costs", () => {
    expect(formatMoney(byKey("cost_per_participant")?.value ?? gbp(0))).toBe("£350");
    expect(formatMoney(byKey("cost_per_completion")?.value ?? gbp(0))).toBe("£427");
    expect(formatMoney(byKey("cost_per_outcome")?.value ?? gbp(0))).toBe("£890");
  });

  it("cannot produce a figure without disclosing its method", () => {
    for (const metric of metrics) {
      const m = metric.methodology;
      expect(toMajor(m.numerator.amount)).toBe(420_000);
      expect(m.denominator.count).toBeGreaterThan(0);
      expect(m.period.key).toBe("2026");
      expect(m.allocationMethods).toEqual(["direct", "shared_cost"]);
      expect(m.includedCosts.length).toBeGreaterThan(0);
      expect(m.excludedCosts).toContain("Fundraising costs");
      expect(m.financialDataQuality.level).toBe("high");
      expect(m.deliveryDataQuality.level).toBeTruthy();
      expect(m.assumptions).toContain("Shared costs apportioned on prior-year programme expenditure.");
      expect(m.boundaries.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes outputs from outcomes in the denominator (§4)", () => {
    expect(byKey("cost_per_participant")?.methodology.denominator.kind).toBe("participant");
    expect(byKey("cost_per_completion")?.methodology.denominator.kind).toBe("completion");
    expect(byKey("cost_per_outcome")?.methodology.denominator.kind).toBe("outcome");
  });

  it("withholds cost per outcome where outcome data is thin (§7)", () => {
    const thin = computeUnitEconomics({
      programmeId: "prog:community-health",
      period: PERIOD_2026,
      cost: gbp(210_000),
      measures: COMMUNITY_HEALTH_DELIVERY_2026,
      allocationMethods: ["shared_cost"],
      includedCosts: ["Delivery staff"],
      excludedCosts: [],
      financialDataQuality: rollup.coverage,
    });

    const outcome = thin.find((m) => m.key === "cost_per_outcome");
    expect(outcome?.state).toBe("withheld");
    expect(outcome?.value).toBeUndefined();
    expect(outcome?.withheld?.reason).toMatch(/withheld/);
    expect(outcome?.withheld?.requires.length).toBeGreaterThan(0);

    // The participant figure is still published — withholding is per metric.
    expect(thin.find((m) => m.key === "cost_per_participant")?.state).toBe("available");
  });

  it("withholds where the denominator is zero rather than dividing", () => {
    const [metric] = computeUnitEconomics({
      period: PERIOD_2026,
      cost: gbp(50_000),
      measures: [
        {
          organisationId: ORG,
          programmeId: "prog:skills-lab",
          key: "participants",
          label: "Participants",
          kind: "participant",
          value: 0,
          period: PERIOD_2026,
          completeness: 1,
          verificationState: "verified",
        },
      ],
      allocationMethods: ["direct"],
      includedCosts: [],
      excludedCosts: [],
      financialDataQuality: rollup.coverage,
    });
    expect(metric?.state).toBe("withheld");
    expect(metric?.withheld?.reason).toMatch(/No participants recorded/);
  });

  it("never labels a unit cost as a return or a valuation (§4)", () => {
    for (const metric of metrics) {
      expect(metric.label).not.toMatch(FORBIDDEN_METRIC_LANGUAGE);
      expect(metric.metricKind).toBe("unit_cost");
    }
    const outcome = byKey("cost_per_outcome");
    expect(outcome?.methodology.boundaries.join(" ")).toMatch(/not a social return on investment/);
  });

  it("refuses SROI and says what it would require (§4)", () => {
    const sroi = socialReturnOnInvestment();
    expect(sroi.supported).toBe(false);
    expect(sroi.reason).toMatch(/does not calculate social return on investment/);
    expect(sroi.requires).toEqual(
      expect.arrayContaining([expect.stringMatching(/deadweight/i)]),
    );
  });

  it("assembles the programme economics view (§7)", () => {
    expect(toMajor(economics2026.financial.actual)).toBe(420_000);
    expect(toMajor(economics2026.financial.variance ?? gbp(0))).toBe(-30_000);
    expect(economics2026.financial.variancePercent).toBeCloseTo(-6.7, 1);
    expect(toMajor(economics2026.funding.total)).toBe(420_000);
    expect(economics2026.dataQuality.financialAllocation.level).toBe("high");
    expect(economics2026.dataQuality.delivery.level).toBe("high");
    expect(economics2026.dataQuality.outcomes.level).toBe("moderate");
  });
});

describe("restricted programme subsidy (§6)", () => {
  const positions = [
    computeSubsidy({
      programmeId: "prog:youth-futures",
      period: PERIOD_2024,
      programmeCost: YOUTH_FUTURES_COST_2024,
      restrictedFunding: YOUTH_FUTURES_RESTRICTED_2024,
      financialDataQuality: rollup.coverage,
    }),
    computeSubsidy({
      programmeId: "prog:youth-futures",
      period: PERIOD_2025,
      programmeCost: YOUTH_FUTURES_COST_2025,
      restrictedFunding: YOUTH_FUTURES_RESTRICTED_2025,
      financialDataQuality: rollup.coverage,
    }),
    computeSubsidy({
      programmeId: "prog:youth-futures",
      period: PERIOD_2026,
      programmeCost: gbp(420_000),
      restrictedFunding: YOUTH_FUTURES_RESTRICTED_2026,
      financialDataQuality: rollup.coverage,
    }),
  ];

  it("computes the unrestricted contribution and its share", () => {
    const current = positions[2];
    expect(toMajor(current?.unrestrictedContribution ?? gbp(0))).toBe(50_000);
    expect(current?.subsidyPercent).toBe(11.9);
    expect(current?.overFunded).toBe(false);
  });

  it("detects a persistent pattern across three years and quotes a rounded range", () => {
    const structural = detectStructuralSubsidy("prog:youth-futures", positions);
    expect(structural.detected).toBe(true);
    expect(toMajor(structural.rangeLow ?? gbp(0))).toBe(40_000);
    expect(toMajor(structural.rangeHigh ?? gbp(0))).toBe(55_000);
    expect(describeStructuralSubsidy(structural, "Youth Futures")).toBe(
      "Youth Futures has required approximately £40k–£55k of unrestricted organisational funding in each of the last 3 periods.",
    );
  });

  it("refuses to claim a pattern from too little history (§6)", () => {
    const twoYears = detectStructuralSubsidy("prog:youth-futures", positions.slice(0, 2));
    expect(twoYears.detected).toBe(false);
    expect(twoYears.reason).toMatch(/3 are required/);
    expect(describeStructuralSubsidy(twoYears, "Youth Futures")).toBeNull();
  });

  it("refuses where the data behind a period is weak", () => {
    const weak = positions.map((p, i) =>
      i === 0 ? { ...p, dataQuality: { level: "low" as const, score: 0.4, reasons: ["Partial ledger."] } } : p,
    );
    const structural = detectStructuralSubsidy("prog:youth-futures", weak);
    expect(structural.detected).toBe(false);
    expect(structural.reason).toMatch(/below moderate/);
  });

  it("reports over-funding rather than a negative subsidy", () => {
    const over = computeSubsidy({
      programmeId: "prog:skills-lab",
      period: PERIOD_2026,
      programmeCost: gbp(100_000),
      restrictedFunding: gbp(120_000),
      financialDataQuality: rollup.coverage,
    });
    expect(over.overFunded).toBe(true);
    expect(toMajor(over.unrestrictedContribution)).toBe(-20_000);
  });
});

describe("comparative economics and trends (§8, §9)", () => {
  it("compares like with like across periods", () => {
    const trend = compareProgrammeEconomics(economics2025, economics2026);
    const completion = trend.comparisons.find((c) => c.metric === "cost_per_completion");
    expect(formatMoney(completion?.baseline ?? gbp(0))).toBe("£510");
    expect(formatMoney(completion?.current ?? gbp(0))).toBe("£427");
    expect(Math.round(completion?.changePercent ?? 0)).toBe(-16);
    expect(completion?.direction).toBe("decrease");
  });

  it("refuses to compare when a period withheld the figure", () => {
    const withheldPeriod = buildProgrammeEconomics({
      programmeId: "prog:youth-futures",
      programmeName: "Youth Futures",
      period: PERIOD_2025,
      cost: YOUTH_FUTURES_COST_2025,
      measures: YOUTH_FUTURES_DELIVERY_2025.map((m) =>
        m.kind === "outcome" ? { ...m, completeness: 0.2 } : m,
      ),
      allocationMethods: ["direct"],
      includedCosts: [],
      excludedCosts: [],
      financialDataQuality: rollup.coverage,
      restrictedFunding: YOUTH_FUTURES_RESTRICTED_2025,
      unrestrictedFunding: gbp(55_000),
    });
    const trend = compareProgrammeEconomics(withheldPeriod, economics2026);
    const outcome = trend.notComparable.find((c) => c.metric === "cost_per_outcome");
    expect(outcome?.comparable).toBe(false);
    expect(outcome?.reason).toMatch(/withheld/);
  });

  it("flags a methodology change as a caveat rather than reporting a clean movement", () => {
    const differentMethod = economics2025.economics.find((m) => m.key === "cost_per_participant");
    const current = economics2026.economics.find((m) => m.key === "cost_per_participant");
    const comparison = compareUnitCost(
      {
        ...(differentMethod as NonNullable<typeof differentMethod>),
        methodology: {
          ...(differentMethod as NonNullable<typeof differentMethod>).methodology,
          allocationMethods: ["direct"],
        },
      },
      current as NonNullable<typeof current>,
    );
    expect(comparison.comparable).toBe(true);
    expect(comparison.caveats.join(" ")).toMatch(/methodological rather than operational/);
  });

  it("refuses to compare periods of materially different length", () => {
    const quarter = buildProgrammeEconomics({
      programmeId: "prog:youth-futures",
      programmeName: "Youth Futures",
      period: { key: "2025-Q1", label: "Q1 2025", start: "2025-01-01", end: "2025-03-31" },
      cost: gbp(100_000),
      measures: [{ ...(YOUTH_FUTURES_DELIVERY_2025[0] as NonNullable<(typeof YOUTH_FUTURES_DELIVERY_2025)[0]>), value: 250 }],
      allocationMethods: ["direct"],
      includedCosts: [],
      excludedCosts: [],
      financialDataQuality: rollup.coverage,
      restrictedFunding: gbp(90_000),
      unrestrictedFunding: gbp(10_000),
    });
    const trend = compareProgrammeEconomics(quarter, economics2026);
    expect(trend.notComparable[0]?.reason).toMatch(/differ in length/);
  });

  it("observes divergence between spend and reach without concluding inefficiency (§9)", () => {
    const before = miniEconomics(PERIOD_2025, 100_000, 1_000);
    const after = miniEconomics(PERIOD_2026, 121_000, 1_040);
    const trend = compareProgrammeEconomics(before, after);

    const divergence = trend.observations.find((o) => o.key === "divergence:spend-vs-reach");
    expect(divergence?.text).toBe(
      "Programme expenditure increased 21%, but participant reach increased 4%.",
    );
    expect(divergence?.kind).toBe("observation");
    expect(divergence?.possibleFactors.length).toBeGreaterThan(2);
    expect(divergence?.caveats.join(" ")).toMatch(/not a demonstrated cause/);

    for (const observation of trend.observations) {
      expect(observation.text).not.toMatch(/inefficien|wasteful|poor value/i);
    }
  });
});

function miniEconomics(period: typeof PERIOD_2025, cost: number, participants: number) {
  return buildProgrammeEconomics({
    programmeId: "prog:youth-futures",
    programmeName: "Youth Futures",
    period,
    cost: gbp(cost),
    measures: [
      {
        organisationId: ORG,
        programmeId: "prog:youth-futures",
        key: "participants",
        label: "Participants",
        kind: "participant",
        value: participants,
        period,
        completeness: 0.95,
        verificationState: "verified",
      },
    ],
    allocationMethods: ["direct"],
    includedCosts: ["Delivery staff"],
    excludedCosts: [],
    financialDataQuality: rollup.coverage,
    restrictedFunding: gbp(cost),
    unrestrictedFunding: gbp(0),
  });
}
