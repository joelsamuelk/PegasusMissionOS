import { formatMoney, subtractMoney, toMajor } from "./money";
import { periodDays } from "./period";
import type { Money, Period, UnitCost, UnitCostKey } from "./types";
import type { ProgrammeEconomics } from "./unit-economics";

/**
 * Comparative impact economics (§8) and trend observation (§9).
 *
 * The discipline here is refusing to editorialise. A unit cost that rose 21%
 * is a fact about two numbers; whether the programme "became less efficient"
 * depends on cohort mix, intensity, inflation, a change in what counts as a
 * completion, or a shared-cost basis that changed halfway through. Pegasus
 * states the change, lists what could plausibly account for it, and asks.
 */

export const CORRELATION_CAVEAT =
  "This is an observed association between two figures, not a demonstrated cause.";

export type ChangeDirection = "increase" | "decrease" | "stable";

export interface UnitCostComparison {
  metric: UnitCostKey;
  comparable: boolean;
  /** Set when `comparable` is false. */
  reason?: string;
  baselinePeriod: Period;
  currentPeriod: Period;
  baseline?: Money;
  current?: Money;
  change?: Money;
  changePercent?: number;
  direction?: ChangeDirection;
  /** Reasons the comparison should be read with care, even when it is valid. */
  caveats: string[];
}

export interface CompareOptions {
  /** Below this, a change is reported as stable rather than as movement. */
  materialityPercent?: number;
  /** Period lengths differing by more than this share are not compared. */
  maxPeriodLengthDifference?: number;
}

export function compareUnitCost(
  baseline: UnitCost,
  current: UnitCost,
  options: CompareOptions = {},
): UnitCostComparison {
  const materiality = options.materialityPercent ?? 5;
  const maxLengthDelta = options.maxPeriodLengthDifference ?? 0.25;

  const baselinePeriod = baseline.methodology.period;
  const currentPeriod = current.methodology.period;
  const caveats: string[] = [];
  const base: UnitCostComparison = {
    metric: current.key,
    comparable: false,
    baselinePeriod,
    currentPeriod,
    caveats,
  };

  if (baseline.key !== current.key) {
    return { ...base, reason: "Different metrics cannot be compared." };
  }
  if (baseline.state !== "available" || current.state !== "available" || !baseline.value || !current.value) {
    return {
      ...base,
      reason: "One or both periods withheld this figure, so there is nothing to compare.",
    };
  }
  if (baseline.value.currency !== current.value.currency) {
    return { ...base, reason: "The two periods are denominated in different currencies." };
  }

  const baseDays = periodDays(baselinePeriod);
  const currentDays = periodDays(currentPeriod);
  const lengthDelta = Math.abs(currentDays - baseDays) / Math.max(baseDays, 1);
  if (lengthDelta > maxLengthDelta) {
    return {
      ...base,
      reason: `Periods differ in length by ${Math.round(lengthDelta * 100)}%, so a unit-cost comparison would mislead.`,
    };
  }
  if (lengthDelta > 0.02) {
    caveats.push(`Periods differ in length by ${Math.round(lengthDelta * 100)}%.`);
  }

  const baseMethods = new Set(baseline.methodology.allocationMethods);
  const currentMethods = new Set(current.methodology.allocationMethods);
  if (!setsEqual(baseMethods, currentMethods)) {
    caveats.push(
      "The allocation methods differ between periods, so part of the change may be methodological rather than operational.",
    );
  }
  if (!setsEqual(new Set(baseline.methodology.includedCosts), new Set(current.methodology.includedCosts))) {
    caveats.push("Different costs were included in each period.");
  }
  if (baseline.methodology.denominator.label !== current.methodology.denominator.label) {
    caveats.push(
      `The denominator changed from "${baseline.methodology.denominator.label}" to "${current.methodology.denominator.label}".`,
    );
  }
  if (
    baseline.methodology.deliveryDataQuality.level !== current.methodology.deliveryDataQuality.level
  ) {
    caveats.push(
      `Delivery data quality moved from ${baseline.methodology.deliveryDataQuality.level} to ${current.methodology.deliveryDataQuality.level}, which alone can move the figure.`,
    );
  }

  const change = subtractMoney(current.value, baseline.value);
  const changePercent =
    baseline.value.minorUnits === 0
      ? 0
      : Math.round((change.minorUnits / Math.abs(baseline.value.minorUnits)) * 1000) / 10;
  const direction: ChangeDirection =
    Math.abs(changePercent) < materiality ? "stable" : changePercent > 0 ? "increase" : "decrease";

  return {
    ...base,
    comparable: true,
    baseline: baseline.value,
    current: current.value,
    change,
    changePercent,
    direction,
  };
}

/** "Cost per completion 2025 £510 → 2026 £427 (↓ 16%)". */
export function describeComparison(comparison: UnitCostComparison, label: string): string | null {
  if (!comparison.comparable || !comparison.baseline || !comparison.current) return null;
  const arrow = comparison.direction === "increase" ? "↑" : comparison.direction === "decrease" ? "↓" : "→";
  const magnitude = Math.abs(Math.round(comparison.changePercent ?? 0));
  const movement = comparison.direction === "stable" ? "broadly unchanged" : `${arrow} ${magnitude}%`;
  return `${label}: ${comparison.baselinePeriod.label} ${formatMoney(comparison.baseline)} → ${comparison.currentPeriod.label} ${formatMoney(comparison.current)} (${movement})`;
}

// --- Observations (§9) ---------------------------------------------------

