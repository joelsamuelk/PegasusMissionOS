import { describe, expect, it } from "vitest";
import { detectFundingCliffs } from "@/lib/finance-intelligence/cliffs";
import {
  compareConcentration,
  computeConcentration,
  projectConcentration,
} from "@/lib/finance-intelligence/concentration";
import { buildFundingNeedForecast, forecastByDimension } from "@/lib/finance-intelligence/forecast";
import {
  approveFundingNeed,
  assessStrategicFunding,
  deriveFundingNeed,
} from "@/lib/finance-intelligence/funding-need";
import { formatMoney, toMajor } from "@/lib/finance-intelligence/money";
import {
  MATCH_CAVEAT,
  assessNeedMatch,
  summariseNeedMatches,
} from "@/lib/finance-intelligence/need-matching";
import { SCENARIO_DISCLAIMER, buildPortfolioScenario } from "@/lib/finance-intelligence/portfolio";
import {
  assessFundingPosition,
  buildLookingAhead,
  generateFinanceRecommendations,
  summariseFinancialSecurity,
} from "@/lib/finance-intelligence/recommendations";
import { computeProgrammeRunway, computeUnrestrictedRunway } from "@/lib/finance-intelligence/runway";
import {
  flattenTrace,
  traceStatement,
  tracedReferences,
} from "@/lib/finance-intelligence/statements";
import type { FundingAssumption } from "@/lib/finance-intelligence/types";
import {
  CURRENCY,
  EXAMPLE_FOUNDATION_OPPORTUNITY,
  EXPIRING_GRANTS,
  FIXED_NOW,
  FUNDER_INCOME_2026,
  ORG,
  gbp,
} from "../fixtures/finance-fixture";

const ASSUMPTIONS: FundingAssumption[] = [
  {
    id: "assume-continuation",
    kind: "continuation",
    label: "Youth Futures continues at its current scale",
    basis: "stated_plan",
    materiality: "high",
  },
  {
    id: "assume-inflation",
    kind: "inflation",
    label: "Delivery costs rise 3% a year",
    value: "3%",
    basis: "estimate",
    materiality: "medium",
  },
];

/** §14. £420k requirement, £110k confirmed, from 1 April 2027. */
const youthFuturesNeed = deriveFundingNeed({
  id: "need-yf-2027",
  organisationId: ORG,
  programmeId: "prog:youth-futures",
  strategicPriorityId: "sp:youth-economic-opportunity",
  title: "Youth Futures continuation funding",
  expectedCost: gbp(420_000),
  confirmedFunding: gbp(110_000),
  needFrom: "2027-04-01",
  needUntil: "2028-03-31",
  fundingType: "programme",
  costBasis: "historical_actual",
  derivedFrom: [
    { type: "programme", id: "prog:youth-futures", label: "Youth Futures" },
    { type: "grant", id: "grant-yf-core", label: "Youth Futures core grant" },
  ],
  assumptions: ASSUMPTIONS,
  now: FIXED_NOW,
});

const programmeRunway = computeProgrammeRunway({
  programmeId: "prog:youth-futures",
  programmeName: "Youth Futures",
  annualOperatingCost: gbp(420_000),
  fundedUntil: "2027-03-31",
  confirmedFundingAfter: gbp(110_000),
  now: FIXED_NOW,
});

const unrestrictedRunway = computeUnrestrictedRunway({
  organisationId: ORG,
  unrestrictedReserves: gbp(102_000),
  monthlyUnrestrictedBurn: gbp(30_000),
  now: FIXED_NOW,
});

const cliffs = detectFundingCliffs({
  expiring: EXPIRING_GRANTS,
  continuity: { "prog:youth-futures": "expected", "prog:community-health": "expected" },
  replacementSecured: { "prog:youth-futures": gbp(60_000) },
  currency: CURRENCY,
  now: FIXED_NOW,
});

