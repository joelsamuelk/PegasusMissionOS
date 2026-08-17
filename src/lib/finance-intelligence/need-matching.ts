import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  FitAssessment,
  FitCategory,
  FitFactor,
  FundingOpportunity,
  ISODate,
} from "@/types/domain";
import { fromMajor, toMajor } from "./money";
import { wholeMonthsBetween } from "./period";
import type { FundingNeed, FundingNeedType, Money } from "./types";

/**
 * Need-aware opportunity matching (§17, §18).
 *
 * This does **not** replace the existing deterministic fit assessment. That
 * scorer answers "does this funder fund organisations like us?" and is
 * untouched. This module answers the different question §17 asks — "could this
 * opportunity close *this specific future gap*?" — by layering need-specific
 * factors (amount, timing, duration, funding type) on top of it.
 *
 * The one thing it must never do is imply the gap is closed. `MATCH_CAVEAT`
 * ships with every match, and gap coverage is always a range described as
 * potential.
 */

export const MATCH_CAVEAT =
  "An opportunity reduces a funding gap only once an award is secured. Coverage shown is potential, based on the funder's published award range.";

export interface GapCoverage {
  /** Potential coverage of the gap at the bottom of the award range, 0..100. */
  minPercent: number;
  /** …and at the top. Capped at 100. */
  maxPercent: number;
  minAward?: Money;
  maxAward?: Money;
  basis: string;
}

export interface NeedMatchInput {
  need: FundingNeed;
  opportunity: FundingOpportunity;
  /**
   * The organisation-level fit produced by `assessFit`, unchanged. Optional:
   * a need match is still useful before fit has been assessed, it is simply
   * scored on the need factors alone.
   */
  fit?: Pick<FitAssessment, "overallScore" | "category" | "eligibilityStatus" | "factors">;
  /** Months a funder typically takes from deadline to decision. */
  decisionLeadMonths?: number;
  now: Date;
}

export interface NeedMatch {
  needId: string;
  opportunityId: string;
  funderId: string;
  /** Need-specific factors only. Organisation fit factors stay on the fit assessment. */
  needFactors: FitFactor[];
  needScore: number;
  organisationFitScore?: number;
  combinedScore: number;
  strength: FitCategory;
  gapCoverage?: GapCoverage;
  /** The "why it matches" list. Only met factors appear. */
  whyItMatches: string[];
  /** Things a person must check before pursuing. */
  watchItems: string[];
  caveat: string;
}

/** Which opportunity funding types can serve which need types. */
const TYPE_COMPATIBILITY: Record<FundingNeedType, string[]> = {
  core: ["core", "unrestricted"],
  project: ["project", "restricted"],
  programme: ["project", "restricted", "core"],
  capital: ["capital"],
  capacity: ["core", "unrestricted", "project"],
  research: ["project", "restricted"],
  emergency: ["core", "unrestricted", "project"],
  other: ["project", "restricted", "core", "unrestricted", "capital"],
};

export function assessNeedMatch(input: NeedMatchInput): NeedMatch {
  const { need, opportunity } = input;
  const leadMonths = input.decisionLeadMonths ?? 4;
  const watchItems: string[] = [];

  const gapCoverage = computeGapCoverage(need, opportunity);
  const factors: FitFactor[] = [
    fundingTypeFactor(need, opportunity),
    amountFactor(need, opportunity, gapCoverage),
    timingFactor(need, opportunity, leadMonths, input.now, watchItems),
    durationFactor(need, opportunity),
  ];

  const needScore = weighted(factors);
  const organisationFitScore = input.fit?.overallScore;
  const combinedScore =
    organisationFitScore === undefined
      ? needScore
      : Math.round(organisationFitScore * 0.6 + needScore * 0.4);

  const eligibilityUnmet = input.fit?.eligibilityStatus === "unmet";
  const strength: FitCategory = eligibilityUnmet
    ? "not_eligible"
    : combinedScore >= 75
      ? "strong_match"
      : combinedScore >= 55
        ? "potential_match"
        : "review_required";

  const whyItMatches = [
    ...(input.fit?.factors ?? []).filter((f) => f.status === "met").map((f) => f.rationale),
    ...factors.filter((f) => f.status === "met").map((f) => f.rationale),
  ];

  if (opportunity.reportingRequirements.length > 3) {
    watchItems.push("Heavy reporting requirements relative to the award.");
  }
  if (opportunity.requiredDocuments.length > 4) {
    watchItems.push(`${opportunity.requiredDocuments.length} documents are required.`);
  }
  if (need.confidence.level === "low") {
    watchItems.push("The underlying funding need is low confidence; confirm the figure before applying.");
  }
  if (need.verificationState !== "verified") {
    watchItems.push("This funding need has not been approved internally.");
  }

  return {
    needId: need.id,
    opportunityId: opportunity.id,
    funderId: opportunity.funderId,
    needFactors: factors,
    needScore,
    ...(organisationFitScore !== undefined ? { organisationFitScore } : {}),
    combinedScore,
    strength,
    ...(gapCoverage ? { gapCoverage } : {}),
    whyItMatches,
    watchItems,
    caveat: MATCH_CAVEAT,
  };
}