export interface TrendObservation {
  key: string;
  /** Always an observation. Pegasus does not conclude here. */
  kind: "observation";
  text: string;
  /** Candidate explanations, offered for checking rather than asserted. */
  possibleFactors: string[];
  /** What a person should look at next. */
  invitation: string;
  caveats: string[];
}

export interface ProgrammeTrend {
  programmeId: string;
  comparisons: UnitCostComparison[];
  observations: TrendObservation[];
  /** Comparisons that could not be made, with the reason. */
  notComparable: UnitCostComparison[];
}

/**
 * Compare two periods of a programme's economics.
 *
 * The divergence observations are the valuable ones: expenditure up 21% while
 * reach is up 4% is worth a conversation, and is exactly the kind of movement
 * that no one notices until a funder asks.
 */
export function compareProgrammeEconomics(
  previous: ProgrammeEconomics,
  current: ProgrammeEconomics,
  options: CompareOptions = {},
): ProgrammeTrend {
  const materiality = options.materialityPercent ?? 5;
  const comparisons: UnitCostComparison[] = [];

  for (const currentMetric of current.economics) {
    const baseline = previous.economics.find((m) => m.key === currentMetric.key);
    if (!baseline) continue;
    comparisons.push(compareUnitCost(baseline, currentMetric, options));
  }

  const observations: TrendObservation[] = [];

  for (const comparison of comparisons) {
    if (!comparison.comparable || comparison.direction === "stable") continue;
    const magnitude = Math.abs(Math.round(comparison.changePercent ?? 0));
    const verb = comparison.direction === "increase" ? "increased" : "decreased";
    observations.push({
      key: `unit-cost:${comparison.metric}`,
      kind: "observation",
      text: `${labelFor(comparison.metric)} ${verb} ${magnitude}% between ${comparison.baselinePeriod.label} and ${comparison.currentPeriod.label}.`,
      possibleFactors: unitCostFactors(comparison),
      invitation: "Check delivery mix, cohort profile and shared-cost basis before drawing a conclusion.",
      caveats: [CORRELATION_CAVEAT, ...comparison.caveats],
    });
  }

  const spendChange = percentChange(toMajor(previous.financial.actual), toMajor(current.financial.actual));
  const reachChange = measureChange(previous, current, "participant");
  const completionChange = measureChange(previous, current, "completion");

  if (spendChange !== null && reachChange !== null) {
    const divergence = spendChange - reachChange;
    if (Math.abs(divergence) >= materiality * 2 && Math.abs(spendChange) >= materiality) {
      observations.push({
        key: "divergence:spend-vs-reach",
        kind: "observation",
        text: `Programme expenditure ${movementWord(spendChange)} ${Math.abs(Math.round(spendChange))}%, but participant reach ${movementWord(reachChange)} ${Math.abs(Math.round(reachChange))}%.`,
        possibleFactors: [
          "A deliberate shift toward more intensive support for fewer people",
          "Cost inflation in staffing, premises or delivery",
          "Set-up costs for a new site or cohort that has not yet reached full volume",
          "A change in how participants are counted",
        ],
        invitation: "Compare against the delivery plan for the period before treating this as a cost problem.",
        caveats: [CORRELATION_CAVEAT],
      });
    }
  }

  const perParticipant = comparisons.find((c) => c.metric === "cost_per_participant");
  if (
    perParticipant?.comparable &&
    perParticipant.direction === "decrease" &&
    completionChange !== null &&
    Math.abs(completionChange) < materiality
  ) {
    observations.push({
      key: "divergence:cost-down-completion-stable",
      kind: "observation",
      text: `Cost per participant decreased ${Math.abs(Math.round(perParticipant.changePercent ?? 0))}% while programme completion remained stable.`,
      possibleFactors: [
        "Larger cohorts spreading fixed delivery costs",
        "A shared-cost basis that moved with expenditure",
        "Reduced unit costs from an established delivery model",
      ],
      invitation: "Worth understanding what changed, so it can be repeated deliberately rather than by accident.",
      caveats: [CORRELATION_CAVEAT],
    });
  }

  return {
    programmeId: current.programmeId,
    comparisons: comparisons.filter((c) => c.comparable),
    observations,
    notComparable: comparisons.filter((c) => !c.comparable),
  };
}

function unitCostFactors(comparison: UnitCostComparison): string[] {
  const factors = [
    "A change in cohort size or delivery intensity",
    "Movement in staff, premises or supplier costs",
    "A different mix of direct and apportioned costs",
  ];
  if (comparison.caveats.length > 0) {
    factors.unshift("A methodological change between the two periods (see caveats)");
  }
  if (comparison.metric === "cost_per_outcome") {
    factors.push("A change in how completely outcomes were recorded");
  }
  return factors;
}

function measureChange(
  previous: ProgrammeEconomics,
  current: ProgrammeEconomics,
  kind: "participant" | "completion" | "outcome" | "output",
): number | null {
  const before = previous.delivery.find((m) => m.kind === kind)?.value;
  const after = current.delivery.find((m) => m.kind === kind)?.value;
  if (before === undefined || after === undefined) return null;
  return percentChange(before, after);
}

function percentChange(before: number, after: number): number | null {
  if (before === 0) return null;
  return Math.round(((after - before) / Math.abs(before)) * 1000) / 10;
}

function movementWord(change: number): string {
  if (change > 0) return "increased";
  if (change < 0) return "decreased";
  return "held at";
}

function labelFor(metric: UnitCostKey): string {
  return {
    cost_per_participant: "Cost per participant",
    cost_per_completion: "Cost per completion",
    cost_per_output: "Cost per output",
    cost_per_outcome: "Cost per recorded outcome",
  }[metric];
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