describe("funding need (§12, §13)", () => {
  it("derives the gap from expected cost, confirmed funding and committed unrestricted money", () => {
    expect(toMajor(youthFuturesNeed.amountRequired)).toBe(420_000);
    expect(toMajor(youthFuturesNeed.amountSecured)).toBe(110_000);
    expect(toMajor(youthFuturesNeed.fundingGap)).toBe(310_000);
  });

  it("counts a committed unrestricted contribution toward secured funding", () => {
    const withContribution = deriveFundingNeed({
      id: "need-yf-alt",
      organisationId: ORG,
      title: "Youth Futures continuation funding",
      expectedCost: gbp(420_000),
      confirmedFunding: gbp(110_000),
      committedUnrestricted: gbp(50_000),
      needFrom: "2027-04-01",
      fundingType: "programme",
      costBasis: "budget",
      derivedFrom: [],
      now: FIXED_NOW,
    });
    expect(toMajor(withContribution.fundingGap)).toBe(260_000);
  });

  it("never produces an approved requirement on its own (§12)", () => {
    expect(youthFuturesNeed.origin).toBe("calculated");
    expect(youthFuturesNeed.verificationState).toBe("needs_review");
    expect(youthFuturesNeed.confidence.limitations).toContain(
      "This is a calculated funding requirement, not an approved one.",
    );

    const approved = approveFundingNeed(youthFuturesNeed, "user-ceo", "2026-08-20T09:00:00.000Z");
    expect(approved.verificationState).toBe("verified");
    expect(approved.approvedBy).toBe("user-ceo");
  });

  it("carries its derivation and assumptions", () => {
    expect(youthFuturesNeed.derivedFrom.map((r) => r.type)).toEqual(["programme", "grant"]);
    expect(youthFuturesNeed.assumptions).toHaveLength(2);
    expect(youthFuturesNeed.confidence.limitations.join(" ")).toMatch(/high-materiality assumption/);
  });

  it("scores a gap that is large and near as higher priority than one that is small and distant", () => {
    expect(youthFuturesNeed.priority).toBe("critical");

    const distantSmall = deriveFundingNeed({
      id: "need-distant",
      organisationId: ORG,
      title: "Equipment refresh",
      expectedCost: gbp(400_000),
      confirmedFunding: gbp(380_000),
      needFrom: "2029-01-01",
      fundingType: "capital",
      costBasis: "forecast",
      derivedFrom: [],
      now: FIXED_NOW,
    });
    expect(distantSmall.priority).toBe("low");
    expect(distantSmall.confidence.level).toBe("low");
  });

  it("clamps an over-funded programme to a zero gap rather than a negative one", () => {
    const overFunded = deriveFundingNeed({
      id: "need-over",
      organisationId: ORG,
      title: "Fully funded programme",
      expectedCost: gbp(100_000),
      confirmedFunding: gbp(120_000),
      needFrom: "2027-04-01",
      fundingType: "programme",
      costBasis: "budget",
      derivedFrom: [],
      now: FIXED_NOW,
    });
    expect(toMajor(overFunded.fundingGap)).toBe(0);
    expect(overFunded.priority).toBe("low");
  });
});

describe("programme funding runway (§14)", () => {
  it("reproduces the brief's runway", () => {
    expect(programmeRunway.runwayMonths).toBe(7);
    expect(toMajor(programmeRunway.potentialGap)).toBe(310_000);
    expect(toMajor(programmeRunway.monthlyOperatingCost)).toBe(35_000);
    expect(programmeRunway.state).toBe("warning");
  });

  it("labels the gap as a forecast, not a fact", () => {
    const gap = programmeRunway.statements.find((s) => s.id.endsWith(":gap"));
    expect(gap?.kind).toBe("forecast");
    expect(gap?.caveats).toContain("Assumes the programme continues at its current scale and cost.");
    const fundedUntil = programmeRunway.statements.find((s) => s.id.endsWith(":funded-until"));
    expect(fundedUntil?.kind).toBe("fact");
  });

  it("computes unrestricted runway to one decimal place (§21)", () => {
    expect(unrestrictedRunway.runwayMonths).toBe(3.4);
    expect(unrestrictedRunway.state).toBe("warning");
  });

  it("reports no burn as unbounded rather than dividing by zero", () => {
    const flat = computeUnrestrictedRunway({
      organisationId: ORG,
      unrestrictedReserves: gbp(102_000),
      monthlyUnrestrictedBurn: gbp(0),
      now: FIXED_NOW,
    });
    expect(flat.runwayMonths).toBe(Number.POSITIVE_INFINITY);
    expect(flat.state).toBe("secure");
  });
});

