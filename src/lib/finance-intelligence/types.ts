import type {
  EntityReference as DomainEntityReference,
  EntityType as DomainEntityType,
  ISODate,
  UUID,
  VerificationState,
} from "@/types/domain";

/**
 * Finance Intelligence domain model.
 *
 * Two rules shape everything in this file.
 *
 * 1. **Money is never a float.** Every amount is an integer number of minor
 *    units with an explicit currency. Cost-per-outcome arithmetic divides and
 *    apportions constantly; accumulated float drift would show up as figures
 *    that do not reconcile to the accounts.
 *
 * 2. **Nothing is calculated straight from a transaction.** Transactions reach
 *    programmes through an explicit `FinancialAllocation` that records *how*
 *    the money was attributed. A cost-per-participant figure is only as
 *    defensible as the allocation beneath it, so the allocation is a
 *    first-class, reviewable record rather than a join.
 */

// --- Money ---------------------------------------------------------------

/** ISO 4217. Currency is data, not a constant (target architecture §10). */
export type CurrencyCode = string;

export interface Money {
  /** Integer minor units (pence, cents). Never fractional. */
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
}

// --- References and periods ---------------------------------------------

/**
 * The entity kinds finance statements can point at.
 *
 * This anticipated the shared Mission Graph reference and has now collapsed
 * into it, as intended: `EntityType` in `types/domain.ts` absorbed the finance
 * kinds, so a finance statement and a knowledge claim point at entities the
 * same way and can be traced through one another.
 *
 * `opportunity` is the one rename — the shared model calls it
 * `funding_opportunity`, which is the name the rest of the product uses.
 */
export type FinanceEntityType = Extract<
  DomainEntityType,
  | "organisation"
  | "transaction"
  | "allocation"
  | "budget"
  | "budget_line"
  | "grant"
  | "grant_payment"
  | "funder"
  | "funding_opportunity"
  | "application"
  | "programme"
  | "workstream"
  | "activity"
  | "output"
  | "outcome"
  | "indicator"
  | "strategic_priority"
  | "funding_need"
  | "assumption"
  | "statement"
  | "evidence"
  | "period"
>;

/** The shared Mission Graph reference, re-exported under the finance name. */
export type EntityReference = DomainEntityReference;

export interface Period {
  /** Stable key, e.g. "2026" or "2026-Q4". */
  key: string;
  label: string;
  start: ISODate;
  /** Inclusive end date. */
  end: ISODate;
}

// --- Data quality --------------------------------------------------------

export type DataQualityLevel = "high" | "moderate" | "low" | "insufficient";

/**
 * Completeness of the data behind a figure.
 *
 * Deliberately separate from `confidence` on an allocation: an allocation can
 * be 100% certain (a direct, invoiced cost) while the programme's outcome data
 * for the same period is 40% complete. Both must be visible.
 */
export interface DataQuality {
  level: DataQualityLevel;
  /** 0..1 proportion of the expected data that is present and current. */
  score: number;
  reasons: string[];
}

// --- Transactions --------------------------------------------------------

export type TransactionDirection = "income" | "expenditure";

export type TransactionSource =
  | "bank_feed"
  | "accounting_system"
  | "manual"
  | "import";

export interface FinancialTransaction {
  id: UUID;
  organisationId: UUID;
  accountId?: UUID;
  date: ISODate;
  description: string;
  amount: Money;
  direction: TransactionDirection;
  /** Chart-of-accounts or expenditure category, as classified. */
  category?: string;
  counterparty?: string;
  /** Whether the money carries a funder restriction. */
  restricted: boolean;
  /** Set only where the transaction is unambiguously attributable. */
  grantId?: UUID;
  source: TransactionSource;
  verificationState: VerificationState;
}

// --- Allocation ----------------------------------------------------------

/**
 * How the attribution was made. Distinct from `AllocationBasis`, which says
 * *what the apportionment was driven by*.
 */
export type AllocationMethod =
  | "direct"
  | "proportional"
  | "shared_cost"
  | "manual"
  | "suggested"
  | "unknown";

