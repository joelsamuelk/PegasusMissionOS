import type { ISODate, UUID } from "@/types/domain";
import type { ConcentrationPosition } from "./concentration";
import { compareConcentration } from "./concentration";
import type { FundingCliff } from "./cliffs";
import type { FundingNeedForecast } from "./forecast";
import { formatMoney, isPositive, percentOf, subtractMoney, sumMoney, zero } from "./money";
import type { ProgrammeRunway, UnrestrictedRunway } from "./runway";
import {
  assumption,
  calculation,
  fact,
  forecast as forecastStatement,
  indexStatements,
  recommendation as recommendationStatement,
  type Statement,
  type StatementIndex,
} from "./statements";
import { describeStructuralSubsidy } from "./subsidy";
import type { ProgrammeTrend } from "./trends";
import type { CurrencyCode, EntityReference, FundingNeed, Money, StructuralSubsidy } from "./types";
import type { NeedMatchSummary } from "./need-matching";

/**
 * Finance Intelligence recommendations (§21, §23, §24, §25).
 *
 * Every recommendation is built from a chain of typed statements — facts, then
 * calculations, then forecasts, then the assumptions those rest on — and the
 * recommendation itself is the last link, never the first. That is what makes
 * "prioritise unrestricted funding" auditable rather than an opinion: the UI
 * can show the reasoning, and a person can disagree with a specific link.
 */

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface FinanceRecommendation {
  key: string;
  title: string;
  priority: RecommendationPriority;
  /** Ordered facts → calculations → forecasts → assumptions. */
  reasoning: Statement[];
  recommendation: Statement;
  derivedFrom: EntityReference[];
  /** Everything in this recommendation, indexed for `traceStatement`. */
  index: StatementIndex;
}

export interface GrantSpendPosition {
  grantId: UUID;
  title: string;
  awardValue: Money;
  /** Spend projected to the grant end date at the current rate. */
  projectedSpend: Money;
  endDate: ISODate;
}

export interface FinanceSignals {
  organisationId: UUID;
  currency: CurrencyCode;
  now: Date;
  unrestrictedRunway?: UnrestrictedRunway;
  programmeRunways?: ProgrammeRunway[];
  cliffs?: FundingCliff[];
  needs?: FundingNeed[];
  concentration?: ConcentrationPosition;
  previousConcentration?: ConcentrationPosition;
  trends?: ProgrammeTrend[];
  structuralSubsidies?: Array<{ programmeName: string; subsidy: StructuralSubsidy }>;
  grantSpend?: GrantSpendPosition[];
}

export function generateFinanceRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  const out: FinanceRecommendation[] = [
    ...coreFundingRecommendations(signals),
    ...replacementFundingRecommendations(signals),
    ...concentrationRecommendations(signals),
    ...deliveryCostRecommendations(signals),
    ...grantUnderspendRecommendations(signals),
    ...structuralSubsidyRecommendations(signals),
  ];
  return out.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function assemble(
  key: string,
  title: string,
  priority: RecommendationPriority,
  reasoning: Statement[],
  recommendation: Statement,
): FinanceRecommendation {
  const derivedFrom = new Map<string, EntityReference>();
  for (const statement of [...reasoning, recommendation]) {
    for (const ref of statement.derivedFrom) derivedFrom.set(`${ref.type}:${ref.id}`, ref);
  }
  return {
    key,
    title,
    priority,
    reasoning,
    recommendation,
    derivedFrom: [...derivedFrom.values()],
    index: indexStatements([...reasoning, recommendation]),
  };
}

// --- §21 Core funding ----------------------------------------------------

export type PositionState = "strong" | "adequate" | "needs_attention";

export interface FundingPosition {
  restricted: { state: PositionState; reason: string };
  unrestricted: { state: PositionState; reason: string; runwayMonths?: number };
  /** True where restricted funding is healthy but the core is not (§21). */
  coreConstrained: boolean;
  headline: string;
}

/**
 * §21. The problem an NGO most often has is not "we need another programme
 * grant" — it is plenty of restricted money and nothing to run the
 * organisation with. Restricted and unrestricted positions are therefore
 * assessed separately and never netted.
 */