describe("grant expiry intelligence (§15)", () => {
  it("finds the cliff and nets off secured replacement funding", () => {
    const youthFutures = cliffs.find((c) => c.programmeId === "prog:youth-futures");
    expect(toMajor(youthFutures?.expiringAmount ?? gbp(0))).toBe(270_000);
    expect(youthFutures?.expiryDate).toBe("2027-03-31");
    expect(toMajor(youthFutures?.replacementSecured ?? gbp(0))).toBe(60_000);
    expect(toMajor(youthFutures?.potentialGap ?? gbp(0))).toBe(210_000);
    expect(youthFutures?.severity).toBe("high");
  });

  it("only looks as far ahead as the horizon", () => {
    expect(cliffs.map((c) => c.programmeId)).toEqual(["prog:youth-futures"]);
    const wider = detectFundingCliffs({
      expiring: EXPIRING_GRANTS,
      currency: CURRENCY,
      horizonMonths: 36,
      now: FIXED_NOW,
    });
    expect(wider).toHaveLength(2);
  });

  it("asserts no gap where continuity has not been recorded", () => {
    const unknown = detectFundingCliffs({
      expiring: EXPIRING_GRANTS,
      currency: CURRENCY,
      now: FIXED_NOW,
    });
    const statements = unknown[0]?.statements ?? [];
    expect(statements.some((s) => s.kind === "forecast")).toBe(false);
    expect(statements.at(-1)?.text).toMatch(/has not been recorded/);
  });

  it("groups grants expiring in the same quarter into one cliff", () => {
    const grouped = detectFundingCliffs({
      expiring: [
        ...EXPIRING_GRANTS,
        {
          grantId: "grant-yf-topup",
          grantTitle: "Youth Futures top-up",
          programmeId: "prog:youth-futures",
          programmeName: "Youth Futures",
          annualAmount: gbp(30_000),
          endDate: "2027-02-28",
          restricted: true,
        },
      ],
      continuity: { "prog:youth-futures": "expected" },
      currency: CURRENCY,
      now: FIXED_NOW,
    });
    expect(grouped).toHaveLength(1);
    expect(toMajor(grouped[0]?.expiringAmount ?? gbp(0))).toBe(300_000);
    expect(grouped[0]?.expiryDate).toBe("2027-02-28");
  });
});

