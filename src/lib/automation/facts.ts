import type {
  Grant,
  GrantDeliverable,
  GrantReport,
  ImpactReport,
  Indicator,
  Outcome,
  Programme,
  Relationship,
  ReportingRequirement,
} from "@/types/domain";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { indicatorProgress } from "@/lib/logic/progress";
import type { RelationshipHealth } from "@/lib/logic/relationship-health";
import type { FactBag } from "./conditions";

/**
 * Turning a record into the flat fields a condition can read.
 *
 * The namespaces here are the automation engine's public vocabulary. A rule
 * author writes `grant.health`, and that string is a contract: renaming it
 * breaks every saved rule that uses it, which is why the mapping lives in one
 * file with the names written out rather than being derived from object keys.
 *
 * Two rules govern what goes in a fact bag.
 *
 * **Only what is actually known.** A field that cannot be computed is
 * **omitted**, never defaulted. `grant.health` is absent when health cannot be
 * derived, and a condition reading it evaluates to `unknown` rather than to a
 * cheerful `on_track`. Defaulting here would silently defeat the three-valued
 * logic that the whole engine rests on.
 *
 * **Derived values come from the same functions the product uses.** Grant
 * health in a rule is `computeGrantHealth`, not a second implementation. Two
 * definitions of "at risk" would eventually disagree, and the version the
 * automation used would be the one nobody was looking at.
 */

export const FACT_NAMESPACES = [
  "grant",
  "report",
  "requirement",
  "programme",
  "indicator",
  "relationship",
  "finance",
] as const;

function put(bag: FactBag, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    bag[key] = value;
  }
}

export interface GrantFactInput {
  grant: Grant;
  deliverables: GrantDeliverable[];
  reports: GrantReport[];
  linkedEvidenceCount: number;
  now: Date;
}

export function grantFacts(input: GrantFactInput): FactBag {
  const bag: FactBag = {};
  const { grant } = input;
  put(bag, "grant.id", grant.id);
  put(bag, "grant.title", grant.title);
  put(bag, "grant.status", grant.status);
  put(bag, "grant.restricted", grant.restricted);
  put(bag, "grant.awardValue", grant.awardValue);
  put(bag, "grant.spentToDate", grant.spentToDate);
  put(bag, "grant.startDate", grant.startDate);
  put(bag, "grant.endDate", grant.endDate);
  put(bag, "grant.funderId", grant.funderId);

  const health = computeGrantHealth({
    grant: input.grant,
    deliverables: input.deliverables,
    reports: input.reports,
    linkedEvidenceCount: input.linkedEvidenceCount,
    now: input.now,
  });
  put(bag, "grant.health", health.state);
  put(bag, "grant.budgetUsedPercent", Math.round(health.budgetUsedPercent * 10) / 10);
  put(bag, "grant.timeElapsedPercent", Math.round(health.timeElapsedPercent * 10) / 10);
  put(bag, "grant.overdueDeliverables", health.overdueDeliverables);
  put(bag, "grant.overdueReports", health.overdueReports);

  return bag;
}

export interface ReportFactInput {
  report: ImpactReport;
  /**
   * 0..1. Supplied rather than computed here, because completeness needs
   * claims, evidence and requirements, and a fact builder that reached for
   * all three would become a second report engine.
   */
  evidenceCompleteness?: number;
  /** The nearest funder deadline this report answers, where there is one. */
  dueDate?: string;
}

export function reportFacts(input: ReportFactInput): FactBag {
  const bag: FactBag = {};
  const { report } = input;
  put(bag, "report.id", report.id);
  put(bag, "report.title", report.title);
  put(bag, "report.type", report.type);
  put(bag, "report.status", report.status);
  put(bag, "report.reportingPeriod", report.reportingPeriod);
  put(bag, "report.sectionCount", report.sections.length);
  put(
    bag,
    "report.draftedSections",
    report.sections.filter((section) => section.content.trim().length > 0).length,
  );
  put(bag, "report.citedClaims", report.sections.flatMap((s) => s.claimIds ?? []).length);
  put(bag, "report.dueDate", input.dueDate);
  // Absent when it was not supplied. A rule reading it gets `unknown`, which
  // is the correct answer to "is the evidence below 70% complete?" when
  // nobody has computed completeness.
  put(bag, "report.evidenceCompleteness", input.evidenceCompleteness);
  return bag;
}

export function grantReportFacts(report: GrantReport): FactBag {
  const bag: FactBag = {};
  put(bag, "report.id", report.id);
  put(bag, "report.title", report.title);
  put(bag, "report.status", report.status);
  put(bag, "report.dueDate", report.dueDate);
  put(bag, "report.grantId", report.grantId);
  return bag;
}

export function requirementFacts(requirement: ReportingRequirement): FactBag {
  const bag: FactBag = {};
  put(bag, "requirement.id", requirement.id);
  put(bag, "requirement.title", requirement.title);
  put(bag, "requirement.status", requirement.status);
  put(bag, "requirement.frequency", requirement.frequency);
  put(bag, "requirement.dueDate", requirement.dueDate);
  put(bag, "requirement.grantId", requirement.grantId);
  put(bag, "requirement.evidenceTypeCount", requirement.evidenceTypes.length);
  return bag;
}