export interface NeedMatchSummary {
  needId: string;
  total: number;
  strong: number;
  potential: number;
  earliestDeadline?: ISODate;
  /** Best-case combined coverage if every strong match landed at its maximum. */
  bestCaseCoveragePercent: number;
  caveat: string;
}

/**
 * §18's headline: "11 potentially relevant opportunities, 3 strong matches".
 *
 * `bestCaseCoveragePercent` is deliberately named for what it is. It assumes
 * every strong match is awarded at its maximum, which will not happen.
 */
export function summariseNeedMatches(
  needId: string,
  matches: NeedMatch[],
  deadlines: Record<string, ISODate | undefined> = {},
): NeedMatchSummary {
  const relevant = matches.filter((m) => m.strength !== "not_eligible");
  const strong = relevant.filter((m) => m.strength === "strong_match");

  const deadlineList = relevant
    .map((m) => deadlines[m.opportunityId])
    .filter((d): d is ISODate => Boolean(d))
    .sort();

  const bestCase = Math.min(
    100,
    Math.round(strong.reduce((sum, m) => sum + (m.gapCoverage?.maxPercent ?? 0), 0)),
  );

  return {
    needId,
    total: relevant.length,
    strong: strong.length,
    potential: relevant.filter((m) => m.strength === "potential_match").length,
    ...(deadlineList[0] ? { earliestDeadline: deadlineList[0] } : {}),
    bestCaseCoveragePercent: bestCase,
    caveat: MATCH_CAVEAT,
  };
}

// --- Factors -------------------------------------------------------------

function computeGapCoverage(need: FundingNeed, opportunity: FundingOpportunity): GapCoverage | undefined {
  if (need.fundingGap.currency !== opportunity.currency) return undefined;
  const gap = toMajor(need.fundingGap);
  if (gap <= 0) return undefined;
  if (opportunity.minAward === undefined && opportunity.maxAward === undefined) return undefined;

  const min = opportunity.minAward ?? opportunity.maxAward ?? 0;
  const max = opportunity.maxAward ?? opportunity.minAward ?? 0;

  return {
    minPercent: Math.min(100, Math.round((min / gap) * 100)),
    maxPercent: Math.min(100, Math.round((max / gap) * 100)),
    minAward: fromMajor(min, opportunity.currency),
    maxAward: fromMajor(max, opportunity.currency),
    basis: `Award range against a ${new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: need.fundingGap.currency,
      maximumFractionDigits: 0,
    }).format(gap)} gap.`,
  };
}

function fundingTypeFactor(need: FundingNeed, opportunity: FundingOpportunity): FitFactor {
  const compatible = TYPE_COMPATIBILITY[need.fundingType] ?? [];
  const met = compatible.includes(opportunity.fundingType);
  return {
    key: "need_funding_type",
    label: "Funding type",
    status: met ? "met" : "unmet",
    score: met ? 100 : 20,
    weight: 2,
    rationale: met
      ? `Offers ${opportunity.fundingType} funding, which can meet a ${need.fundingType} need.`
      : `Offers ${opportunity.fundingType} funding, which does not meet a ${need.fundingType} need.`,
    evidenceUsed: ["Funding need type", "Opportunity funding type"],
    assumptions: met ? [] : ["Some funders flex on restriction; confirm before ruling out."],
  };
}

function amountFactor(
  need: FundingNeed,
  opportunity: FundingOpportunity,
  coverage?: GapCoverage,
): FitFactor {
  if (!coverage) {
    return {
      key: "need_amount",
      label: "Amount fit",
      status: "uncertain",
      score: 50,
      weight: 2,
      rationale:
        need.fundingGap.currency !== opportunity.currency
          ? "The award range is in a different currency from the funding need."
          : "The funder has not published an award range.",
      evidenceUsed: ["Funding gap", "Award range"],
      assumptions: ["Award size will need to be confirmed with the funder."],
    };
  }

  const status = coverage.maxPercent >= 50 ? "met" : coverage.maxPercent >= 20 ? "partial" : "uncertain";
  return {
    key: "need_amount",
    label: "Amount fit",
    status,
    score: Math.min(100, coverage.maxPercent + 20),
    weight: 2,
    rationale: `Could potentially cover up to ${coverage.maxPercent}% of the gap (${coverage.basis})`,
    evidenceUsed: ["Funding gap", "Award range"],
    assumptions: ["Assumes an award at the published range; most awards land below the maximum."],
  };
}