describe("funding need forecast (§16)", () => {
  const forecast = buildFundingNeedForecast({
    now: FIXED_NOW,
    horizonMonths: 18,
    currency: CURRENCY,
    requirements: [
      {
        id: "req-yf",
        label: "Youth Futures delivery",
        amount: gbp(420_000),
        from: "2026-10-01",
        until: "2027-09-30",
        programmeId: "prog:youth-futures",
      },
    ],
    income: [
      {
        id: "inc-core",
        label: "Youth Futures core grant",
        amount: gbp(270_000),
        from: "2026-10-01",
        until: "2027-03-31",
        certainty: "confirmed",
        funderId: "funder-example-foundation",
        programmeId: "prog:youth-futures",
      },
      {
        id: "inc-pipeline",
        label: "Pipeline application",
        amount: gbp(90_000),
        from: "2027-04-01",
        until: "2027-09-30",
        certainty: "expected",
        programmeId: "prog:youth-futures",
      },
      {
        id: "inc-scenario",
        label: "Corporate partnership target",
        amount: gbp(50_000),
        from: "2027-04-01",
        until: "2027-09-30",
        certainty: "scenario",
        programmeId: "prog:youth-futures",
      },
    ],
  });

  it("spreads costs and income across quarters without losing a penny", () => {
    const totalRequirement = forecast.buckets.reduce((sum, b) => sum + b.requirement.minorUnits, 0);
    expect(totalRequirement).toBe(gbp(420_000).minorUnits);
  });

  it("counts only confirmed income as secured", () => {
    expect(toMajor(forecast.totals.byCertainty.confirmed)).toBe(270_000);
    expect(toMajor(forecast.totals.byCertainty.expected)).toBe(90_000);
    expect(toMajor(forecast.totals.byCertainty.scenario)).toBe(50_000);
    expect(forecast.totals.secured).toEqual(forecast.totals.byCertainty.confirmed);
  });

  it("measures the gap against confirmed income and offers the optimistic read separately", () => {
    const q2 = forecast.buckets.find((b) => b.period.key === "2027-Q2");
    expect(q2).toBeDefined();
    expect(q2?.gap.minorUnits).toBeGreaterThan(q2?.gapAfterExpected.minorUnits ?? 0);
    expect(forecast.firstGapPeriod?.key).toBe("2027-Q2");
  });

  it("clamps the horizon to the 12–36 month range and says so", () => {
    const short = buildFundingNeedForecast({
      now: FIXED_NOW,
      horizonMonths: 3,
      currency: CURRENCY,
      requirements: [],
      income: [],
    });
    expect(short.horizonMonths).toBe(12);
    expect(short.assumptions).toContain("Horizon extended to the 12-month minimum.");

    const long = buildFundingNeedForecast({
      now: FIXED_NOW,
      horizonMonths: 60,
      currency: CURRENCY,
      requirements: [],
      income: [],
    });
    expect(long.horizonMonths).toBe(36);
  });

  it("drops the part of a cost that falls beyond the horizon rather than compressing it", () => {
    const spilling = buildFundingNeedForecast({
      now: new Date("2026-10-01T00:00:00.000Z"),
      horizonMonths: 12,
      currency: CURRENCY,
      requirements: [
        {
          id: "req-long",
          label: "Two-year programme",
          amount: gbp(200_000),
          from: "2026-10-01",
          until: "2028-09-30",
        },
      ],
      income: [],
    });
    // 365 of the span's 731 days fall inside the horizon, so 365/731 of the
    // cost lands in the buckets and the remainder is dropped, not compressed.
    const total = spilling.buckets.reduce((sum, b) => sum + b.requirement.minorUnits, 0);
    expect(toMajor({ minorUnits: total, currency: CURRENCY })).toBeCloseTo(99_863.2, 1);
  });

  it("splits by programme, strategic priority or funding type", () => {
    const byProgramme = forecastByDimension(
      {
        now: FIXED_NOW,
        horizonMonths: 18,
        currency: CURRENCY,
        requirements: [
          { id: "r1", label: "A", amount: gbp(100_000), from: "2026-10-01", until: "2027-03-31", programmeId: "p1" },
          { id: "r2", label: "B", amount: gbp(60_000), from: "2026-10-01", until: "2027-03-31", programmeId: "p2" },
        ],
        income: [],
      },
      "programme",
    );
    expect(Object.keys(byProgramme).sort()).toEqual(["p1", "p2"]);
    expect(toMajor(byProgramme.p1?.totals.requirement ?? gbp(0))).toBe(100_000);
  });
});