export function assessFundingPosition(signals: FinanceSignals): FundingPosition {
  const runways = signals.programmeRunways ?? [];
  const gapped = runways.filter((r) => isPositive(r.potentialGap) && r.runwayMonths <= 12);
  const restrictedState: PositionState =
    runways.length === 0
      ? "needs_attention"
      : gapped.length === 0
        ? "strong"
        : gapped.length <= runways.length / 2
          ? "adequate"
          : "needs_attention";

  const restrictedReason =
    runways.length === 0
      ? "No programme funding runway has been calculated."
      : gapped.length === 0
        ? `All ${runways.length} programme(s) are funded beyond the next 12 months.`
        : `${gapped.length} of ${runways.length} programme(s) have a funding gap inside 12 months.`;

  const months = signals.unrestrictedRunway?.runwayMonths;
  const unrestrictedState: PositionState =
    months === undefined
      ? "needs_attention"
      : !Number.isFinite(months) || months >= 9
        ? "strong"
        : months >= 6
          ? "adequate"
          : "needs_attention";

  const unrestrictedReason =
    months === undefined
      ? "No unrestricted runway has been calculated."
      : !Number.isFinite(months)
        ? "Unrestricted income currently covers unrestricted costs."
        : `Unrestricted runway is ${months} months.`;

  const coreConstrained = restrictedState === "strong" && unrestrictedState === "needs_attention";

  return {
    restricted: { state: restrictedState, reason: restrictedReason },
    unrestricted: {
      state: unrestrictedState,
      reason: unrestrictedReason,
      ...(months !== undefined ? { runwayMonths: months } : {}),
    },
    coreConstrained,
    headline: coreConstrained
      ? "Restricted programme funding is strong; the unrestricted operating position needs attention."
      : restrictedState === "needs_attention" && unrestrictedState === "needs_attention"
        ? "Both restricted and unrestricted positions need attention."
        : "No structural imbalance detected between restricted and unrestricted funding.",
  };
}

function coreFundingRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  const position = assessFundingPosition(signals);
  const runway = signals.unrestrictedRunway;
  if (!position.coreConstrained || !runway) return [];

  const orgRef: EntityReference = { type: "organisation", id: signals.organisationId };
  const reasoning: Statement[] = [
    ...runway.statements,
    fact({
      id: "core-funding:restricted",
      text: position.restricted.reason,
      derivedFrom: [orgRef],
    }),
    assumption({
      id: "core-funding:burn",
      text: "The current unrestricted burn rate continues, and no new unrestricted income arrives.",
      derivedFrom: [orgRef],
    }),
  ];

  return [
    assemble(
      "core-funding-priority",
      "Prioritise core and unrestricted funding",
      runway.runwayMonths <= 3 ? "critical" : "high",
      reasoning,
      recommendationStatement({
        id: "core-funding:recommendation",
        text: "Prioritise core and unrestricted funding opportunities over additional restricted programme funding.",
        derivedFrom: [orgRef],
        supportedBy: [
          `unrestricted-runway:${signals.organisationId}:months`,
          "core-funding:restricted",
          "core-funding:burn",
        ],
        caveats: [
          "Restricted programme funding remains worth pursuing where it also carries a fair contribution to overheads.",
        ],
      }),
    ),
  ];
}

// --- §24 Replacement funding --------------------------------------------

function replacementFundingRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  const runways = (signals.programmeRunways ?? []).filter(
    (r) => isPositive(r.potentialGap) && r.state !== "secure",
  );

  return runways.map((runway) => {
    const cliff = (signals.cliffs ?? []).find((c) => c.programmeId === runway.programmeId);
    const reasoning: Statement[] = [...runway.statements, ...(cliff?.statements ?? [])];
    const programmeRef: EntityReference = {
      type: "programme",
      id: runway.programmeId,
      label: runway.programmeName,
    };

    return assemble(
      `replacement-funding:${runway.programmeId}`,
      `${runway.programmeName} needs replacement funding`,
      runway.state === "critical" ? "critical" : runway.state === "warning" ? "high" : "medium",
      reasoning,
      recommendationStatement({
        id: `replacement-funding:${runway.programmeId}:recommendation`,
        text: `${runway.programmeName} requires replacement funding within approximately ${runway.runwayMonths} months. Begin identifying opportunities now, allowing for application and decision time.`,
        derivedFrom: [programmeRef],
        supportedBy: [`runway:${runway.programmeId}:gap`, `runway:${runway.programmeId}:months`],
      }),
    );
  });
}

