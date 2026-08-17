import type { ISODate, UUID } from "@/types/domain";
import { parseISO } from "date-fns";
import { addMoney, floorAtZero, percentOf, subtractMoney, sumMoney, zero } from "./money";
import { wholeMonthsBetween } from "./period";
import type {
  EntityReference,
  FundingAssumption,
  FundingNeed,
  FundingNeedConfidence,
  FundingNeedOrigin,
  FundingNeedPriority,
  FundingNeedType,
  Money,
} from "./types";

/**
 * Funding need (§12, §13).
 *
 *   expected cost − confirmed funding − committed unrestricted contribution
 *     = potential funding gap
 *
 * The arithmetic is the easy part. What makes a `FundingNeed` trustworthy is
 * that it carries where it came from, what had to be assumed, and the fact
 * that nobody has approved it yet. A forecast never becomes an approved
 * funding requirement by itself (§12) — `approveFundingNeed` is the only
 * route, and it needs a person.
 */

/** How the expected cost was arrived at. Drives confidence. */
export type CostBasis = "historical_actual" | "budget" | "forecast" | "estimate";

const COST_BASIS_CONFIDENCE: Record<CostBasis, number> = {
  historical_actual: 0.85,
  budget: 0.75,
  forecast: 0.55,
  estimate: 0.4,
};

const COST_BASIS_LABELS: Record<CostBasis, string> = {
  historical_actual: "prior-year actual costs",
  budget: "the approved budget",
  forecast: "a forward forecast",
  estimate: "an estimate",
};

export interface FundingNeedDerivationInput {
  id: UUID;
  organisationId: UUID;
  programmeId?: UUID;
  strategicPriorityId?: UUID;

  title: string;
  description?: string;

  /** What delivery is expected to cost over the need period. */
  expectedCost: Money;
  /** Awarded or contracted income applying to the period. */
  confirmedFunding: Money;
  /**
   * Unrestricted money the organisation has decided to put in. Committed, not
   * hoped for — anything softer belongs in a scenario.
   */
  committedUnrestricted?: Money;

  needFrom: ISODate;
  needUntil?: ISODate;

  fundingType: FundingNeedType;
  costBasis: CostBasis;

  derivedFrom: EntityReference[];
  assumptions?: FundingAssumption[];

  origin?: Extract<FundingNeedOrigin, "calculated" | "suggested">;
  now: Date;
  createdBy?: UUID;
}

export function deriveFundingNeed(input: FundingNeedDerivationInput): FundingNeed {
  const currency = input.expectedCost.currency;
  const committed = input.committedUnrestricted ?? zero(currency);
  const secured = addMoney(input.confirmedFunding, committed);
  const gap = floorAtZero(subtractMoney(input.expectedCost, secured));
  const assumptions = input.assumptions ?? [];
  const origin = input.origin ?? "calculated";

  const monthsUntil = wholeMonthsBetween(input.now, parseISO(input.needFrom));
  const confidence = scoreConfidence(input, assumptions, monthsUntil);

  return {
    id: input.id,
    organisationId: input.organisationId,
    ...(input.programmeId ? { programmeId: input.programmeId } : {}),
    ...(input.strategicPriorityId ? { strategicPriorityId: input.strategicPriorityId } : {}),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    amountRequired: input.expectedCost,
    amountSecured: secured,
    fundingGap: gap,
    needFrom: input.needFrom,
    ...(input.needUntil ? { needUntil: input.needUntil } : {}),
    fundingType: input.fundingType,
    priority: derivePriority(gap, input.expectedCost, monthsUntil),
    confidence,
    derivedFrom: input.derivedFrom,
    assumptions,
    origin,
    // §12: a derived need is never `verified`. Only a person approves it.
    verificationState: "needs_review",
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  };
}

/** A need entered by a person. `provided`, because the figure is theirs. */
export function createManualFundingNeed(
  input: Omit<FundingNeedDerivationInput, "costBasis" | "origin"> & { costBasis?: CostBasis },
): FundingNeed {
  const derived = deriveFundingNeed({ ...input, costBasis: input.costBasis ?? "estimate" });
  return {
    ...derived,
    origin: "manual",
    verificationState: "provided",
    confidence: {
      ...derived.confidence,
      basis: ["Entered by a person."],
      limitations: derived.confidence.limitations,
    },
  };
}

/**
 * §12. Approving a need is a deliberate act with an actor and a timestamp.
 * There is no path from "Pegasus calculated this" to "the organisation has
 * agreed this" that does not pass through here.
 */
export function approveFundingNeed(need: FundingNeed, approvedBy: UUID, approvedAt: ISODate): FundingNeed {
  return { ...need, verificationState: "verified", approvedBy, approvedAt };
}

export function reviseFundingNeed(
  need: FundingNeed,
  revision: { amountRequired?: Money; amountSecured?: Money; needFrom?: ISODate; needUntil?: ISODate },
): FundingNeed {
  const amountRequired = revision.amountRequired ?? need.amountRequired;
  const amountSecured = revision.amountSecured ?? need.amountSecured;
  return {
    ...need,
    amountRequired,
    amountSecured,
    fundingGap: floorAtZero(subtractMoney(amountRequired, amountSecured)),
    ...(revision.needFrom ? { needFrom: revision.needFrom } : {}),
    ...(revision.needUntil ? { needUntil: revision.needUntil } : {}),
    origin: "manual",
    verificationState: "provided",
  };
}