export interface ProgrammeFactInput {
  programme: Programme;
  indicators: Indicator[];
  outcomes: Outcome[];
  now: Date;
}

/**
 * `programme.progress < programme.expectedProgress`, from the brief.
 *
 * Both sides are computed and both are omitted where they cannot be. Expected
 * progress requires a start and an end date; a programme without them has no
 * schedule to be behind, and inventing one by assuming a calendar year would
 * make every undated programme permanently "behind".
 */
export function programmeFacts(input: ProgrammeFactInput): FactBag {
  const bag: FactBag = {};
  const { programme, indicators, now } = input;
  put(bag, "programme.id", programme.id);
  put(bag, "programme.name", programme.name);
  put(bag, "programme.status", programme.status);
  put(bag, "programme.startDate", programme.startDate);
  put(bag, "programme.endDate", programme.endDate);
  put(bag, "programme.indicatorCount", indicators.length);
  put(bag, "programme.outcomeCount", input.outcomes.length);

  const measured = indicators.filter((indicator) => indicator.lastUpdated);
  if (measured.length > 0) {
    const average =
      measured.reduce((sum, indicator) => sum + indicatorProgress(indicator), 0) / measured.length;
    put(bag, "programme.progress", Math.round(average * 10) / 10);
  }

  if (programme.startDate && programme.endDate) {
    const start = Date.parse(programme.startDate);
    const end = Date.parse(programme.endDate);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const elapsed = ((now.getTime() - start) / (end - start)) * 100;
      put(bag, "programme.expectedProgress", Math.round(Math.min(100, Math.max(0, elapsed)) * 10) / 10);
    }
  }

  return bag;
}

export function indicatorFacts(indicator: Indicator, now: Date): FactBag {
  const bag: FactBag = {};
  put(bag, "indicator.id", indicator.id);
  put(bag, "indicator.name", indicator.name);
  put(bag, "indicator.currentValue", indicator.currentValue);
  put(bag, "indicator.baseline", indicator.baseline);
  put(bag, "indicator.target", indicator.target);
  put(bag, "indicator.unit", indicator.unit);
  put(bag, "indicator.confidence", indicator.confidence);
  put(bag, "indicator.progress", indicatorProgress(indicator));
  put(bag, "indicator.lastUpdated", indicator.lastUpdated);
  if (indicator.lastUpdated) {
    const measured = Date.parse(indicator.lastUpdated);
    if (Number.isFinite(measured)) {
      put(
        bag,
        "indicator.daysSinceMeasured",
        Math.round((now.getTime() - measured) / 86_400_000),
      );
    }
  }
  return bag;
}

export function relationshipFacts(
  relationship: Relationship,
  health: RelationshipHealth,
  displayName: string,
): FactBag {
  const bag: FactBag = {};
  put(bag, "relationship.id", relationship.id);
  put(bag, "relationship.name", displayName);
  put(bag, "relationship.status", relationship.status);
  // The engine's actual health vocabulary, not the brief's illustrative
  // "declining". Exposing a value the product does not produce would let a
  // rule author write a condition that can never be true.
  put(bag, "relationship.health", health.state);
  put(bag, "relationship.daysSinceLastInteraction", health.daysSinceLastInteraction);
  put(bag, "relationship.openCommitments", health.openCommitments);
  put(bag, "relationship.overdueCommitments", health.overdueCommitments);
  put(bag, "relationship.interactionsLastYear", health.interactionsLastYear);
  put(bag, "relationship.overridden", health.overridden);
  return bag;
}

/**
 * Financial variance, as the brief's `financialVariance > configuredThreshold`.
 *
 * Expressed as a percentage of budget rather than an absolute, because a
 * threshold in pounds is meaningless across a portfolio where one budget is
 * £8,000 and another is £250,000.
 */
export function financeFacts(input: {
  budgetedMinorUnits?: number;
  actualMinorUnits?: number;
  unrestrictedRunwayMonths?: number;
  unallocatedCount?: number;
}): FactBag {
  const bag: FactBag = {};
  put(bag, "finance.unrestrictedRunwayMonths", input.unrestrictedRunwayMonths);
  put(bag, "finance.unallocatedTransactions", input.unallocatedCount);
  if (
    input.budgetedMinorUnits !== undefined &&
    input.actualMinorUnits !== undefined &&
    input.budgetedMinorUnits > 0
  ) {
    const variance =
      ((input.actualMinorUnits - input.budgetedMinorUnits) / input.budgetedMinorUnits) * 100;
    put(bag, "finance.variancePercent", Math.round(variance * 10) / 10);
    put(bag, "finance.budgetedMinorUnits", input.budgetedMinorUnits);
    put(bag, "finance.actualMinorUnits", input.actualMinorUnits);
  }
  return bag;
}

/** Merge fact bags, later winning. Used to build a composite event payload. */
export function mergeFacts(...bags: FactBag[]): FactBag {
  return Object.assign({}, ...bags) as FactBag;
}

/** The `previous.` namespace a `changed` condition reads. */
export function asPrevious(bag: FactBag): FactBag {
  const out: FactBag = {};
  for (const [key, value] of Object.entries(bag)) out[`previous.${key}`] = value;
  return out;
}
