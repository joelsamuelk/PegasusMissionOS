import type { UUID } from "@/types/domain";
import { addMoney, percentOf, sumMoney, zero } from "./money";
import type { CurrencyCode, Money } from "./types";

/**
 * Funding concentration (§20).
 *
 * Concentration is not automatically bad — a well-run organisation with one
 * committed strategic funder can be more stable than one juggling nine small
 * grants. What matters is that a recommendation to pursue an opportunity says
 * what it would do to dependence, so the trade-off is made deliberately.
 */

export type ConcentrationLevel = "low" | "moderate" | "high" | "severe";

export const CONCENTRATION_LABELS: Record<ConcentrationLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
};

export interface FunderIncome {
  funderId: UUID;
  funderName: string;
  amount: Money;
}

export interface ConcentrationShare extends FunderIncome {
  /** 0..100, one decimal place. */
  sharePercent: number;
}

export interface ConcentrationPosition {
  currency: CurrencyCode;
  total: Money;
  shares: ConcentrationShare[];
  largest?: ConcentrationShare;
  topThreePercent: number;
  /** Herfindahl–Hirschman index over funder shares, 0..1. */
  herfindahl: number;
  level: ConcentrationLevel;
  reasons: string[];
}

export function computeConcentration(
  incomes: FunderIncome[],
  currency: CurrencyCode,
): ConcentrationPosition {
  const merged = new Map<string, FunderIncome>();
  for (const income of incomes) {
    const existing = merged.get(income.funderId);
    merged.set(
      income.funderId,
      existing ? { ...existing, amount: addMoney(existing.amount, income.amount) } : income,
    );
  }

  const total = sumMoney([...merged.values()].map((i) => i.amount), currency);
  const shares: ConcentrationShare[] = [...merged.values()]
    .map((income) => ({ ...income, sharePercent: percentOf(income.amount, total) ?? 0 }))
    .sort((a, b) => b.amount.minorUnits - a.amount.minorUnits);

  const largest = shares[0];
  const topThree = shares.slice(0, 3).reduce((sum, s) => sum + s.sharePercent, 0);
  const herfindahl =
    Math.round(shares.reduce((sum, s) => sum + (s.sharePercent / 100) ** 2, 0) * 1000) / 1000;

  const level = levelFor(largest?.sharePercent ?? 0, herfindahl);
  const reasons: string[] = [];
  if (largest) {
    reasons.push(`${largest.funderName} provides ${largest.sharePercent}% of income in scope.`);
  }
  reasons.push(`The three largest funders provide ${Math.round(topThree)}%.`);
  reasons.push(`${shares.length} funder(s) contribute.`);

  return {
    currency,
    total,
    shares,
    ...(largest ? { largest } : {}),
    topThreePercent: Math.round(topThree * 10) / 10,
    herfindahl,
    level,
    reasons,
  };
}

function levelFor(largestPercent: number, herfindahl: number): ConcentrationLevel {
  if (largestPercent >= 50 || herfindahl >= 0.4) return "severe";
  if (largestPercent >= 35 || herfindahl >= 0.25) return "high";
  if (largestPercent >= 20 || herfindahl >= 0.15) return "moderate";
  return "low";
}

export interface ConcentrationProjection {
  before: ConcentrationPosition;
  after: ConcentrationPosition;
  funderName: string;
  beforePercent: number;
  afterPercent: number;
  /** Percentage points added to this funder's share. */
  deltaPercentagePoints: number;
  levelChanged: boolean;
  /** Set where the projection is material enough to put in front of a person. */
  warning?: string;
}

/**
 * §20. What a prospective award would do to dependence.
 *
 * Deliberately not a veto. It produces the sentence a fundraiser needs before
 * recommending the opportunity to a board — "this would take your largest
 * funder from 31% to 47% of expected income" — and leaves the decision where
 * it belongs.
 */
export function projectConcentration(
  current: ConcentrationPosition,
  prospective: FunderIncome,
  options: { warnAtPercent?: number; warnAtDelta?: number } = {},
): ConcentrationProjection {
  const warnAt = options.warnAtPercent ?? 40;
  const warnDelta = options.warnAtDelta ?? 10;

  const after = computeConcentration(
    [...current.shares.map(({ funderId, funderName, amount }) => ({ funderId, funderName, amount })), prospective],
    current.currency,
  );

  const beforePercent = current.shares.find((s) => s.funderId === prospective.funderId)?.sharePercent ?? 0;
  const afterPercent = after.shares.find((s) => s.funderId === prospective.funderId)?.sharePercent ?? 0;
  const delta = Math.round((afterPercent - beforePercent) * 10) / 10;
  const levelChanged = after.level !== current.level;

  const warning =
    afterPercent >= warnAt || delta >= warnDelta
      ? `This opportunity could cover a large share of the gap, but would move ${prospective.funderName} from ${beforePercent}% to approximately ${afterPercent}% of expected income in scope.`
      : undefined;

  return {
    before: current,
    after,
    funderName: prospective.funderName,
    beforePercent,
    afterPercent,
    deltaPercentagePoints: delta,
    levelChanged,
    ...(warning ? { warning } : {}),
  };
}

/** Concentration movement between two periods, for §24's trend recommendation. */
export function compareConcentration(
  previous: ConcentrationPosition,
  current: ConcentrationPosition,
): { deltaPercentagePoints: number; direction: "increase" | "decrease" | "stable"; text: string } {
  const before = previous.largest?.sharePercent ?? 0;
  const after = current.largest?.sharePercent ?? 0;
  const delta = Math.round((after - before) * 10) / 10;
  const direction = Math.abs(delta) < 2 ? "stable" : delta > 0 ? "increase" : "decrease";
  return {
    deltaPercentagePoints: delta,
    direction,
    text:
      direction === "stable"
        ? "Funding concentration is broadly unchanged."
        : `Funding concentration has ${direction === "increase" ? "increased" : "decreased"}: the largest funder moved from ${before}% to ${after}% of income.`,
  };
}

export function zeroConcentration(currency: CurrencyCode): ConcentrationPosition {
  return {
    currency,
    total: zero(currency),
    shares: [],
    topThreePercent: 0,
    herfindahl: 0,
    level: "low",
    reasons: ["No funder income recorded in scope."],
  };
}