// --- §24 Concentration ---------------------------------------------------

function concentrationRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  const current = signals.concentration;
  if (!current || !current.largest) return [];

  const orgRef: EntityReference = { type: "organisation", id: signals.organisationId };
  const movement = signals.previousConcentration
    ? compareConcentration(signals.previousConcentration, current)
    : null;

  const material = current.level === "severe" || current.level === "high";
  const increased = movement?.direction === "increase";
  if (!material && !increased) return [];

  const reasoning: Statement[] = [
    fact({
      id: "concentration:largest",
      text: `${current.largest.funderName} provides ${current.largest.sharePercent}% of income in scope.`,
      derivedFrom: [
        orgRef,
        { type: "funder", id: current.largest.funderId, label: current.largest.funderName },
      ],
    }),
    calculation({
      id: "concentration:level",
      text: `Funding concentration is ${current.level}.`,
      workings: current.reasons.join(" "),
      derivedFrom: [orgRef],
      supportedBy: ["concentration:largest"],
    }),
  ];

  if (movement) {
    reasoning.push(
      calculation({
        id: "concentration:movement",
        text: movement.text,
        workings: `${movement.deltaPercentagePoints} percentage point change in the largest funder's share.`,
        derivedFrom: [orgRef],
        supportedBy: ["concentration:largest"],
      }),
    );
  }

  return [
    assemble(
      "funding-concentration",
      "Funding concentration",
      current.level === "severe" ? "high" : "medium",
      reasoning,
      recommendationStatement({
        id: "concentration:recommendation",
        text: `Weigh diversification when prioritising opportunities. Replacing ${current.largest.funderName} with another single large funder would leave concentration unchanged.`,
        derivedFrom: [orgRef],
        supportedBy: ["concentration:level", ...(movement ? ["concentration:movement"] : [])],
        caveats: [
          "Concentration is not automatically a risk; a committed long-term funder can be more stable than many small grants.",
        ],
      }),
    ),
  ];
}

// --- §24 Delivery cost movement -----------------------------------------

function deliveryCostRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  const out: FinanceRecommendation[] = [];

  for (const trend of signals.trends ?? []) {
    const rising = trend.comparisons.filter(
      (c) => c.direction === "increase" && (c.changePercent ?? 0) >= 15,
    );
    if (rising.length === 0) continue;

    const programmeRef: EntityReference = { type: "programme", id: trend.programmeId };
    const reasoning: Statement[] = rising.map((comparison, index) =>
      calculation({
        id: `delivery-cost:${trend.programmeId}:${index}`,
        text: `${comparison.metric.replace(/_/g, " ")} moved from ${formatMoney(
          comparison.baseline ?? zero(signals.currency),
        )} to ${formatMoney(comparison.current ?? zero(signals.currency))} (${comparison.changePercent}%).`,
        workings: `${comparison.baselinePeriod.label} against ${comparison.currentPeriod.label}.`,
        derivedFrom: [programmeRef],
        caveats: comparison.caveats,
      }),
    );

    for (const observation of trend.observations) {
      reasoning.push(
        calculation({
          id: `delivery-cost:${trend.programmeId}:${observation.key}`,
          text: observation.text,
          derivedFrom: [programmeRef],
          caveats: observation.caveats,
        }),
      );
    }

    out.push(
      assemble(
        `delivery-cost:${trend.programmeId}`,
        "Delivery costs have moved materially",
        "medium",
        reasoning,
        recommendationStatement({
          id: `delivery-cost:${trend.programmeId}:recommendation`,
          text: "Review what changed in delivery, cost base or measurement between these periods before treating this as a cost problem or a saving.",
          derivedFrom: [programmeRef],
          supportedBy: reasoning.map((s) => s.id),
          caveats: ["An observed movement is not evidence that the programme became less efficient."],
        }),
      ),
    );
  }

  return out;
}

// --- §24 Grant underspend ------------------------------------------------

function grantUnderspendRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  return (signals.grantSpend ?? [])
    .map((grant) => {
      const underspend = subtractMoney(grant.awardValue, grant.projectedSpend);
      const share = percentOf(underspend, grant.awardValue) ?? 0;
      if (underspend.minorUnits <= 0 || share < 5) return null;

      const grantRef: EntityReference = { type: "grant", id: grant.grantId, label: grant.title };
      const reasoning: Statement[] = [
        fact({
          id: `underspend:${grant.grantId}:award`,
          text: `${grant.title} is a ${formatMoney(grant.awardValue)} award ending ${grant.endDate}.`,
          derivedFrom: [grantRef],
        }),
        forecastStatement({
          id: `underspend:${grant.grantId}:projection`,
          text: `Projected spend to the end date is ${formatMoney(grant.projectedSpend)}, an underspend of ${formatMoney(underspend)} (${Math.round(share)}%).`,
          workings: `${formatMoney(grant.awardValue)} award − ${formatMoney(grant.projectedSpend)} projected spend.`,
          derivedFrom: [grantRef],
          supportedBy: [`underspend:${grant.grantId}:award`],
          caveats: ["Projected at the current spend rate; delivery plans may change this."],
        }),
      ];

      return assemble(
        `grant-underspend:${grant.grantId}`,
        `${grant.title} appears likely to finish with an underspend`,
        share >= 15 ? "high" : "medium",
        reasoning,
        recommendationStatement({
          id: `underspend:${grant.grantId}:recommendation`,
          text: "Discuss the projected underspend with the funder early. Most will consider a variation or extension; few respond well to being told after the end date.",
          derivedFrom: [grantRef],
          supportedBy: [`underspend:${grant.grantId}:projection`],
        }),
      );
    })
    .filter((r): r is FinanceRecommendation => r !== null);
}

// --- §6 Structural subsidy ----------------------------------------------

function structuralSubsidyRecommendations(signals: FinanceSignals): FinanceRecommendation[] {
  return (signals.structuralSubsidies ?? [])
    .map(({ programmeName, subsidy }) => {
      const narrative = describeStructuralSubsidy(subsidy, programmeName);
      if (!narrative) return null;

      const programmeRef: EntityReference = {
        type: "programme",
        id: subsidy.programmeId,
        label: programmeName,
      };
      const reasoning: Statement[] = [
        calculation({
          id: `subsidy:${subsidy.programmeId}:pattern`,
          text: narrative,
          workings: subsidy.periods
            .map((p) => `${p.period.label}: ${formatMoney(p.unrestrictedContribution)} (${p.subsidyPercent}%)`)
            .join("; "),
          derivedFrom: [programmeRef],
        }),
      ];

      return assemble(
        `structural-subsidy:${subsidy.programmeId}`,
        `${programmeName} relies on unrestricted subsidy`,
        "medium",
        reasoning,
        recommendationStatement({
          id: `subsidy:${subsidy.programmeId}:recommendation`,
          text: `Build the unrestricted contribution into future ${programmeName} funding applications as full cost recovery, or decide deliberately to keep subsidising it.`,
          derivedFrom: [programmeRef],
          supportedBy: [`subsidy:${subsidy.programmeId}:pattern`],
        }),
      );
    })
    .filter((r): r is FinanceRecommendation => r !== null);
}

// --- §23 Mission Control -------------------------------------------------

export interface LookingAheadItem {
  needId: UUID;
  programmeId?: UUID;
  title: string;
  gap: Money;
  from: ISODate;
  priority: FundingNeed["priority"];
  strongMatches: number;
  totalMatches: number;
  earliestDeadline?: ISODate;
  caveat?: string;
}

/**
 * §23. Material future needs, surfaced while there is still time to act on
 * them. Ordered by when the money is needed, not by size — a £40k gap in four
 * months is more urgent than a £400k gap in two years.
 */
export function buildLookingAhead(
  needs: FundingNeed[],
  matches: Record<string, NeedMatchSummary> = {},
): LookingAheadItem[] {
  return needs
    .filter((need) => isPositive(need.fundingGap))
    .sort((a, b) => a.needFrom.localeCompare(b.needFrom))
    .map((need) => {
      const summary = matches[need.id];
      return {
        needId: need.id,
        ...(need.programmeId ? { programmeId: need.programmeId } : {}),
        title: need.title,
        gap: need.fundingGap,
        from: need.needFrom,
        priority: need.priority,
        strongMatches: summary?.strong ?? 0,
        totalMatches: summary?.total ?? 0,
        ...(summary?.earliestDeadline ? { earliestDeadline: summary.earliestDeadline } : {}),
        ...(summary ? { caveat: summary.caveat } : {}),
      };
    });
}

// --- §25 Executive summary ----------------------------------------------