describe("funding concentration (§20)", () => {
  const current = computeConcentration(FUNDER_INCOME_2026, CURRENCY);

  it("measures the current position", () => {
    expect(current.largest?.sharePercent).toBe(31);
    expect(current.level).toBe("moderate");
    expect(toMajor(current.total)).toBe(800_000);
  });

  it("projects what a prospective award would do to dependence", () => {
    const projection = projectConcentration(current, {
      funderId: "funder-example-foundation",
      funderName: "Example Foundation",
      amount: gbp(250_000),
    });
    expect(projection.beforePercent).toBe(31);
    expect(Math.round(projection.afterPercent)).toBe(47);
    expect(projection.warning).toMatch(/from 31% to approximately 47/);
    expect(projection.levelChanged).toBe(true);
  });

  it("stays quiet where an award would not move dependence materially", () => {
    const projection = projectConcentration(current, {
      funderId: "funder-new",
      funderName: "New Trust",
      amount: gbp(20_000),
    });
    expect(projection.warning).toBeUndefined();
  });

  it("describes movement between periods", () => {
    const previous = computeConcentration(
      FUNDER_INCOME_2026.map((f) =>
        f.funderId === "funder-example-foundation" ? { ...f, amount: gbp(150_000) } : f,
      ),
      CURRENCY,
    );
    const movement = compareConcentration(previous, current);
    expect(movement.direction).toBe("increase");
    expect(movement.text).toMatch(/concentration has increased/);
  });
});

describe("need-aware opportunity matching (§17, §18)", () => {
  const match = assessNeedMatch({
    need: youthFuturesNeed,
    opportunity: EXAMPLE_FOUNDATION_OPPORTUNITY,
    fit: {
      overallScore: 82,
      category: "strong_match",
      eligibilityStatus: "met",
      factors: [
        {
          key: "eligibility",
          label: "Eligibility",
          status: "met",
          score: 100,
          weight: 3,
          rationale: "Organisation appears eligible.",
          evidenceUsed: [],
          assumptions: [],
        },
        {
          key: "strategic",
          label: "Strategic alignment",
          status: "met",
          score: 90,
          weight: 2.5,
          rationale: "Shared priorities: youth employment.",
          evidenceUsed: [],
          assumptions: [],
        },
      ],
    },
    now: FIXED_NOW,
  });

  it("reports gap coverage as a potential range (§18)", () => {
    expect(match.gapCoverage?.maxPercent).toBe(81);
    expect(match.gapCoverage?.minPercent).toBe(32);
    expect(match.gapCoverage?.basis).toMatch(/£310,000 gap/);
  });

  it("never implies an opportunity closes the gap", () => {
    expect(match.caveat).toBe(MATCH_CAVEAT);
    expect(match.caveat).toMatch(/only once an award is secured/);
    const amountFactor = match.needFactors.find((f) => f.key === "need_amount");
    expect(amountFactor?.rationale).toMatch(/potentially cover up to/);
    expect(amountFactor?.assumptions.join(" ")).toMatch(/most awards land below the maximum/);
  });

  it("checks timing against the funding need, not just the deadline", () => {
    const timing = match.needFactors.find((f) => f.key === "need_timing");
    expect(timing?.status).toBe("met");
    expect(match.strength).toBe("strong_match");

    const lateDeadline = assessNeedMatch({
      need: youthFuturesNeed,
      opportunity: { ...EXAMPLE_FOUNDATION_OPPORTUNITY, deadline: "2027-06-30" },
      now: FIXED_NOW,
    });
    expect(lateDeadline.needFactors.find((f) => f.key === "need_timing")?.status).toBe("unmet");
    expect(lateDeadline.watchItems.join(" ")).toMatch(/needed before this deadline/);
  });

  it("rejects a funding type that cannot meet the need", () => {
    const capitalOnly = assessNeedMatch({
      need: youthFuturesNeed,
      opportunity: { ...EXAMPLE_FOUNDATION_OPPORTUNITY, fundingType: "capital" },
      now: FIXED_NOW,
    });
    expect(capitalOnly.needFactors.find((f) => f.key === "need_funding_type")?.status).toBe("unmet");
  });

  it("defers to the existing eligibility assessment", () => {
    const ineligible = assessNeedMatch({
      need: youthFuturesNeed,
      opportunity: EXAMPLE_FOUNDATION_OPPORTUNITY,
      fit: { overallScore: 40, category: "not_eligible", eligibilityStatus: "unmet", factors: [] },
      now: FIXED_NOW,
    });
    expect(ineligible.strength).toBe("not_eligible");
  });

  it("summarises a set of matches without adding them into a secured figure", () => {
    const summary = summariseNeedMatches("need-yf-2027", [match, match, match], {
      [EXAMPLE_FOUNDATION_OPPORTUNITY.id]: EXAMPLE_FOUNDATION_OPPORTUNITY.deadline,
    });
    expect(summary.total).toBe(3);
    expect(summary.strong).toBe(3);
    expect(summary.earliestDeadline).toBe("2026-09-28");
    expect(summary.bestCaseCoveragePercent).toBe(100);
    expect(summary.caveat).toBe(MATCH_CAVEAT);
  });
});

