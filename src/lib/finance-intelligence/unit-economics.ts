import type { UUID } from "@/types/domain";
import { divideMoney, isPositive, percentOf, subtractMoney, sumMoney, zero } from "./money";
import { isAtLeast, quality, weakestQuality } from "./quality";
import type {
  AllocationMethod,
  DataQuality,
  DataQualityLevel,
  DeliveryMeasure,
  DeliveryMeasureKind,
  Methodology,
  Money,
  Period,
  UnitCost,
  UnitCostKey,
} from "./types";

/**
 * Unit economics (§3, §4, §7).
 *
 * Two rules do most of the work here.
 *
 * **Every figure discloses its method.** A `UnitCost` cannot exist without a
 * `Methodology` — numerator, denominator, period, allocation methods, what was
 * included, what was excluded, data quality and assumptions. There is no
 * constructor that produces a bare number.
 *
 * **A figure with a bad denominator is withheld, not caveated.** Where outcome
 * data is thin, `state` is "withheld" and the reason says what would enable it.
 * A number on screen with a warning beside it is read as a number.
 */

export const UNIT_COST_LABELS: Record<UnitCostKey, string> = {
  cost_per_participant: "Cost per participant",
  cost_per_completion: "Cost per completion",
  cost_per_output: "Cost per output",
  cost_per_outcome: "Cost per recorded outcome",
};

const KIND_TO_KEY: Record<DeliveryMeasureKind, UnitCostKey> = {
  participant: "cost_per_participant",
  completion: "cost_per_completion",
  output: "cost_per_output",
  outcome: "cost_per_outcome",
};

/**
 * §4. These boundaries ship with the figure, because "cost per outcome" is
 * routinely read as the value of the outcome, which it is not.
 */
const BOUNDARIES: Record<UnitCostKey, string[]> = {
  cost_per_participant: [
    "Measures reach, not effect. A participant is someone who took part, not someone who benefited.",
    "Not comparable between programmes with different intensity or duration.",
  ],
  cost_per_completion: [
    "Counts completion of the intervention, not the achievement of an outcome.",
    "Sensitive to how completion is defined; the definition must travel with the figure.",
  ],
  cost_per_output: [
    "An output is something delivered, not a change achieved.",
  ],
  cost_per_outcome: [
    "Counts outcomes recorded, not outcomes caused. No attribution has been modelled.",
    "This is not a social return on investment. It places no value on the outcome and models no deadweight, attribution, displacement or drop-off.",
    "Outcomes recorded after the period boundary are not counted, which flatters programmes with fast outcomes.",
  ],
};

/** The minimum delivery data quality each metric requires before it publishes. */
const MINIMUM_DELIVERY_QUALITY: Record<UnitCostKey, DataQualityLevel> = {
  cost_per_participant: "low",
  cost_per_completion: "low",
  cost_per_output: "low",
  // §7: do not show cost-per-outcome without appropriate outcome data.
  cost_per_outcome: "moderate",
};

export interface UnitEconomicsInput {
  programmeId?: UUID;
  period: Period;
  /** Allocated cost for the period, from the cost roll-up — never raw transactions. */
  cost: Money;
  measures: DeliveryMeasure[];
  allocationMethods: AllocationMethod[];
  includedCosts: string[];
  excludedCosts: string[];
  financialDataQuality: DataQuality;
  assumptions?: string[];
}

export function computeUnitEconomics(input: UnitEconomicsInput): UnitCost[] {
  return input.measures.map((measure) => computeUnitCost(input, measure));
}

export function computeUnitCost(input: UnitEconomicsInput, measure: DeliveryMeasure): UnitCost {
  const key = KIND_TO_KEY[measure.kind];
  const deliveryQuality = measureQuality(measure);
  const methodology: Methodology = {
    numerator: { label: `Allocated ${input.period.label} cost`, amount: input.cost },
    denominator: { label: measure.label, count: measure.value, kind: measure.kind },
    period: input.period,
    allocationMethods: [...new Set(input.allocationMethods)],
    includedCosts: input.includedCosts,
    excludedCosts: input.excludedCosts,
    financialDataQuality: input.financialDataQuality,
    deliveryDataQuality: deliveryQuality,
    assumptions: input.assumptions ?? [],
    boundaries: BOUNDARIES[key],
  };

  const base = {
    key,
    label: UNIT_COST_LABELS[key],
    ...(input.programmeId ? { programmeId: input.programmeId } : {}),
    metricKind: "unit_cost" as const,
    methodology,
  };

  const withheld = withholdingReason(input, measure, key, deliveryQuality);
  if (withheld) return { ...base, state: "withheld", withheld };

  return { ...base, state: "available", value: divideMoney(input.cost, measure.value) };
}