/** The driver behind a proportional or shared-cost apportionment (§5). */
export type AllocationBasis =
  | "direct"
  | "headcount"
  | "programme_expenditure"
  | "staff_time"
  | "participant_volume"
  | "equal"
  | "custom_percentage"
  | "unallocated";

/**
 * The layer between money and delivery.
 *
 * An allocation always records its method, its basis and its confidence, so
 * that a figure built on eight estimated apportionments can never be presented
 * with the same authority as one built on eight invoices.
 */
export interface FinancialAllocation {
  id: UUID;
  organisationId: UUID;

  transactionId?: UUID;
  budgetLineId?: UUID;
  programmeId?: UUID;
  grantId?: UUID;
  activityId?: UUID;
  workstreamId?: UUID;
  outcomeId?: UUID;
  strategicPriorityId?: UUID;

  amount: Money;

  allocationMethod: AllocationMethod;
  allocationBasis?: AllocationBasis;
  /** Free-text explanation shown next to the figure, e.g. "42% of programme expenditure". */
  allocationNote?: string;

  /** 0..1 — how well the method fits this cost. Never a truth claim. */
  confidence?: number;

  /** Whether the money was restricted at source. */
  restricted?: boolean;

  /** Date the allocation applies to; drives period roll-ups. */
  effectiveDate: ISODate;

  verificationState: VerificationState;

  createdBy?: UUID;
  verifiedBy?: UUID;
  verifiedAt?: ISODate;
}

// --- Cost hierarchy ------------------------------------------------------

/** §3. Ordered from the widest to the narrowest. */
export type CostLevel =
  | "organisation"
  | "strategic_priority"
  | "programme"
  | "workstream"
  | "activity"
  | "output"
  | "outcome";

export interface CostNode {
  id: string;
  level: CostLevel;
  label: string;
  parentId?: string;
}

export interface CostRollupNode {
  node: CostNode;
  /** Cost allocated to this node alone. */
  directCost: Money;
  /** Of `directCost`, the part apportioned rather than directly attributed. */
  apportionedCost: Money;
  /** `directCost` plus every descendant. */
  totalCost: Money;
  /** Allocation methods that contributed, most-used first. */
  methods: AllocationMethod[];
  /** Weighted-mean allocation confidence across contributing allocations. */
  allocationConfidence: number;
  allocationCount: number;
  childIds: string[];
}

export interface CostRollup {
  period: Period;
  currency: CurrencyCode;
  nodes: CostRollupNode[];
  byId: Record<string, CostRollupNode>;
  /** Expenditure in the period with no allocation at all. */
  unallocated: Money;
  /** Allocated, but to a target that is not in this hierarchy. */
  offHierarchy: Money;
  /** Total expenditure considered, allocated or not. */
  totalExpenditure: Money;
  /** Share of expenditure that reached the hierarchy. */
  coverage: DataQuality;
}

// --- Delivery measures ---------------------------------------------------

/**
 * §4 exists because of this type. Outputs and outcomes are different kinds of
 * thing, and the denominator of a unit-cost calculation must say which it is.
 */
export type DeliveryMeasureKind = "participant" | "output" | "completion" | "outcome";

export interface DeliveryMeasure {
  id?: UUID;
  organisationId: UUID;
  programmeId: UUID;
  /** Stable key, e.g. "participants", "employment_outcomes". */
  key: string;
  label: string;
  kind: DeliveryMeasureKind;
  value: number;
  period: Period;
  /** 0..1 — proportion of delivery for which this measure was captured. */
  completeness: number;
  verificationState: VerificationState;
  source?: string;
}

// --- Unit economics ------------------------------------------------------

export type UnitCostKey =
  | "cost_per_participant"
  | "cost_per_completion"
  | "cost_per_output"
  | "cost_per_outcome";

/**
 * Everything §3 requires a calculation to disclose. A `UnitCost` cannot be
 * constructed without it, which is the point.
 */