describe("funding portfolio construction (§19)", () => {
  const scenario = buildPortfolioScenario({
    need: youthFuturesNeed,
    concentration: computeConcentration(FUNDER_INCOME_2026, CURRENCY),
    components: [
      {
        id: "c1",
        label: "Core Foundation Grant",
        kind: "trust_or_foundation",
        amount: gbp(150_000),
        isSecured: false,
        funderId: "funder-example-foundation",
        funderName: "Example Foundation",
        likelihood: "medium",
      },
      { id: "c2", label: "Local Authority Contract", kind: "statutory_contract", amount: gbp(80_000), isSecured: false },
      { id: "c3", label: "Corporate Partnership", kind: "corporate_partnership", amount: gbp(50_000), isSecured: false },
      {
        id: "c4",
        label: "Unrestricted Contribution",
        kind: "unrestricted_contribution",
        amount: gbp(30_000),
        isSecured: false,
      },
    ],
  });

  it("reaches the gap and is labelled a scenario throughout", () => {
    expect(toMajor(scenario.total)).toBe(310_000);
    expect(toMajor(scenario.residual)).toBe(0);
    expect(scenario.coveragePercent).toBe(100);
    expect(scenario.status).toBe("proposed_scenario");
    expect(scenario.disclaimer).toBe(SCENARIO_DISCLAIMER);
  });

  it("keeps secured and proposed money apart (§19)", () => {
    expect(toMajor(scenario.securedTotal)).toBe(0);
    expect(toMajor(scenario.proposedTotal)).toBe(310_000);
  });

  it("warns where the scenario would deepen dependence on the largest funder (§20)", () => {
    expect(scenario.warnings.join(" ")).toMatch(/Example Foundation from 31%/);
  });

  it("warns where the scenario does not reach the gap", () => {
    const partial = buildPortfolioScenario({
      need: youthFuturesNeed,
      components: [
        { id: "c1", label: "Small grant", kind: "trust_or_foundation", amount: gbp(40_000), isSecured: false },
      ],
    });
    expect(toMajor(partial.residual)).toBe(270_000);
    expect(partial.warnings.join(" ")).toMatch(/£270,000 of the gap is not covered/);
  });
});

