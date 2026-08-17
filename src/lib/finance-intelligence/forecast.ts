import type { ISODate, UUID } from "@/types/domain";
import { addMoney, floorAtZero, splitMoney, subtractMoney, sumMoney, zero } from "./money";
import { overlapDays, periodContains, quartersOverHorizon, spanDays } from "./period";
import type { CurrencyCode, FundingCertainty, FundingNeedType, Money, Period } from "./types";

/**
 * Funding need forecast (§16).
 *
 * The rule that shapes this module: **a pound of confirmed income and a pound
 * of scenario income are never added together.** Every bucket keeps the four
 * certainty tiers apart, `secured` means confirmed only, and `gap` is measured
 * against confirmed income alone. `gapAfterExpected` is offered beside it, so
 * an optimistic reading is available but never the default.
 */

export interface ForecastScope {
  programmeId?: UUID;
  strategicPriorityId?: UUID;
  fundingType?: FundingNeedType;
}

export interface ForecastRequirement extends ForecastScope {
  id: string;
  label: string;
  amount: Money;
  from: ISODate;
  until: ISODate;
  /** Spread evenly across the span by days, or land wholly in the `from` period. */
  spread?: "even" | "point";
}

export interface ForecastIncome extends ForecastScope {
  id: string;
  label: string;
  amount: Money;
  from: ISODate;
  until?: ISODate;
  funderId?: UUID;
  certainty: FundingCertainty;
  spread?: "even" | "point";
}

export interface FundingNeedForecastInput {
  now: Date;
  /** 12–36 months (§16). Values outside are clamped and the clamp is recorded. */
  horizonMonths: number;
  requirements: ForecastRequirement[];
  income: ForecastIncome[];
  currency: CurrencyCode;
  scope?: ForecastScope;
}

export interface ForecastBucket {
  period: Period;
  requirement: Money;
  /** Confirmed income only. Nothing softer is ever called secured. */
  secured: Money;
  byCertainty: Record<FundingCertainty, Money>;
  /** requirement − confirmed. */
  gap: Money;
  /** requirement − (confirmed + expected). Shown beside `gap`, never instead of it. */
  gapAfterExpected: Money;
}

export interface FundingNeedForecast {
  currency: CurrencyCode;
  horizonMonths: number;
  buckets: ForecastBucket[];
  totals: {
    requirement: Money;
    secured: Money;
    gap: Money;
    byCertainty: Record<FundingCertainty, Money>;
  };
  /** The first quarter where confirmed income stops covering the requirement. */
  firstGapPeriod?: Period;
  assumptions: string[];
}

const CERTAINTIES: FundingCertainty[] = ["confirmed", "expected", "forecast", "scenario"];

export function buildFundingNeedForecast(input: FundingNeedForecastInput): FundingNeedForecast {
  const currency = input.currency;
  const assumptions: string[] = [];

  let horizon = input.horizonMonths;
  if (horizon < 12) {
    horizon = 12;
    assumptions.push("Horizon extended to the 12-month minimum.");
  }
  if (horizon > 36) {
    horizon = 36;
    assumptions.push("Horizon capped at 36 months; beyond that, delivery plans are not reliable enough to forecast.");
  }

  const periods = quartersOverHorizon(input.now, horizon);
  const requirements = input.requirements.filter((r) => inScope(r, input.scope));
  const income = input.income.filter((i) => inScope(i, input.scope));

  if (requirements.some((r) => (r.spread ?? "even") === "even")) {
    assumptions.push("Multi-period costs are spread across quarters in proportion to days, not to actual delivery profile.");
  }

  const buckets: ForecastBucket[] = periods.map((period) => ({
    period,
    requirement: zero(currency),
    secured: zero(currency),
    byCertainty: emptyCertainties(currency),
    gap: zero(currency),
    gapAfterExpected: zero(currency),
  }));

  for (const requirement of requirements) {
    const parts = distribute(requirement.amount, requirement.from, requirement.until, requirement.spread ?? "even", periods);
    parts.forEach((amount, index) => {
      const bucket = buckets[index];
      if (!bucket) return;
      bucket.requirement = addMoney(bucket.requirement, amount);
    });
  }

  for (const item of income) {
    const parts = distribute(
      item.amount,
      item.from,
      item.until ?? item.from,
      item.spread ?? (item.until ? "even" : "point"),
      periods,
    );
    parts.forEach((amount, index) => {
      const bucket = buckets[index];
      if (!bucket) return;
      bucket.byCertainty[item.certainty] = addMoney(bucket.byCertainty[item.certainty], amount);
    });
  }

  for (const bucket of buckets) {
    bucket.secured = bucket.byCertainty.confirmed;
    bucket.gap = floorAtZero(subtractMoney(bucket.requirement, bucket.secured));
    bucket.gapAfterExpected = floorAtZero(
      subtractMoney(bucket.requirement, addMoney(bucket.secured, bucket.byCertainty.expected)),
    );
  }

  const totalsByCertainty = emptyCertainties(currency);
  for (const certainty of CERTAINTIES) {
    totalsByCertainty[certainty] = sumMoney(
      buckets.map((b) => b.byCertainty[certainty]),
      currency,
    );
  }

  const firstGap = buckets.find((b) => b.gap.minorUnits > 0);

  return {
    currency,
    horizonMonths: horizon,
    buckets,
    totals: {
      requirement: sumMoney(buckets.map((b) => b.requirement), currency),
      secured: sumMoney(buckets.map((b) => b.secured), currency),
      gap: sumMoney(buckets.map((b) => b.gap), currency),
      byCertainty: totalsByCertainty,
    },
    ...(firstGap ? { firstGapPeriod: firstGap.period } : {}),
    assumptions,
  };
}

