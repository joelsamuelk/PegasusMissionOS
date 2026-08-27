import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Claim,
  Commitment,
  EntityReference,
  EvidenceItem,
  ImpactReport,
  Indicator,
  ReportRequirement,
  ReportSnapshot,
  ReportingRequirement,
} from "@/types/domain";
import { effectiveClaimKind, indexClaims, renderClaimValue } from "@/lib/knowledge";
import { assessReportCompleteness, type ReportCompleteness } from "./completeness";

/**
 * Report intelligence: the six questions the brief says must be answered
 * *before* drafting.
 *
 *   What evidence do we have? · What is missing? · What changed since last
 *   report? · Which indicators are current? · Which numbers are trusted? ·
 *   What commitments did we make?
 *
 * Every one is a query. None is a prompt. That matters more here than almost
 * anywhere else in the product, because these are the questions whose wrong
 * answers get written into a document a funder reads: a model that guesses
 * "the evidence looks strong" produces a confident report resting on nothing,
 * and the error is invisible until someone asks for the source.
 *
 * The answers are deliberately arranged so that a drafter reads them in order
 * and stops if the first two are bad.
 */

export interface ReportBriefing {
  reportId: string;
  /** What we have, graded by how far each piece stands from a record. */
  completeness: ReportCompleteness;
  /** What changed since the last version of this report was published. */
  changedSinceLastReport: ChangeSinceLast[];
  /** Which indicators are current enough to cite. */
  indicatorCurrency: IndicatorCurrency[];
  /** Which numbers are trusted, and why. */
  trustedFigures: TrustedFigure[];
  /** What was promised: funder requirements and open commitments. */
  commitments: PromisedItem[];
  /** Whether drafting should begin at all, and why not where it should not. */
  readyToDraft: boolean;
  blockers: string[];
}

export interface ChangeSinceLast {
  subject: EntityReference;
  predicate: string;
  previousValue: string;
  currentValue: string;
  /** True where the previous value was explicitly corrected rather than moving on. */
  corrected: boolean;
}

export interface IndicatorCurrency {
  indicatorId: string;
  name: string;
  currentValue: number;
  unit: string;
  lastUpdated?: string;
  daysSinceMeasured?: number;
  state: "current" | "ageing" | "stale" | "never_measured";
}

export interface TrustedFigure {
  claimId: string;
  text: string;
  /** The *effective* kind, after the weakest-link rule. */
  kind: string;
  verification: string;
  /** True where the kind survives its own support chain. */
  honest: boolean;
  workings?: string;
}

export interface PromisedItem {
  ref: EntityReference;
  summary: string;
  dueDate?: string;
  status: string;
  /** Where the promise came from: a funder requirement, or a conversation. */
  origin: "funder_requirement" | "commitment";
}

export interface BriefingInput {
  report: ImpactReport;
  claims: EvidenceInputClaims;
  evidence: EvidenceItem[];
  indicators: Indicator[];
  requirements?: ReportRequirement[];
  /** What the funder asked for, if this report answers a grant. */
  funderRequirements?: ReportingRequirement[];
  commitments?: Commitment[];
  /** The snapshot of the last published version, where there is one. */
  previousSnapshot?: ReportSnapshot | null;
  now: Date;
  /** An indicator older than this cannot be described as current. */
  currentWithinDays?: number;
  staleAfterDays?: number;
}

type EvidenceInputClaims = Claim[];