describe("strategic funding alignment (§22)", () => {
  it("shows which parts of the strategy are funded", () => {
    const summary = assessStrategicFunding(
      [
        {
          strategicPriorityId: "sp:youth-economic-opportunity",
          label: "Youth Economic Opportunity",
          plannedInvestment: gbp(1_200_000),
          securedFunding: gbp(740_000),
        },
        {
          strategicPriorityId: "sp:community-wellbeing",
          label: "Community Wellbeing",
          plannedInvestment: gbp(400_000),
          securedFunding: gbp(390_000),
        },
      ],
      { currency: CURRENCY },
    );

    const youth = summary.positions[0];
    expect(toMajor(youth?.potentialNeed ?? gbp(0))).toBe(460_000);
    expect(youth?.state).toBe("partially_funded");
    expect(summary.positions[1]?.state).toBe("funded");
    expect(toMajor(summary.totalNeed)).toBe(470_000);
    expect(summary.mostUnderfunded[0]?.strategicPriorityId).toBe("sp:youth-economic-opportunity");
  });

  it("flags overcommitment only where reserves cannot cover the plan", () => {
    const summary = assessStrategicFunding(
      [
        {
          strategicPriorityId: "sp:youth-economic-opportunity",
          label: "Youth Economic Opportunity",
          plannedInvestment: gbp(1_200_000),
          securedFunding: gbp(740_000),
        },
      ],
      { currency: CURRENCY, unallocatedUnrestricted: gbp(100_000) },
    );
    expect(toMajor(summary.overcommitment?.amount ?? gbp(0))).toBe(360_000);
  });
});

describe("finance recommendations (§21, §23, §24)", () => {
  const signals = {
    organisationId: ORG,
    currency: CURRENCY,
    now: FIXED_NOW,
    unrestrictedRunway,
    programmeRunways: [programmeRunway],
    cliffs,
    needs: [youthFuturesNeed],
    concentration: computeConcentration(FUNDER_INCOME_2026, CURRENCY),
    grantSpend: [
      {
        grantId: "grant-yf-core",
        title: "Youth Futures core grant",
        awardValue: gbp(270_000),
        projectedSpend: gbp(228_000),
        endDate: "2027-03-31",
      },
    ],
  };

  it("separates the restricted and unrestricted positions (§21)", () => {
    const strongProgrammes = assessFundingPosition({
      ...signals,
      programmeRunways: [{ ...programmeRunway, potentialGap: gbp(0), state: "secure", runwayMonths: 30 }],
    });
    expect(strongProgrammes.restricted.state).toBe("strong");
    expect(strongProgrammes.unrestricted.state).toBe("needs_attention");
    expect(strongProgrammes.coreConstrained).toBe(true);
    expect(strongProgrammes.headline).toMatch(/unrestricted operating position needs attention/);
  });

  it("recommends core funding with its reasoning attached (§21, §24)", () => {
    const recommendations = generateFinanceRecommendations({
      ...signals,
      programmeRunways: [{ ...programmeRunway, potentialGap: gbp(0), state: "secure", runwayMonths: 30 }],
    });
    const core = recommendations.find((r) => r.key === "core-funding-priority");
    expect(core?.recommendation.text).toMatch(/Prioritise core and unrestricted funding/);
    expect(core?.recommendation.kind).toBe("recommendation");
    expect(core?.priority).toBe("high");

    const kinds = new Set(core?.reasoning.map((s) => s.kind));
    expect(kinds.has("fact")).toBe(true);
    expect(kinds.has("calculation")).toBe(true);
    expect(kinds.has("assumption")).toBe(true);
  });

  it("distinguishes fact, calculation, forecast, assumption and recommendation (§24)", () => {
    const recommendations = generateFinanceRecommendations(signals);
    const all = recommendations.flatMap((r) => [...r.reasoning, r.recommendation]);
    const kinds = new Set(all.map((s) => s.kind));
    expect(kinds).toEqual(new Set(["fact", "calculation", "forecast", "recommendation"]));
    for (const rec of recommendations) {
      expect(rec.recommendation.kind).toBe("recommendation");
      expect(rec.reasoning.every((s) => s.kind !== "recommendation")).toBe(true);
    }
  });

  it("surfaces replacement funding, underspend and concentration", () => {
    const keys = generateFinanceRecommendations(signals).map((r) => r.key);
    expect(keys).toContain("replacement-funding:prog:youth-futures");
    expect(keys).toContain("grant-underspend:grant-yf-core");
    expect(keys).not.toContain("funding-concentration"); // moderate and not rising
  });

  it("orders the most urgent recommendation first", () => {
    const recommendations = generateFinanceRecommendations(signals);
    expect(recommendations[0]?.priority).toBe("high");
  });

  it("builds the Mission Control looking-ahead surface (§23)", () => {
    const summary = summariseNeedMatches("need-yf-2027", [], {});
    const items = buildLookingAhead([youthFuturesNeed], { "need-yf-2027": summary });
    expect(items).toHaveLength(1);
    expect(toMajor(items[0]?.gap ?? gbp(0))).toBe(310_000);
    expect(items[0]?.from).toBe("2027-04-01");
    expect(items[0]?.caveat).toBe(MATCH_CAVEAT);
  });

  it("answers the executive question and stays drillable (§25)", () => {
    const forecast = buildFundingNeedForecast({
      now: FIXED_NOW,
      horizonMonths: 18,
      currency: CURRENCY,
      requirements: [
        { id: "req", label: "Delivery", amount: gbp(600_000), from: "2026-10-01", until: "2027-09-30" },
      ],
      income: [
        { id: "inc", label: "Confirmed grants", amount: gbp(400_000), from: "2026-10-01", until: "2027-03-31", certainty: "confirmed" },
      ],
    });

    const summary = summariseFinancialSecurity(signals, forecast);
    expect(summary.headline.kind).toBe("forecast");
    expect(summary.headline.text).toMatch(/Confirmed income covers/);
    expect(summary.concerns.join(" ")).toMatch(/funding cliff/);

    // The drill-down §25 asks for: headline → calculation → facts → records.
    const trace = traceStatement(summary.headline, summary.index);
    const flat = flattenTrace(trace);
    expect(flat.length).toBeGreaterThan(3);
    expect(flat.some((n) => n.statement.kind === "fact")).toBe(true);
    expect(flat.some((n) => n.statement.id.startsWith("cliff:"))).toBe(true);

    const references = tracedReferences(summary.headline, summary.index);
    expect(references.map((r) => r.type)).toEqual(
      expect.arrayContaining(["organisation", "grant"]),
    );
  });
});

