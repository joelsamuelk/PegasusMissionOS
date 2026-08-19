import { parseISO } from "date-fns";
import type { ISODate, UUID } from "@/types/domain";
import { addMoney, divideMoney, floorAtZero, formatMoney, isZero, subtractMoney, toMajor } from "./money";
import { fractionalMonthsBetween, wholeMonthsBetween } from "./period";
import { calculation, fact, forecast, type Statement } from "./statements";
import type { Money } from "./types";

/**
 * Funding runway (§14) and unrestricted runway (§21).
 *
 * Organisation-wide cash runway hides the thing that actually goes wrong: an
 * organisation with nine months of cash can have a programme whose funding
 * stops in four. Runway is therefore calculated per programme as well as
 * per organisation.
 */

export type RunwayState = "secure" | "watch" | "warning" | "critical";

export const RUNWAY_STATE_LABELS: Record<RunwayState, string> = {
  secure: "Secure",
  watch: "Watch",
  warning: "Warning",
  critical: "Critical",
};

/**
 * Thresholds are set against fundraising lead times, not accounting
 * convention: a competitive grant typically takes three months to prepare and
 * three to six to decide, so a gap nine months out is already urgent.
 */
const RUNWAY_THRESHOLDS = { critical: 3, warning: 9, watch: 18 } as const;

export function runwayState(months: number): RunwayState {
  if (months <= RUNWAY_THRESHOLDS.critical) return "critical";
  if (months <= RUNWAY_THRESHOLDS.warning) return "warning";
  if (months <= RUNWAY_THRESHOLDS.watch) return "watch";
  return "secure";
}

export interface ProgrammeRunwayInput {
  programmeId: UUID;
  programmeName: string;
  /** Cost of running the programme for a year, from allocated actuals or budget. */
  annualOperatingCost: Money;
  /** The date current funding runs to. */
  fundedUntil: ISODate;
  /** Funding already confirmed for the period after `fundedUntil`. */
  confirmedFundingAfter: Money;
  /** Expected requirement for that following period. Defaults to the annual cost. */
  expectedRequirement?: Money;
  now: Date;
}

export interface ProgrammeRunway {
  programmeId: UUID;
  programmeName: string;
  annualOperatingCost: Money;
  monthlyOperatingCost: Money;
  fundedUntil: ISODate;
  confirmedFundingAfter: Money;
  expectedRequirement: Money;
  potentialGap: Money;
  /** Whole months of funded delivery remaining. Floors: a part month is not a month. */
  runwayMonths: number;
  state: RunwayState;
  statements: Statement[];
}

export function computeProgrammeRunway(input: ProgrammeRunwayInput): ProgrammeRunway {
  const expectedRequirement = input.expectedRequirement ?? input.annualOperatingCost;
  const gap = floorAtZero(subtractMoney(expectedRequirement, input.confirmedFundingAfter));
  const runwayMonths = wholeMonthsBetween(input.now, parseISO(input.fundedUntil));
  const monthly = divideMoney(input.annualOperatingCost, 12);
  const prefix = `runway:${input.programmeId}`;

  const statements: Statement[] = [
    fact({
      id: `${prefix}:funded-until`,
      text: `${input.programmeName} funding is secured until ${input.fundedUntil}.`,
      derivedFrom: [{ type: "programme", id: input.programmeId, label: input.programmeName }],
    }),
    fact({
      id: `${prefix}:confirmed-after`,
      text: `${formatMoney(input.confirmedFundingAfter)} of funding is confirmed after that date.`,
      derivedFrom: [{ type: "programme", id: input.programmeId, label: input.programmeName }],
    }),
    calculation({
      id: `${prefix}:months`,
      text: `Funding runway is ${runwayMonths} months.`,
      workings: `Whole months between today and ${input.fundedUntil}.`,
      derivedFrom: [{ type: "programme", id: input.programmeId }],
      supportedBy: [`${prefix}:funded-until`],
    }),
    forecast({
      id: `${prefix}:gap`,
      text: `A funding gap of ${formatMoney(gap)} is expected from ${input.fundedUntil}.`,
      workings: `${formatMoney(expectedRequirement)} expected requirement − ${formatMoney(
        input.confirmedFundingAfter,
      )} confirmed.`,
      derivedFrom: [{ type: "programme", id: input.programmeId, label: input.programmeName }],
      supportedBy: [`${prefix}:confirmed-after`, `${prefix}:months`],
      caveats: [
        "Assumes the programme continues at its current scale and cost.",
        "Funding under application is not counted; only awarded funding is confirmed.",
      ],
    }),
  ];

  return {
    programmeId: input.programmeId,
    programmeName: input.programmeName,
    annualOperatingCost: input.annualOperatingCost,
    monthlyOperatingCost: monthly,
    fundedUntil: input.fundedUntil,
    confirmedFundingAfter: input.confirmedFundingAfter,
    expectedRequirement,
    potentialGap: gap,
    runwayMonths,
    state: runwayState(runwayMonths),
    statements,
  };
}