function withholdingReason(
  input: UnitEconomicsInput,
  measure: DeliveryMeasure,
  key: UnitCostKey,
  deliveryQuality: DataQuality,
): { reason: string; requires: string[] } | null {
  if (measure.value <= 0) {
    return {
      reason: `No ${measure.label.toLowerCase()} recorded for ${input.period.label}.`,
      requires: [`Record ${measure.label.toLowerCase()} for this period.`],
    };
  }
  if (!isPositive(input.cost)) {
    return {
      reason: `No allocated cost for ${input.period.label}.`,
      requires: ["Allocate expenditure to this programme for the period."],
    };
  }
  if (input.financialDataQuality.level === "insufficient") {
    return {
      reason: "Too little of the period's expenditure has been allocated to produce a defensible unit cost.",
      requires: [
        "Allocate the remaining expenditure to programmes.",
        ...input.financialDataQuality.reasons,
      ],
    };
  }
  if (!isAtLeast(deliveryQuality.level, MINIMUM_DELIVERY_QUALITY[key])) {
    return {
      reason:
        key === "cost_per_outcome"
          ? `Outcome data for ${input.period.label} is ${deliveryQuality.level}. A cost per outcome built on partial outcome recording understates the true cost, so it is withheld.`
          : `${measure.label} data for ${input.period.label} is ${deliveryQuality.level}.`,
      requires: [
        `Raise ${measure.label.toLowerCase()} completeness to at least ${MINIMUM_DELIVERY_QUALITY[key]}.`,
        ...deliveryQuality.reasons,
      ],
    };
  }
  return null;
}

/** Completeness plus verification state, since an unverified count is weaker. */
export function measureQuality(measure: DeliveryMeasure): DataQuality {
  const reasons: string[] = [`${Math.round(measure.completeness * 100)}% of delivery has this measure recorded.`];
  let score = measure.completeness;
  if (measure.verificationState === "needs_review" || measure.verificationState === "ai_extracted") {
    score *= 0.9;
    reasons.push("The figure has not been confirmed by a person.");
  }
  if (measure.verificationState === "outdated") {
    score *= 0.7;
    reasons.push("The figure is marked outdated.");
  }
  if (measure.source) reasons.push(`Source: ${measure.source}.`);
  return quality(score, reasons);
}

// --- SROI ----------------------------------------------------------------

export interface UnsupportedMetric {
  key: "social_return_on_investment";
  supported: false;
  reason: string;
  requires: string[];
}

/**
 * §4. SROI is not a division; it is a methodology with valuation, deadweight,
 * attribution, displacement, drop-off and a discount rate, every one of which
 * is a stated assumption a person must own. Pegasus refuses rather than
 * relabelling a unit cost.
 */
export function socialReturnOnInvestment(): UnsupportedMetric {
  return {
    key: "social_return_on_investment",
    supported: false,
    reason:
      "Pegasus does not calculate social return on investment from financial and programme data alone. SROI requires a valuation methodology and assumptions that must be chosen and owned by the organisation.",
    requires: [
      "A stated valuation approach for each outcome (financial proxies and their sources)",
      "Deadweight, attribution, displacement and drop-off assumptions",
      "A discount rate and benefit period",
      "Stakeholder involvement in defining material outcomes",
    ],
  };
}

/** Guards the §4 boundary: no unit-cost label may imply a return or valuation. */
export const FORBIDDEN_METRIC_LANGUAGE = /\b(sroi|social return|return on investment|value of|roi)\b/i;

// --- Programme economics (§7) -------------------------------------------

export interface ProgrammeEconomicsInput extends UnitEconomicsInput {
  programmeId: UUID;
  programmeName: string;
  budget?: Money;
  restrictedFunding: Money;
  unrestrictedFunding: Money;
}

export interface ProgrammeEconomics {
  programmeId: UUID;
  programmeName: string;
  period: Period;
  financial: {
    budget?: Money;
    actual: Money;
    /** actual − budget. Negative is an underspend. */
    variance?: Money;
    variancePercent?: number;
  };
  delivery: DeliveryMeasure[];
  economics: UnitCost[];
  funding: {
    restricted: Money;
    unrestricted: Money;
    total: Money;
  };
  dataQuality: {
    financialAllocation: DataQuality;
    delivery: DataQuality;
    outcomes: DataQuality;
  };
}

export function buildProgrammeEconomics(input: ProgrammeEconomicsInput): ProgrammeEconomics {
  const currency = input.cost.currency;
  const economics = computeUnitEconomics(input);

  const variance = input.budget ? subtractMoney(input.cost, input.budget) : undefined;
  const variancePercent = input.budget ? percentOf(variance ?? zero(currency), input.budget) : null;

  const outcomeMeasures = input.measures.filter((m) => m.kind === "outcome");
  const nonOutcomeMeasures = input.measures.filter((m) => m.kind !== "outcome");

  return {
    programmeId: input.programmeId,
    programmeName: input.programmeName,
    period: input.period,
    financial: {
      ...(input.budget ? { budget: input.budget } : {}),
      actual: input.cost,
      ...(variance ? { variance } : {}),
      ...(variancePercent !== null && variancePercent !== undefined ? { variancePercent } : {}),
    },
    delivery: input.measures,
    economics,
    funding: {
      restricted: input.restrictedFunding,
      unrestricted: input.unrestrictedFunding,
      total: sumMoney([input.restrictedFunding, input.unrestrictedFunding], currency),
    },
    dataQuality: {
      financialAllocation: input.financialDataQuality,
      delivery:
        nonOutcomeMeasures.length > 0
          ? weakestQuality(...nonOutcomeMeasures.map(measureQuality))
          : quality(0, ["No participant or output measures recorded."]),
      outcomes:
        outcomeMeasures.length > 0
          ? weakestQuality(...outcomeMeasures.map(measureQuality))
          : quality(0, ["No outcome measures recorded."]),
    },
  };
}