describe("the closed loop (§26)", () => {
  it("carries a funding gap from grant expiry through to a matched opportunity", () => {
    const cliff = cliffs.find((c) => c.programmeId === "prog:youth-futures");
    expect(toMajor(cliff?.potentialGap ?? gbp(0))).toBe(210_000);

    const need = deriveFundingNeed({
      id: "need-from-cliff",
      organisationId: ORG,
      programmeId: "prog:youth-futures",
      title: "Youth Futures replacement funding",
      expectedCost: gbp(420_000),
      confirmedFunding: gbp(110_000),
      needFrom: cliff?.expiryDate ?? "2027-03-31",
      fundingType: "programme",
      costBasis: "historical_actual",
      derivedFrom: (cliff?.grants ?? []).map((g) => ({ type: "grant" as const, id: g.grantId })),
      now: FIXED_NOW,
    });
    expect(toMajor(need.fundingGap)).toBe(310_000);

    const match = assessNeedMatch({
      need,
      opportunity: EXAMPLE_FOUNDATION_OPPORTUNITY,
      now: FIXED_NOW,
    });
    expect(match.gapCoverage?.maxPercent).toBe(81);

    const scenario = buildPortfolioScenario({
      need,
      components: [
        {
          id: "c1",
          label: "Example Foundation",
          kind: "trust_or_foundation",
          amount: gbp(250_000),
          isSecured: false,
          opportunityId: EXAMPLE_FOUNDATION_OPPORTUNITY.id,
        },
      ],
    });
    expect(scenario.status).toBe("proposed_scenario");
    expect(toMajor(scenario.securedTotal)).toBe(0);
    expect(formatMoney(scenario.residual)).toBe("£60,000");
  });
});