// --- Unrestricted runway (§21) ------------------------------------------

export interface UnrestrictedRunwayInput {
  organisationId: UUID;
  /** Unrestricted reserves available to spend. Not total cash. */
  unrestrictedReserves: Money;
  /** Monthly unrestricted outgoings net of unrestricted income. */
  monthlyUnrestrictedBurn: Money;
  /** Unrestricted income already confirmed for the coming months. */
  confirmedUnrestrictedIncome?: Money;
  now: Date;
}

export interface UnrestrictedRunway {
  organisationId: UUID;
  unrestrictedReserves: Money;
  monthlyUnrestrictedBurn: Money;
  /** Months to one decimal place. `Infinity` where there is no net burn. */
  runwayMonths: number;
  state: RunwayState;
  statements: Statement[];
}

export function computeUnrestrictedRunway(input: UnrestrictedRunwayInput): UnrestrictedRunway {
  const available = input.confirmedUnrestrictedIncome
    ? addMoney(input.unrestrictedReserves, input.confirmedUnrestrictedIncome)
    : input.unrestrictedReserves;

  const burn = toMajor(input.monthlyUnrestrictedBurn);
  const months = burn <= 0 ? Number.POSITIVE_INFINITY : Math.round((toMajor(available) / burn) * 10) / 10;
  const prefix = `unrestricted-runway:${input.organisationId}`;

  const statements: Statement[] = [
    fact({
      id: `${prefix}:reserves`,
      text: `Unrestricted reserves are ${formatMoney(input.unrestrictedReserves)}.`,
      derivedFrom: [{ type: "organisation", id: input.organisationId }],
    }),
    calculation({
      id: `${prefix}:months`,
      text: Number.isFinite(months)
        ? `Unrestricted runway is ${months} months.`
        : "Unrestricted income currently covers unrestricted costs.",
      workings: `${formatMoney(available)} available ÷ ${formatMoney(input.monthlyUnrestrictedBurn)} net monthly unrestricted burn.`,
      derivedFrom: [{ type: "organisation", id: input.organisationId }],
      supportedBy: [`${prefix}:reserves`],
      caveats: ["Assumes the current burn rate continues unchanged."],
    }),
  ];

  return {
    organisationId: input.organisationId,
    unrestrictedReserves: input.unrestrictedReserves,
    monthlyUnrestrictedBurn: input.monthlyUnrestrictedBurn,
    runwayMonths: months,
    state: Number.isFinite(months) ? runwayState(months) : "secure",
    statements,
  };
}

/** True where restricted funding looks healthy but the core does not (§21). */
export function isCoreFundingConstrained(
  unrestricted: UnrestrictedRunway,
  programmeRunways: ProgrammeRunway[],
): boolean {
  if (!Number.isFinite(unrestricted.runwayMonths)) return false;
  if (unrestricted.runwayMonths > RUNWAY_THRESHOLDS.warning) return false;
  const programmesSecure = programmeRunways.every(
    (r) => r.state === "secure" || r.state === "watch" || isZero(r.potentialGap),
  );
  return programmesSecure && programmeRunways.length > 0;
}

/** Months to one decimal, for display alongside a date. */
export function monthsUntil(from: Date, date: ISODate): number {
  return fractionalMonthsBetween(from, parseISO(date));
}
