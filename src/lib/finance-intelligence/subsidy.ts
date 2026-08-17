import type { UUID } from "@/types/domain";
import {
  formatMoneyCompact,
  isNegative,
  maxMoney,
  minMoney,
  minorUnitScale,
  percentOf,
  roundMoneyTo,
  subtractMoney,
  zero,
} from "./money";
import { isAtLeast, weakestQuality } from "./quality";
import type { DataQuality, Money, Period, StructuralSubsidy, SubsidyPosition } from "./types";

/**
 * Restricted programme subsidy (§6).
 *
 * The question this answers — how much unrestricted money is quietly holding
 * up a restricted programme — is one most NGOs cannot answer, and it is the
 * difference between "we are fully funded" and "we are fully funded provided
 * someone else pays for 12% of it".
 */

export interface SubsidyInput {
  programmeId: UUID;
  period: Period;
  /** Allocated programme cost for the period. */
  programmeCost: Money;
  /** Restricted income applied to this programme in the period. */
  restrictedFunding: Money;
  financialDataQuality: DataQuality;
  fundingDataQuality?: DataQuality;
}

export function computeSubsidy(input: SubsidyInput): SubsidyPosition {
  const contribution = subtractMoney(input.programmeCost, input.restrictedFunding);
  const overFunded = isNegative(contribution);
  const percent = percentOf(contribution, input.programmeCost) ?? 0;

  return {
    programmeId: input.programmeId,
    period: input.period,
    programmeCost: input.programmeCost,
    restrictedFunding: input.restrictedFunding,
    unrestrictedContribution: contribution,
    subsidyPercent: percent,
    overFunded,
    dataQuality: input.fundingDataQuality
      ? weakestQuality(input.financialDataQuality, input.fundingDataQuality)
      : input.financialDataQuality,
  };
}

export interface StructuralSubsidyOptions {
  /** Consecutive periods required before a pattern may be claimed. */
  minimumPeriods?: number;
  /** Subsidy below this share of programme cost is treated as noise. */
  materialityPercent?: number;
}

/**
 * §6 asks Pegasus to spot *persistent structural* subsidy — not a single bad
 * year. The bar is deliberately high: three or more consecutive periods, each
 * with material subsidy and at least moderate data quality. Below that,
 * `detected` is false and the reason says what is missing, rather than
 * asserting a pattern from two data points.
 */
export function detectStructuralSubsidy(
  programmeId: UUID,
  positions: SubsidyPosition[],
  options: StructuralSubsidyOptions = {},
): StructuralSubsidy {
  const minimumPeriods = options.minimumPeriods ?? 3;
  const materiality = options.materialityPercent ?? 2;

  const ordered = [...positions].sort((a, b) => a.period.start.localeCompare(b.period.start));

  if (ordered.length < minimumPeriods) {
    return {
      programmeId,
      periods: ordered,
      detected: false,
      reason: `${ordered.length} comparable period(s) available; ${minimumPeriods} are required before a recurring pattern can be claimed.`,
    };
  }

  const weak = ordered.filter((p) => !isAtLeast(p.dataQuality.level, "moderate"));
  if (weak.length > 0) {
    return {
      programmeId,
      periods: ordered,
      detected: false,
      reason: `Data quality is below moderate in ${weak.length} of ${ordered.length} periods (${weak
        .map((p) => p.period.label)
        .join(", ")}), so a trend would not be defensible.`,
    };
  }

  const subsidised = ordered.filter((p) => p.subsidyPercent >= materiality && !p.overFunded);
  if (subsidised.length < minimumPeriods) {
    return {
      programmeId,
      periods: ordered,
      detected: false,
      reason: `Material unrestricted subsidy appears in ${subsidised.length} of ${ordered.length} periods, which is not a persistent pattern.`,
    };
  }

  const currency = ordered[0]?.programmeCost.currency ?? "GBP";
  const contributions = subsidised.map((p) => p.unrestrictedContribution);
  const low = contributions.reduce((min, m) => minMoney(min, m), contributions[0] ?? zero(currency));
  const high = contributions.reduce((max, m) => maxMoney(max, m), contributions[0] ?? zero(currency));
  const percents = subsidised.map((p) => p.subsidyPercent).sort((a, b) => a - b);
  const median = medianOf(percents);

  // Round the quoted range to the nearest £5k so it reads as the estimate it is.
  const step = 5000 * minorUnitScale(currency);

  return {
    programmeId,
    periods: ordered,
    detected: true,
    rangeLow: roundMoneyTo(low, step),
    rangeHigh: roundMoneyTo(high, step),
    medianPercent: median,
    reason: `Unrestricted funding covered part of this programme's cost in ${subsidised.length} consecutive periods.`,
  };
}

/** The §6 sentence, built from the detection rather than written by a model. */
export function describeStructuralSubsidy(
  subsidy: StructuralSubsidy,
  programmeName: string,
): string | null {
  if (!subsidy.detected || !subsidy.rangeLow || !subsidy.rangeHigh) return null;
  const span = `${subsidy.periods.length} periods`;
  const range =
    subsidy.rangeLow.minorUnits === subsidy.rangeHigh.minorUnits
      ? `approximately ${formatMoneyCompact(subsidy.rangeLow)}`
      : `approximately ${formatMoneyCompact(subsidy.rangeLow)}–${formatMoneyCompact(subsidy.rangeHigh)}`;
  return `${programmeName} has required ${range} of unrestricted organisational funding in each of the last ${span}.`;
}

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round((((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2) * 10) / 10;
}