export function buildReportBriefing(input: BriefingInput): ReportBriefing {
  const {
    report,
    claims,
    evidence,
    indicators,
    previousSnapshot,
    now,
  } = input;
  const currentWithinDays = input.currentWithinDays ?? 90;
  const staleAfterDays = input.staleAfterDays ?? 180;

  const completeness = assessReportCompleteness({
    report,
    claims,
    evidence,
    indicators,
    requirements: input.requirements,
    now,
  });

  const index = indexClaims(claims);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  // --- What changed since the last report --------------------------------
  const changedSinceLastReport: ChangeSinceLast[] = [];
  if (previousSnapshot) {
    for (const figure of previousSnapshot.figures) {
      if (figure.claimId) {
        const pinned = claimsById.get(figure.claimId);
        const successor = pinned?.supersededBy
          ? claimsById.get(pinned.supersededBy)
          : undefined;
        if (successor) {
          const currentValue = renderClaimValue(successor.value);
          if (currentValue !== figure.renderedValue) {
            changedSinceLastReport.push({
              subject: figure.subject,
              predicate: figure.predicate,
              previousValue: figure.renderedValue,
              currentValue,
              corrected: true,
            });
          }
        }
        continue;
      }
      if (figure.subject.type !== "indicator") continue;
      const indicator = indicators.find((i) => i.id === figure.subject.id);
      if (!indicator) continue;
      const currentValue = `${indicator.currentValue}${indicator.unit === "%" ? "%" : ` ${indicator.unit}`}`;
      if (currentValue === figure.renderedValue) continue;
      changedSinceLastReport.push({
        subject: figure.subject,
        predicate: figure.predicate,
        previousValue: figure.renderedValue,
        currentValue,
        corrected: false,
      });
    }
  }

  // --- Which indicators are current --------------------------------------
  const indicatorCurrency: IndicatorCurrency[] = indicators.map((indicator) => {
    const days = indicator.lastUpdated
      ? safeDays(now, indicator.lastUpdated)
      : undefined;
    const state: IndicatorCurrency["state"] =
      days === undefined
        ? "never_measured"
        : days <= currentWithinDays
          ? "current"
          : days <= staleAfterDays
            ? "ageing"
            : "stale";
    return {
      indicatorId: indicator.id,
      name: indicator.name,
      currentValue: indicator.currentValue,
      unit: indicator.unit,
      lastUpdated: indicator.lastUpdated,
      daysSinceMeasured: days,
      state,
    };
  });

  // --- Which numbers are trusted -----------------------------------------
  const citedIds = new Set(report.sections.flatMap((section) => section.claimIds ?? []));
  const trustedFigures: TrustedFigure[] = claims
    .filter((claim) => citedIds.has(claim.id))
    .map((claim) => {
      const effective = effectiveClaimKind(claim, index);
      return {
        claimId: claim.id,
        text: claim.text,
        kind: effective,
        verification: claim.verification,
        // The report may present the claim as its own kind only when the kind
        // survives its support chain. Where it does not, the drafter is told,
        // and may relabel or withhold. Both are legitimate; silently keeping
        // the stated label is not.
        honest: effective === claim.kind,
        workings: claim.workings,
      };
    });

  // --- What we promised ---------------------------------------------------
  const commitments: PromisedItem[] = [
    ...(input.funderRequirements ?? []).map((requirement) => ({
      ref: {
        type: "reporting_requirement" as const,
        id: requirement.id,
        label: requirement.title,
      },
      summary: requirement.description ?? requirement.title,
      dueDate: requirement.dueDate,
      status: requirement.status,
      origin: "funder_requirement" as const,
    })),
    ...(input.commitments ?? [])
      .filter((commitment) => commitment.status === "open")
      .map((commitment) => ({
        ref: { type: "commitment" as const, id: commitment.id, label: commitment.title },
        summary: commitment.description ?? commitment.title,
        dueDate: commitment.dueAt,
        status: commitment.status,
        origin: "commitment" as const,
      })),
  ];

  // --- Should drafting begin? ---------------------------------------------
  const blockers: string[] = [];
  if (completeness.conflicts.length > 0) {
    blockers.push(
      `${completeness.conflicts.length} conflicting figure${completeness.conflicts.length === 1 ? "" : "s"} must be resolved before drafting: a report cannot choose between two current claims.`,
    );
  }
  const dishonest = trustedFigures.filter((figure) => !figure.honest);
  if (dishonest.length > 0) {
    blockers.push(
      `${dishonest.length} cited figure${dishonest.length === 1 ? "" : "s"} cannot be presented as stated, because something in the support chain is weaker.`,
    );
  }
  const staleCited = indicatorCurrency.filter(
    (currency) =>
      report.includedIndicatorIds.includes(currency.indicatorId) &&
      (currency.state === "stale" || currency.state === "never_measured"),
  );
  if (staleCited.length > 0) {
    blockers.push(
      `${staleCited.length} included indicator${staleCited.length === 1 ? " has" : "s have"} no recent measurement: ${staleCited.map((c) => c.name).join(", ")}.`,
    );
  }

  return {
    reportId: report.id,
    completeness,
    changedSinceLastReport,
    indicatorCurrency,
    trustedFigures,
    commitments,
    readyToDraft: blockers.length === 0,
    blockers,
  };
}

function safeDays(now: Date, date: string): number | undefined {
  try {
    return differenceInCalendarDays(now, parseISO(date));
  } catch {
    return undefined;
  }
}