export interface Methodology {
  numerator: { label: string; amount: Money };
  denominator: { label: string; count: number; kind: DeliveryMeasureKind };
  period: Period;
  allocationMethods: AllocationMethod[];
  includedCosts: string[];
  excludedCosts: string[];
  financialDataQuality: DataQuality;
  deliveryDataQuality: DataQuality;
  assumptions: string[];
  /**
   * What this figure is not. Populated for every unit cost, because
   * "cost per outcome" is routinely misread as a social return (§4).
   */
  boundaries: string[];
}

export interface UnitCost {
  key: UnitCostKey;
  label: string;
  programmeId?: UUID;
  /** A unit cost is an allocated cost divided by a count. It is not a valuation. */
  metricKind: "unit_cost";
  state: "available" | "withheld";
  /** Present only when `state` is "available". */
  value?: Money;
  methodology: Methodology;
  /** Present only when `state` is "withheld". */
  withheld?: { reason: string; requires: string[] };
}

// --- Subsidy -------------------------------------------------------------

export interface SubsidyPosition {
  programmeId: UUID;
  period: Period;
  programmeCost: Money;
  restrictedFunding: Money;
  /** Programme cost not met by restricted funding. Can be negative (over-funded). */
  unrestrictedContribution: Money;
  /** Unrestricted contribution as a share of programme cost, 0..100. */
  subsidyPercent: number;
  overFunded: boolean;
  dataQuality: DataQuality;
}

export interface StructuralSubsidy {
  programmeId: UUID;
  periods: SubsidyPosition[];
  /** Only set where enough consistent history exists (§6). */
  detected: boolean;
  rangeLow?: Money;
  rangeHigh?: Money;
  medianPercent?: number;
  reason: string;
}

// --- Funding need --------------------------------------------------------

export type FundingNeedType =
  | "core"
  | "project"
  | "programme"
  | "capital"
  | "capacity"
  | "research"
  | "emergency"
  | "other";

export type FundingNeedPriority = "low" | "medium" | "high" | "critical";

export type FundingNeedOrigin = "manual" | "calculated" | "suggested";

export interface FundingNeedConfidence {
  level: "high" | "medium" | "low";
  /** 0..1. */
  score: number;
  /** Why the figure can be relied on. */
  basis: string[];
  /** What weakens it. Never empty for a calculated need. */
  limitations: string[];
}

export type AssumptionKind =
  | "cost"
  | "income"
  | "inflation"
  | "continuation"
  | "timing"
  | "staffing"
  | "overhead"
  | "scenario";

export interface FundingAssumption {
  id: string;
  kind: AssumptionKind;
  label: string;
  value?: string;
  basis: "historical" | "budget" | "stated_plan" | "estimate" | "default";
  materiality: "low" | "medium" | "high";
}

export interface FundingNeed {
  id: UUID;
  organisationId: UUID;

  programmeId?: UUID;
  strategicPriorityId?: UUID;

  title: string;
  description?: string;

  amountRequired: Money;
  amountSecured: Money;
  fundingGap: Money;

  needFrom: ISODate;
  needUntil?: ISODate;

  fundingType: FundingNeedType;
  priority: FundingNeedPriority;

  confidence: FundingNeedConfidence;

  derivedFrom: EntityReference[];
  assumptions: FundingAssumption[];

  /** How the need came to exist. A calculated need is never `verified` (§12). */
  origin: FundingNeedOrigin;
  verificationState: VerificationState;

  createdBy?: UUID;
  approvedBy?: UUID;
  approvedAt?: ISODate;
}

// --- Forecast tiers ------------------------------------------------------

/**
 * §16. A pound that has been awarded and a pound that a scenario assumes are
 * not the same pound, and no view may add them together silently.
 */
export type FundingCertainty = "confirmed" | "expected" | "forecast" | "scenario";

export const FUNDING_CERTAINTY_LABELS: Record<FundingCertainty, string> = {
  confirmed: "Confirmed",
  expected: "Expected",
  forecast: "Forecast",
  scenario: "Scenario",
};