export interface FinancialSecuritySummary {
  horizonMonths: number;
  headline: Statement;
  supporting: Statement[];
  strengths: string[];
  concerns: string[];
  /** Indexed so the UI can walk from the headline down to the records. */
  index: StatementIndex;
}

/**
 * §25. "How financially secure are we over the next 18 months?"
 *
 * The answer is assembled from the forecast, the runways and the cliffs, and
 * every claim in it carries `supportedBy`, so `traceStatement` walks from the
 * headline down to a programme budget, a grant end date and the assumptions
 * used — which is the whole point of the exercise.
 */
export function summariseFinancialSecurity(
  signals: FinanceSignals,
  forecast: FundingNeedForecast,
): FinancialSecuritySummary {
  const orgRef: EntityReference = { type: "organisation", id: signals.organisationId };
  const coverage = percentOf(forecast.totals.secured, forecast.totals.requirement) ?? 0;
  const supporting: Statement[] = [];

  supporting.push(
    fact({
      id: "security:requirement",
      text: `Expected requirement over the next ${forecast.horizonMonths} months is ${formatMoney(forecast.totals.requirement)}.`,
      derivedFrom: [orgRef],
    }),
    fact({
      id: "security:confirmed",
      text: `${formatMoney(forecast.totals.byCertainty.confirmed)} of income is confirmed; ${formatMoney(
        forecast.totals.byCertainty.expected,
      )} is expected but not awarded.`,
      derivedFrom: [orgRef],
    }),
    calculation({
      id: "security:coverage",
      text: `Confirmed income covers ${Math.round(coverage)}% of the expected requirement.`,
      workings: `${formatMoney(forecast.totals.secured)} confirmed ÷ ${formatMoney(forecast.totals.requirement)} requirement.`,
      derivedFrom: [orgRef],
      supportedBy: ["security:requirement", "security:confirmed"],
    }),
  );

  for (const assumptionText of forecast.assumptions) {
    supporting.push(
      assumption({
        id: `security:assumption:${supporting.length}`,
        text: assumptionText,
        derivedFrom: [orgRef],
      }),
    );
  }

  const cliffs = (signals.cliffs ?? []).filter((c) => isPositive(c.potentialGap));
  for (const cliff of cliffs) supporting.push(...cliff.statements);
  for (const runway of signals.programmeRunways ?? []) supporting.push(...runway.statements);
  if (signals.unrestrictedRunway) supporting.push(...signals.unrestrictedRunway.statements);

  const cliffTotal = sumMoney(cliffs.map((c) => c.potentialGap), signals.currency);

  const headline = forecastStatement({
    id: "security:headline",
    text: forecast.firstGapPeriod
      ? `Confirmed income covers ${Math.round(coverage)}% of the next ${forecast.horizonMonths} months. The first uncovered quarter is ${forecast.firstGapPeriod.label}, and ${formatMoney(cliffTotal)} of programme funding is at risk from expiring grants.`
      : `Confirmed income covers the expected requirement across the next ${forecast.horizonMonths} months.`,
    derivedFrom: [orgRef],
    supportedBy: [
      "security:coverage",
      ...cliffs.map((c) => `cliff:${c.key}:gap`),
      ...(signals.unrestrictedRunway ? [`unrestricted-runway:${signals.organisationId}:months`] : []),
    ],
    caveats: [
      "Forecast, not a position. Expected and scenario income is excluded from the confirmed figure.",
    ],
  });

  const position = assessFundingPosition(signals);
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (position.restricted.state === "strong") strengths.push(position.restricted.reason);
  else concerns.push(position.restricted.reason);
  if (position.unrestricted.state === "strong") strengths.push(position.unrestricted.reason);
  else concerns.push(position.unrestricted.reason);
  if (cliffs.length > 0) {
    concerns.push(
      `${cliffs.length} funding cliff(s) inside the horizon, totalling ${formatMoney(cliffTotal)}.`,
    );
  }
  if (signals.concentration && signals.concentration.level !== "low") {
    concerns.push(
      `Funding concentration is ${signals.concentration.level}: ${signals.concentration.reasons[0] ?? ""}`.trim(),
    );
  }

  return {
    horizonMonths: forecast.horizonMonths,
    headline,
    supporting,
    strengths,
    concerns,
    index: indexStatements([headline, ...supporting]),
  };
}
