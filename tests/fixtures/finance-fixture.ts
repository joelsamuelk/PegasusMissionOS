import type { FundingOpportunity } from "@/types/domain";
import { allocateDirect, allocateSharedCost } from "@/lib/finance-intelligence/allocate";
import { fromMajor } from "@/lib/finance-intelligence/money";
import { calendarYearPeriod } from "@/lib/finance-intelligence/period";
import type {
  CostNode,
  DeliveryMeasure,
  FinancialAllocation,
  Period,
} from "@/lib/finance-intelligence/types";

/**
 * The worked example from the Finance Intelligence brief, as fixture data.
 *
 * Every headline figure in the brief is reproduced here so the test suite
 * asserts against the specification rather than against whatever the code
 * happens to produce: £420k of allocated cost, 1,200 participants, 984
 * completions, 472 employment outcomes, £350 / £427 / £890 unit costs, a
 * 42/35/23 shared-cost split, an 11.9% unrestricted subsidy, a 7-month
 * funding runway and a £310k gap.
 */

export const ORG = "org-northstar";
export const CURRENCY = "GBP";

/** Fixed clock. Chosen so the §14 runway to 31 March 2027 is 7 months. */
export const FIXED_NOW = new Date("2026-08-17T09:00:00.000Z");

export const PERIOD_2026: Period = calendarYearPeriod(2026);
export const PERIOD_2025: Period = calendarYearPeriod(2025);
export const PERIOD_2024: Period = calendarYearPeriod(2024);

export const gbp = (major: number) => fromMajor(major, CURRENCY);

// --- Cost hierarchy ------------------------------------------------------

export const COST_NODES: CostNode[] = [
  { id: "org:northstar", level: "organisation", label: "Northstar Community Foundation" },
  {
    id: "sp:youth-economic-opportunity",
    level: "strategic_priority",
    label: "Youth Economic Opportunity",
    parentId: "org:northstar",
  },
  {
    id: "sp:community-wellbeing",
    level: "strategic_priority",
    label: "Community Wellbeing",
    parentId: "org:northstar",
  },
  {
    id: "prog:youth-futures",
    level: "programme",
    label: "Youth Futures",
    parentId: "sp:youth-economic-opportunity",
  },
  {
    id: "prog:skills-lab",
    level: "programme",
    label: "Skills Lab",
    parentId: "sp:youth-economic-opportunity",
  },
  {
    id: "prog:community-health",
    level: "programme",
    label: "Community Health",
    parentId: "sp:community-wellbeing",
  },
  {
    id: "ws:employability",
    level: "workstream",
    label: "Employability support",
    parentId: "prog:youth-futures",
  },
  {
    id: "act:mentoring",
    level: "activity",
    label: "One-to-one mentoring",
    parentId: "ws:employability",
  },
];

// --- Allocations ---------------------------------------------------------

/**
 * Youth Futures direct costs, £389,760. With the £30,240 share of the finance
 * team below, the programme totals exactly £420,000.
 */
export const YOUTH_FUTURES_DIRECT: FinancialAllocation[] = [
  allocateDirect({
    id: "alloc-yf-staff",
    organisationId: ORG,
    transactionId: "txn-yf-staff",
    workstreamId: "ws:employability",
    programmeId: "prog:youth-futures",
    amount: gbp(310_000),
    effectiveDate: "2026-06-30",
    restricted: true,
    note: "Delivery staff payroll, invoiced to the programme.",
  }),
  allocateDirect({
    id: "alloc-yf-venue",
    organisationId: ORG,
    transactionId: "txn-yf-venue",
    activityId: "act:mentoring",
    programmeId: "prog:youth-futures",
    amount: gbp(42_000),
    effectiveDate: "2026-07-15",
    restricted: true,
    note: "Venue hire for mentoring sessions.",
  }),
  allocateDirect({
    id: "alloc-yf-participants",
    organisationId: ORG,
    transactionId: "txn-yf-participants",
    programmeId: "prog:youth-futures",
    amount: gbp(28_760),
    effectiveDate: "2026-05-01",
    restricted: true,
    note: "Participant travel and equipment.",
  }),
  allocateDirect({
    id: "alloc-yf-evaluation",
    organisationId: ORG,
    transactionId: "txn-yf-evaluation",
    programmeId: "prog:youth-futures",
    amount: gbp(9_000),
    effectiveDate: "2026-09-30",
    restricted: true,
    note: "External evaluation.",
  }),
];

/**
 * §5's worked example. The driver is **prior-year** programme expenditure
 * (Youth Futures £420k, Community Health £350k, Skills Lab £230k), which
 * apportions 42/35/23 and avoids the circularity of apportioning this year's
 * shared costs on this year's expenditure.
 */
export const FINANCE_TEAM_SHARED = allocateSharedCost({
  organisationId: ORG,
  label: "Finance Team",
  amount: gbp(72_000),
  basis: "programme_expenditure",
  effectiveDate: "2026-03-31",
  idPrefix: "alloc-finance",
  targets: [
    { label: "Youth Futures", programmeId: "prog:youth-futures", weight: 420_000 },
    { label: "Community Health", programmeId: "prog:community-health", weight: 350_000 },
    { label: "Skills Lab", programmeId: "prog:skills-lab", weight: 230_000 },
  ],
});