function derivePriority(gap: Money, required: Money, monthsUntil: number): FundingNeedPriority {
  if (gap.minorUnits <= 0) return "low";
  const share = (percentOf(gap, required) ?? 0) / 100;
  if (share >= 0.5 && monthsUntil <= 9) return "critical";
  if (share >= 0.5 || (share >= 0.3 && monthsUntil <= 12)) return "high";
  if (share >= 0.1 || monthsUntil <= 6) return "medium";
  return "low";
}

function scoreConfidence(
  input: FundingNeedDerivationInput,
  assumptions: FundingAssumption[],
  monthsUntil: number,
): FundingNeedConfidence {
  const basis: string[] = [
    `Expected cost is based on ${COST_BASIS_LABELS[input.costBasis]}.`,
    `Confirmed funding is drawn from ${input.derivedFrom.filter((r) => r.type === "grant").length} grant record(s).`,
  ];
  const limitations: string[] = [];

  let score = COST_BASIS_CONFIDENCE[input.costBasis];

  const highMateriality = assumptions.filter((a) => a.materiality === "high");
  if (highMateriality.length > 0) {
    score -= Math.min(0.2, highMateriality.length * 0.05);
    limitations.push(
      `${highMateriality.length} high-materiality assumption(s): ${highMateriality.map((a) => a.label).join("; ")}.`,
    );
  }

  if (monthsUntil > 30) {
    score -= 0.2;
    limitations.push(`The need begins ${monthsUntil} months out; delivery plans may change materially.`);
  } else if (monthsUntil > 18) {
    score -= 0.1;
    limitations.push(`The need begins ${monthsUntil} months out.`);
  }

  if (input.derivedFrom.length === 0) {
    score -= 0.15;
    limitations.push("No source records are linked to this need.");
  }

  // §12: a calculated need always states what weakens it.
  limitations.push("This is a calculated funding requirement, not an approved one.");

  const clamped = Math.min(1, Math.max(0, score));
  return {
    level: clamped >= 0.75 ? "high" : clamped >= 0.5 ? "medium" : "low",
    score: Math.round(clamped * 100) / 100,
    basis,
    limitations,
  };
}

// --- Strategic alignment (§22) ------------------------------------------

export type StrategicFundingState =
  | "funded"
  | "partially_funded"
  | "underfunded"
  | "unfunded";

export interface StrategicFundingInput {
  strategicPriorityId: UUID;
  label: string;
  plannedInvestment: Money;
  securedFunding: Money;
}

export interface StrategicFundingPosition extends StrategicFundingInput {
  potentialNeed: Money;
  coveragePercent: number;
  state: StrategicFundingState;
}

export interface StrategicFundingSummary {
  positions: StrategicFundingPosition[];
  totalPlanned: Money;
  totalSecured: Money;
  totalNeed: Money;
  /** Priorities with the largest unfunded amounts first. */
  mostUnderfunded: StrategicFundingPosition[];
  /**
   * Planned investment beyond what confirmed income can support. Answers
   * "where are we financially overcommitted?" without treating a funding gap
   * as automatic overcommitment.
   */
  overcommitment?: {
    amount: Money;
    note: string;
  };
}

export function assessStrategicFunding(
  inputs: StrategicFundingInput[],
  options: { currency: string; unallocatedUnrestricted?: Money } = { currency: "GBP" },
): StrategicFundingSummary {
  const currency = options.currency;
  const positions = inputs.map((input) => {
    const need = floorAtZero(subtractMoney(input.plannedInvestment, input.securedFunding));
    const coverage = percentOf(input.securedFunding, input.plannedInvestment) ?? 0;
    return {
      ...input,
      potentialNeed: need,
      coveragePercent: coverage,
      state: fundingState(coverage),
    };
  });

  const totalPlanned = sumMoney(positions.map((p) => p.plannedInvestment), currency);
  const totalSecured = sumMoney(positions.map((p) => p.securedFunding), currency);
  const totalNeed = sumMoney(positions.map((p) => p.potentialNeed), currency);

  const cushion = options.unallocatedUnrestricted ?? zero(currency);
  const beyondCapacity = floorAtZero(subtractMoney(totalNeed, cushion));

  return {
    positions,
    totalPlanned,
    totalSecured,
    totalNeed,
    mostUnderfunded: [...positions]
      .filter((p) => p.potentialNeed.minorUnits > 0)
      .sort((a, b) => b.potentialNeed.minorUnits - a.potentialNeed.minorUnits),
    ...(beyondCapacity.minorUnits > 0 && cushion.minorUnits > 0
      ? {
          overcommitment: {
            amount: beyondCapacity,
            note: "Planned investment exceeds confirmed funding plus uncommitted unrestricted reserves. Either new funding is secured, or plans are re-scoped.",
          },
        }
      : {}),
  };
}

function fundingState(coveragePercent: number): StrategicFundingState {
  if (coveragePercent >= 95) return "funded";
  if (coveragePercent >= 60) return "partially_funded";
  if (coveragePercent > 0) return "underfunded";
  return "unfunded";
}