export type ForecastDimension = "programme" | "strategic_priority" | "funding_type";

/**
 * §16. The same forecast, split by programme, strategic priority or funding
 * type. Each series is computed independently rather than by apportioning the
 * organisation total, so a series is never a share of a number nobody checked.
 */
export function forecastByDimension(
  input: FundingNeedForecastInput,
  dimension: ForecastDimension,
): Record<string, FundingNeedForecast> {
  const keys = new Set<string>();
  for (const item of [...input.requirements, ...input.income]) {
    const key = dimensionKey(item, dimension);
    if (key) keys.add(key);
  }

  const out: Record<string, FundingNeedForecast> = {};
  for (const key of keys) {
    out[key] = buildFundingNeedForecast({
      ...input,
      requirements: input.requirements.filter((r) => dimensionKey(r, dimension) === key),
      income: input.income.filter((i) => dimensionKey(i, dimension) === key),
    });
  }
  return out;
}

function dimensionKey(scope: ForecastScope, dimension: ForecastDimension): string | undefined {
  if (dimension === "programme") return scope.programmeId;
  if (dimension === "strategic_priority") return scope.strategicPriorityId;
  return scope.fundingType;
}

function inScope(item: ForecastScope, scope?: ForecastScope): boolean {
  if (!scope) return true;
  if (scope.programmeId && item.programmeId !== scope.programmeId) return false;
  if (scope.strategicPriorityId && item.strategicPriorityId !== scope.strategicPriorityId) return false;
  if (scope.fundingType && item.fundingType !== scope.fundingType) return false;
  return true;
}

/**
 * Spread an amount across quarters by overlapping days, exact to the minor
 * unit. Anything falling outside the horizon is dropped rather than pushed
 * into the nearest bucket, which would overstate the near term.
 */
function distribute(
  amount: Money,
  from: ISODate,
  until: ISODate,
  spread: "even" | "point",
  periods: Period[],
): Money[] {
  if (spread === "point") {
    return periods.map((period) => (periodContains(period, from) ? amount : zero(amount.currency)));
  }

  const overlaps = periods.map((period) => overlapDays({ start: from, end: until }, period));
  const covered = overlaps.reduce((sum, w) => sum + w, 0);
  if (covered === 0) return periods.map(() => zero(amount.currency));

  // The tail weight represents the part of the span lying outside the horizon.
  // Splitting against it and discarding that share keeps the in-horizon
  // buckets honest instead of compressing a three-year cost into two years.
  const outside = Math.max(0, spanDays(from, until) - covered);
  return splitMoney(amount, [...overlaps, outside]).slice(0, periods.length);
}

function emptyCertainties(currency: CurrencyCode): Record<FundingCertainty, Money> {
  return {
    confirmed: zero(currency),
    expected: zero(currency),
    forecast: zero(currency),
    scenario: zero(currency),
  };
}