function timingFactor(
  need: FundingNeed,
  opportunity: FundingOpportunity,
  leadMonths: number,
  now: Date,
  watchItems: string[],
): FitFactor {
  if (!opportunity.deadline) {
    return {
      key: "need_timing",
      label: "Timing fit",
      status: "uncertain",
      score: 50,
      weight: 2.5,
      rationale: "No deadline is recorded, so alignment with the funding timeline is unknown.",
      evidenceUsed: ["Need start date"],
      assumptions: ["Confirm the funder's application windows."],
    };
  }

  const deadline = parseISO(opportunity.deadline);
  const needFrom = parseISO(need.needFrom);
  const daysToDeadline = differenceInCalendarDays(deadline, now);
  // Signed: negative means the deadline falls after the money is needed.
  const monthsFromDeadlineToNeed = wholeMonthsBetween(deadline, needFrom);
  const deadlineAfterNeed = differenceInCalendarDays(needFrom, deadline) < 0;

  if (daysToDeadline < 0) {
    return {
      key: "need_timing",
      label: "Timing fit",
      status: "unmet",
      score: 0,
      weight: 2.5,
      rationale: `The deadline (${opportunity.deadline}) has passed.`,
      evidenceUsed: ["Opportunity deadline"],
      assumptions: ["The funder may reopen; check for the next round."],
    };
  }

  if (deadlineAfterNeed) {
    watchItems.push("The funding is needed before this deadline falls.");
    return {
      key: "need_timing",
      label: "Timing fit",
      status: "unmet",
      score: 10,
      weight: 2.5,
      rationale: `The deadline (${opportunity.deadline}) falls after the funding is needed (${need.needFrom}).`,
      evidenceUsed: ["Opportunity deadline", "Need start date"],
      assumptions: [],
    };
  }

  if (monthsFromDeadlineToNeed < leadMonths) {
    watchItems.push(
      `Only ${monthsFromDeadlineToNeed} month(s) between deadline and need; a decision may not arrive in time.`,
    );
    return {
      key: "need_timing",
      label: "Timing fit",
      status: "partial",
      score: 55,
      weight: 2.5,
      rationale: `The deadline is ${monthsFromDeadlineToNeed} month(s) before the funding is needed, against a typical ${leadMonths}-month decision period.`,
      evidenceUsed: ["Opportunity deadline", "Need start date"],
      assumptions: [`Assumes a ${leadMonths}-month decision period.`],
    };
  }

  if (daysToDeadline < 21) {
    watchItems.push(`The deadline is ${daysToDeadline} days away.`);
  }

  return {
    key: "need_timing",
    label: "Timing fit",
    status: "met",
    score: 95,
    weight: 2.5,
    rationale: `Deadline ${opportunity.deadline} allows a decision before funding is needed in ${need.needFrom}.`,
    evidenceUsed: ["Opportunity deadline", "Need start date"],
    assumptions: [`Assumes a ${leadMonths}-month decision period.`],
  };
}

function durationFactor(need: FundingNeed, opportunity: FundingOpportunity): FitFactor {
  if (!opportunity.fundingDurationMonths || !need.needUntil) {
    return {
      key: "need_duration",
      label: "Duration fit",
      status: "uncertain",
      score: 55,
      weight: 1,
      rationale: "The funding period or the need period is not fully specified.",
      evidenceUsed: ["Need period", "Funding duration"],
      assumptions: [],
    };
  }

  const needMonths = wholeMonthsBetween(parseISO(need.needFrom), parseISO(need.needUntil));
  const ratio = needMonths > 0 ? opportunity.fundingDurationMonths / needMonths : 1;
  const status = ratio >= 0.9 ? "met" : ratio >= 0.5 ? "partial" : "uncertain";
  return {
    key: "need_duration",
    label: "Duration fit",
    status,
    score: Math.min(100, Math.round(ratio * 100)),
    weight: 1,
    rationale: `Funds ${opportunity.fundingDurationMonths} months against a ${needMonths}-month need.`,
    evidenceUsed: ["Need period", "Funding duration"],
    assumptions:
      status === "met" ? [] : ["A shorter award leaves a residual gap that will need covering."],
  };
}

function weighted(factors: FitFactor[]): number {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight);
}