export const ALL_ALLOCATIONS_2026: FinancialAllocation[] = [
  ...YOUTH_FUTURES_DIRECT,
  ...FINANCE_TEAM_SHARED.allocations,
];

/** Total organisational expenditure in 2026, of which some is unallocated. */
export const TOTAL_EXPENDITURE_2026 = gbp(500_000);

// --- Delivery ------------------------------------------------------------

const measure = (
  key: string,
  label: string,
  kind: DeliveryMeasure["kind"],
  value: number,
  completeness: number,
  period: Period,
  verification: DeliveryMeasure["verificationState"] = "provided",
): DeliveryMeasure => ({
  organisationId: ORG,
  programmeId: "prog:youth-futures",
  key,
  label,
  kind,
  value,
  period,
  completeness,
  verificationState: verification,
  source: "Programme attendance and outcome records",
});

export const YOUTH_FUTURES_DELIVERY_2026: DeliveryMeasure[] = [
  measure("participants", "Participants", "participant", 1_200, 0.97, PERIOD_2026, "verified"),
  measure("completions", "Programme completions", "completion", 984, 0.95, PERIOD_2026, "verified"),
  measure("employment", "Recorded employment outcomes", "outcome", 472, 0.72, PERIOD_2026),
];

/** 2025: £408,000 across 800 completions — £510 per completion, per §8. */
export const YOUTH_FUTURES_DELIVERY_2025: DeliveryMeasure[] = [
  measure("participants", "Participants", "participant", 1_020, 0.96, PERIOD_2025, "verified"),
  measure("completions", "Programme completions", "completion", 800, 0.95, PERIOD_2025, "verified"),
  measure("employment", "Recorded employment outcomes", "outcome", 360, 0.68, PERIOD_2025),
];

export const YOUTH_FUTURES_COST_2025 = gbp(408_000);

/** Community Health records outcomes poorly — used to prove §7's withholding. */
export const COMMUNITY_HEALTH_DELIVERY_2026: DeliveryMeasure[] = [
  {
    organisationId: ORG,
    programmeId: "prog:community-health",
    key: "participants",
    label: "Participants",
    kind: "participant",
    value: 640,
    period: PERIOD_2026,
    completeness: 0.9,
    verificationState: "verified",
  },
  {
    organisationId: ORG,
    programmeId: "prog:community-health",
    key: "health_outcomes",
    label: "Recorded health outcomes",
    kind: "outcome",
    value: 88,
    period: PERIOD_2026,
    completeness: 0.35,
    verificationState: "needs_review",
  },
];

// --- Funding -------------------------------------------------------------

export const YOUTH_FUTURES_RESTRICTED_2026 = gbp(370_000);
export const YOUTH_FUTURES_RESTRICTED_2025 = gbp(353_000);
export const YOUTH_FUTURES_RESTRICTED_2024 = gbp(360_000);
export const YOUTH_FUTURES_COST_2024 = gbp(400_000);

/** §15. £270k expires on 31 March 2027; £60k of replacement is secured. */
export const EXPIRING_GRANTS = [
  {
    grantId: "grant-yf-core",
    grantTitle: "Youth Futures core grant",
    funderId: "funder-example-foundation",
    funderName: "Example Foundation",
    programmeId: "prog:youth-futures",
    programmeName: "Youth Futures",
    annualAmount: gbp(270_000),
    endDate: "2027-03-31",
    restricted: true,
  },
  {
    grantId: "grant-ch-wellbeing",
    grantTitle: "Community Health wellbeing grant",
    funderId: "funder-city-council",
    funderName: "City Council",
    programmeId: "prog:community-health",
    programmeName: "Community Health",
    annualAmount: gbp(95_000),
    endDate: "2028-09-30",
    restricted: true,
  },
];

/** §20. Largest funder at 31% of £800,000. */
export const FUNDER_INCOME_2026 = [
  { funderId: "funder-example-foundation", funderName: "Example Foundation", amount: gbp(248_000) },
  { funderId: "funder-city-council", funderName: "City Council", amount: gbp(190_000) },
  { funderId: "funder-lottery", funderName: "National Lottery", amount: gbp(150_000) },
  { funderId: "funder-corporate", funderName: "Corporate Partner", amount: gbp(120_000) },
  { funderId: "funder-individuals", funderName: "Individual giving", amount: gbp(92_000) },
];

/** §18. Award range £100k–£250k against a £310k gap: up to 81% coverage. */
export const EXAMPLE_FOUNDATION_OPPORTUNITY: FundingOpportunity = {
  id: "opp-example-foundation",
  organisationId: ORG,
  funderId: "funder-example-foundation",
  programmeName: "Youth Employment Fund",
  description: "Multi-year programme funding for youth employment initiatives in the UK.",
  minAward: 100_000,
  maxAward: 250_000,
  currency: CURRENCY,
  deadline: "2026-09-28",
  fundingDurationMonths: 36,
  fundingType: "project",
  eligibleOrgTypes: ["charity"],
  eligibleLocations: ["UK"],
  priorityThemes: ["youth employment", "skills"],
  requiredDocuments: ["Accounts", "Safeguarding policy"],
  reportingRequirements: ["Annual report"],
  stage: "discovered",
  probability: 0,
  saved: false,
  isDemo: true,
  notes: "Requires partnership delivery.",
  audit: { createdAt: "2026-08-01T09:00:00.000Z", updatedAt: "2026-08-01T09:00:00.000Z" },
};
