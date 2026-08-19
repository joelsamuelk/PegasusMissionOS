import { addMonths, isAfter, isBefore, parseISO } from "date-fns";
import type { ISODate, UUID } from "@/types/domain";
import { floorAtZero, formatMoney, subtractMoney, sumMoney, zero } from "./money";
import { quarterKey, wholeMonthsBetween } from "./period";
import { fact, forecast, type Statement } from "./statements";
import type { CurrencyCode, Money } from "./types";

/**
 * Grant expiry intelligence (§15).
 *
 * A funding cliff is not a surprise event — the end date was known on the day
 * the grant was awarded. The failure is one of timing: it surfaces when the
 * final payment lands, which is months after the point where anything could
 * have been done about it. This module reads end dates forward.
 */

export type CliffSeverity = "critical" | "high" | "medium" | "low";

export type Continuity = "expected" | "not_expected" | "unknown";

export interface ExpiringFunding {
  grantId: UUID;
  grantTitle: string;
  funderId?: UUID;
  funderName?: string;
  programmeId?: UUID;
  programmeName?: string;
  /** Annualised funding this grant provides to the programme. */
  annualAmount: Money;
  endDate: ISODate;
  restricted: boolean;
}

export interface FundingCliffInput {
  expiring: ExpiringFunding[];
  /** Whether each programme is expected to continue past the expiry. */
  continuity?: Record<string, Continuity>;
  /** Replacement funding already secured, keyed by programme id. */
  replacementSecured?: Record<string, Money>;
  currency: CurrencyCode;
  /** How far ahead to look. 24 months by default — a full fundraising cycle plus slack. */
  horizonMonths?: number;
  now: Date;
}

export interface FundingCliff {
  key: string;
  programmeId?: UUID;
  programmeName: string;
  /** Earliest expiry in the group. */
  expiryDate: ISODate;
  expiringAmount: Money;
  grants: ExpiringFunding[];
  programmeExpectedToContinue: Continuity;
  replacementSecured: Money;
  potentialGap: Money;
  monthsUntil: number;
  severity: CliffSeverity;
  statements: Statement[];
}

/**
 * Grants expiring within the horizon, grouped per programme and quarter.
 *
 * Grouping by quarter rather than by exact date is deliberate: two grants
 * ending five weeks apart are one cliff to a fundraiser, while grants ending a
 * year apart are two separate problems.
 */
export function detectFundingCliffs(input: FundingCliffInput): FundingCliff[] {
  const horizon = addMonths(input.now, input.horizonMonths ?? 24);
  const currency = input.currency;

  const inHorizon = input.expiring.filter((grant) => {
    const end = parseISO(grant.endDate);
    return !isBefore(end, input.now) && !isAfter(end, horizon);
  });

  const groups = new Map<string, ExpiringFunding[]>();
  for (const grant of inHorizon) {
    const key = `${grant.programmeId ?? "unattributed"}:${quarterKey(parseISO(grant.endDate))}`;
    groups.set(key, [...(groups.get(key) ?? []), grant]);
  }

  const cliffs: FundingCliff[] = [];
  for (const [key, grants] of groups) {
    const sorted = [...grants].sort((a, b) => a.endDate.localeCompare(b.endDate));
    const first = sorted[0];
    if (!first) continue;

    const programmeId = first.programmeId;
    const programmeName = first.programmeName ?? "Unattributed funding";
    const expiringAmount = sumMoney(sorted.map((g) => g.annualAmount), currency);
    const continuity = (programmeId ? input.continuity?.[programmeId] : undefined) ?? "unknown";
    const replacement = (programmeId ? input.replacementSecured?.[programmeId] : undefined) ?? zero(currency);
    const gap = floorAtZero(subtractMoney(expiringAmount, replacement));
    const months = wholeMonthsBetween(input.now, parseISO(first.endDate));

    cliffs.push({
      key,
      ...(programmeId ? { programmeId } : {}),
      programmeName,
      expiryDate: first.endDate,
      expiringAmount,
      grants: sorted,
      programmeExpectedToContinue: continuity,
      replacementSecured: replacement,
      potentialGap: gap,
      monthsUntil: months,
      severity: severityOf(gap, months, continuity),
      statements: cliffStatements(key, programmeName, sorted, expiringAmount, replacement, gap, continuity),
    });
  }

  return cliffs.sort(
    (a, b) => a.monthsUntil - b.monthsUntil || b.potentialGap.minorUnits - a.potentialGap.minorUnits,
  );
}

function severityOf(gap: Money, monthsUntil: number, continuity: Continuity): CliffSeverity {
  if (gap.minorUnits <= 0) return "low";
  if (continuity === "not_expected") return "low";
  if (monthsUntil <= 6) return "critical";
  if (monthsUntil <= 12) return "high";
  if (monthsUntil <= 24) return "medium";
  return "low";
}

function cliffStatements(
  key: string,
  programmeName: string,
  grants: ExpiringFunding[],
  expiringAmount: Money,
  replacement: Money,
  gap: Money,
  continuity: Continuity,
): Statement[] {
  const prefix = `cliff:${key}`;
  const refs = grants.map((g) => ({ type: "grant" as const, id: g.grantId, label: g.grantTitle }));

  const statements: Statement[] = [
    fact({
      id: `${prefix}:expiring`,
      text: `${formatMoney(expiringAmount)} of annual funding for ${programmeName} expires on ${grants[0]?.endDate}.`,
      derivedFrom: refs,
    }),
    fact({
      id: `${prefix}:replacement`,
      text: `${formatMoney(replacement)} of replacement funding is secured.`,
      derivedFrom: refs,
    }),
  ];

  if (continuity === "expected") {
    statements.push(
      forecast({
        id: `${prefix}:gap`,
        text: `A potential gap of ${formatMoney(gap)} arises if ${programmeName} continues at its current scale.`,
        workings: `${formatMoney(expiringAmount)} expiring − ${formatMoney(replacement)} replacement secured.`,
        derivedFrom: refs,
        supportedBy: [`${prefix}:expiring`, `${prefix}:replacement`],
        caveats: ["Assumes the programme continues at its current scale and cost."],
      }),
    );
  } else {
    statements.push(
      fact({
        id: `${prefix}:continuity`,
        text:
          continuity === "not_expected"
            ? `${programmeName} is not expected to continue past this date, so no replacement funding is assumed.`
            : `Whether ${programmeName} continues past this date has not been recorded, so no gap is asserted.`,
        derivedFrom: refs,
        supportedBy: [`${prefix}:expiring`],
      }),
    );
  }

  return statements;
}
