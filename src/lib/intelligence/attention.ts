import { differenceInCalendarDays, parseISO } from "date-fns";
import type { EntityReference } from "@/types/domain";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { indicatorProgress } from "@/lib/logic/progress";
import { commitmentState, computeRelationshipHealth } from "@/lib/logic/relationship-health";
import {
  addMoney,
  formatMoney,
  money,
  subtractMoney,
  sumMoney,
  zero,
} from "@/lib/finance-intelligence/money";
import { computeConcentration } from "@/lib/finance-intelligence/concentration";
import { computeUnrestrictedRunway, runwayState } from "@/lib/finance-intelligence/runway";
import type { MissionSnapshot } from "./snapshot";
import {
  SEVERITY_WEIGHT,
  type AttentionCategory,
  type AttentionItem,
  type AttentionKind,
  type AttentionSeverity,
  type AttentionSignal,
} from "./types";

/**
 * Deterministic attention detection.
 *
 * The brief's rule for the Command Centre is one sentence and it decides the
 * whole design: *prioritisation should use deterministic signals; AI may
 * summarise and contextualise*. So nothing in this file is generative. Every
 * item is produced by a rule with a name, carries the signals that produced it,
 * and scores by arithmetic a reader can repeat.
 *
 * The scoring rule, stated once:
 *
 *   score = severity weight + Σ signal weights + urgency bonus
 *
 * Urgency is a bonus rather than a multiplier because a multiplier lets a
 * trivial item overtake a serious one purely by being imminent. A stationery
 * order due tomorrow must not outrank a grant at risk of clawback.
 *
 * There is no "manufactured urgency" adjustment and no engagement weighting.
 * An organisation that sees the same three items for three weeks is being told
 * the truth, and the correct response is to fix the three items rather than to
 * rotate the list.
 */

// --- thresholds, named once ---------------------------------------------

export const ATTENTION_THRESHOLDS = {
  /** A grant ending inside this window needs a renewal or an exit decision. */
  grantEndingDays: 180,
  /** Deadline horizons. */
  opportunityDeadlineDays: 45,
  reportDueDays: 60,
  requirementDueDays: 45,
  /** An indicator unmeasured for this long cannot support a current report. */
  indicatorStaleDays: 180,
  /** Below this, unrestricted runway is a governance matter. */
  runwayWarningMonths: 6,
  /** A funder above this share of income is a concentration exposure. */
  funderShareCritical: 50,
  funderShareHigh: 33,
  /** An indicator this far behind its time-elapsed position is off track. */
  offTrackPercentagePoints: 20,
} as const;

// --- helpers ------------------------------------------------------------

function daysUntil(date: string | undefined, now: Date): number | undefined {
  if (!date) return undefined;
  try {
    return differenceInCalendarDays(parseISO(date), now);
  } catch {
    return undefined;
  }
}

function ref(type: EntityReference["type"], id: string, label?: string): EntityReference {
  return label ? { type, id, label } : { type, id };
}

/**
 * The urgency bonus.
 *
 * Bounded at 30 so that no deadline can outweigh a severity step, which is
 * 30 points between adjacent levels. Overdue is worth more than imminent
 * because an obligation already missed cannot be recovered by planning.
 */
function urgencyBonus(days: number | undefined): number {
  if (days === undefined) return 0;
  if (days < 0) return 30;
  if (days <= 7) return 25;
  if (days <= 14) return 18;
  if (days <= 30) return 12;
  if (days <= 60) return 6;
  return 0;
}

function build(input: {
  id: string;
  category: AttentionCategory;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  subject: EntityReference;
  signals: AttentionSignal[];
  dueInDays?: number;
  action?: { label: string; href?: string };
  sources?: EntityReference[];
  claimIds?: string[];
}): AttentionItem {
  const signalWeight = input.signals.reduce((sum, s) => sum + s.weight, 0);
  return {
    ...input,
    sources: input.sources ?? [input.subject],
    score: SEVERITY_WEIGHT[input.severity] + signalWeight + urgencyBonus(input.dueInDays),
  };
}

/**
 * Stable ordering.
 *
 * Score first, then category, then id. The tiebreakers exist so that two runs
 * over unchanged data produce an identical list: a Command Centre whose order
 * shifts between page loads teaches people to distrust it.
 */
const CATEGORY_ORDER: AttentionCategory[] = [
  "finance",
  "grants",
  "reports",
  "relationships",
  "funding",
  "programmes",
  "impact",
  "evidence",
  "governance",
  "strategy",
];

export function rankAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

// --- Grants -------------------------------------------------------------

export function detectGrantAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const evidenceCount = new Map<string, number>();
  for (const link of s.evidenceTargets) {
    if (link.targetType !== "grant") continue;
    evidenceCount.set(link.targetId, (evidenceCount.get(link.targetId) ?? 0) + 1);
  }

  for (const grant of s.grants) {
    if (grant.status !== "active") continue;
    const deliverables = s.deliverables.filter((d) => d.grantId === grant.id);
    const reports = s.grantReports.filter((r) => r.grantId === grant.id);
    const health = computeGrantHealth({
      grant,
      deliverables,
      reports,
      linkedEvidenceCount: evidenceCount.get(grant.id) ?? 0,
      now: s.now,
    });

    if (health.state === "at_risk" || health.state === "attention") {
      items.push(
        build({
          id: `grant_health:${grant.id}`,
          category: "grants",
          kind: "risk",
          severity: health.state === "at_risk" ? "high" : "medium",
          title: `${grant.title} needs attention`,
          detail: health.reasons.join(" "),
          subject: ref("grant", grant.id, grant.title),
          dueInDays: daysUntil(grant.endDate, s.now),
          signals: health.reasons.map((reason, index) => ({
            code: "grant_health_reason",
            label: "Grant health",
            detail: reason,
            weight: index === 0 ? 10 : 5,
            ref: ref("grant", grant.id),
          })),
          action: { label: "Review grant", href: `/grants/${grant.id}` },
        }),
      );
    }

    const endingIn = daysUntil(grant.endDate, s.now);
    if (
      endingIn !== undefined &&
      endingIn >= 0 &&
      endingIn <= ATTENTION_THRESHOLDS.grantEndingDays
    ) {
      items.push(
        build({
          id: `grant_ending:${grant.id}`,
          category: "grants",
          kind: "obligation",
          severity: endingIn <= 90 ? "high" : "medium",
          title: `${grant.title} ends in ${endingIn} days`,
          detail: `The award runs to ${grant.endDate}. A renewal or exit decision is needed before it ends.`,
          subject: ref("grant", grant.id, grant.title),
          dueInDays: endingIn,
          signals: [
            {
              code: "grant_ending",
              label: "Award ending",
              detail: `Ends ${grant.endDate}.`,
              weight: 10,
              ref: ref("grant", grant.id),
            },
          ],
          action: { label: "Plan continuation", href: `/grants/${grant.id}` },
        }),
      );
    }

    for (const deliverable of deliverables) {
      const days = daysUntil(deliverable.dueDate, s.now);
      const overdue =
        deliverable.status === "overdue" ||
        (deliverable.status !== "complete" && days !== undefined && days < 0);
      if (!overdue) continue;
      items.push(
        build({
          id: `deliverable_overdue:${deliverable.id}`,
          category: "grants",
          kind: "obligation",
          severity: "high",
          title: `Deliverable overdue: ${deliverable.title}`,
          detail: `Due ${deliverable.dueDate} under ${grant.title}.`,
          subject: ref("grant_deliverable", deliverable.id, deliverable.title),
          dueInDays: days,
          signals: [
            {
              code: "deliverable_overdue",
              label: "Overdue deliverable",
              detail: `Due ${deliverable.dueDate}, status ${deliverable.status.replace(/_/g, " ")}.`,
              weight: 15,
              ref: ref("grant_deliverable", deliverable.id),
            },
          ],
          sources: [ref("grant_deliverable", deliverable.id), ref("grant", grant.id)],
          action: { label: "Update deliverable", href: `/grants/${grant.id}` },
        }),
      );
    }
  }

  return items;
}

// --- Reports and funder requirements ------------------------------------

export function detectReportAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const grantById = new Map(s.grants.map((g) => [g.id, g]));

  for (const report of s.grantReports) {
    if (report.status === "submitted") continue;
    const days = daysUntil(report.dueDate, s.now);
    if (days === undefined || days > ATTENTION_THRESHOLDS.reportDueDays) continue;
    const grant = grantById.get(report.grantId);
    const signals: AttentionSignal[] = [
      {
        code: "report_due",
        label: "Report due",
        detail: `Due ${report.dueDate}, currently ${report.status.replace(/_/g, " ")}.`,
        weight: days < 0 ? 20 : 10,
        ref: ref("grant_report", report.id),
      },
    ];
    if (report.status === "not_started") {
      signals.push({
        code: "report_not_started",
        label: "Not started",
        detail: "No drafting has begun.",
        weight: 10,
        ref: ref("grant_report", report.id),
      });
    }
    items.push(
      build({
        id: `grant_report_due:${report.id}`,
        category: "reports",
        kind: "obligation",
        severity: days < 0 ? "critical" : days <= 14 ? "high" : "medium",
        title: days < 0 ? `${report.title} is overdue` : `${report.title} due in ${days} days`,
        detail: grant
          ? `Required by ${grant.title}.`
          : "A funder report is due and has not been submitted.",
        subject: ref("grant_report", report.id, report.title),
        dueInDays: days,
        signals,
        sources: grant
          ? [ref("grant_report", report.id), ref("grant", grant.id)]
          : [ref("grant_report", report.id)],
        action: grant
          ? { label: "Open grant", href: `/grants/${grant.id}` }
          : { label: "Open reports", href: "/impact" },
      }),
    );
  }

  for (const requirement of s.requirements) {
    if (requirement.status === "met" || requirement.status === "waived") continue;
    const days = daysUntil(requirement.dueDate, s.now);
    if (days === undefined || days > ATTENTION_THRESHOLDS.requirementDueDays) continue;

    // What the funder actually asked for, resolved through `requires` edges.
    const required = s.relations.filter(
      (r) =>
        r.kind === "requires" &&
        r.from.type === "reporting_requirement" &&
        r.from.id === requirement.id,
    );
    const requiredIndicators = required.filter((r) => r.to.type === "indicator");
    const staleRequired = requiredIndicators.filter((r) => {
      const indicator = s.indicators.find((i) => i.id === r.to.id);
      const measured = daysUntil(indicator?.lastUpdated, s.now);
      return measured === undefined || -measured > ATTENTION_THRESHOLDS.indicatorStaleDays;
    });

    const signals: AttentionSignal[] = [
      {
        code: "requirement_due",
        label: "Funder requirement",
        detail: `${requirement.title} is due ${requirement.dueDate}.`,
        weight: days < 0 ? 20 : 10,
        ref: ref("reporting_requirement", requirement.id),
      },
    ];
    if (staleRequired.length > 0) {
      signals.push({
        code: "required_indicator_stale",
        label: "Required indicator not current",
        detail: `${staleRequired.length} of ${requiredIndicators.length} indicators this funder asked for have no recent measurement.`,
        weight: 20,
        ref: staleRequired[0]!.to,
      });
    }

    items.push(
      build({
        id: `requirement_due:${requirement.id}`,
        category: "reports",
        kind: "obligation",
        severity: days < 0 ? "critical" : staleRequired.length > 0 ? "high" : "medium",
        title:
          days < 0 ? `${requirement.title} is overdue` : `${requirement.title} due in ${days} days`,
        detail:
          requiredIndicators.length > 0
            ? `This requirement names ${requiredIndicators.length} indicator${requiredIndicators.length === 1 ? "" : "s"} the funder expects to see.`
            : (requirement.description ?? "A reporting requirement is approaching."),
        subject: ref("reporting_requirement", requirement.id, requirement.title),
        dueInDays: days,
        signals,
        sources: [ref("reporting_requirement", requirement.id), ...required.map((r) => r.to)],
        action: requirement.grantId
          ? { label: "Open grant", href: `/grants/${requirement.grantId}` }
          : undefined,
      }),
    );
  }

  return items;
}

// --- Funding pipeline ---------------------------------------------------

const CLOSED_STAGES = new Set(["unsuccessful", "archived", "awarded"]);

export function detectFundingAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const opportunity of s.opportunities) {
    if (CLOSED_STAGES.has(opportunity.stage)) continue;
    const days = daysUntil(opportunity.deadline, s.now);
    if (days === undefined || days < 0 || days > ATTENTION_THRESHOLDS.opportunityDeadlineDays) {
      continue;
    }
    const application = s.applications.find((a) => a.opportunityId === opportunity.id);
    const answers = application ? s.answers.filter((a) => a.applicationId === application.id) : [];
    const unfinished = answers.filter((a) => a.status !== "approved").length;

    const signals: AttentionSignal[] = [
      {
        code: "opportunity_deadline",
        label: "Deadline",
        detail: `Closes ${opportunity.deadline}.`,
        weight: 10,
        ref: ref("funding_opportunity", opportunity.id),
      },
    ];
    if (!application) {
      signals.push({
        code: "no_application_started",
        label: "No application started",
        detail: "Nothing has been drafted against this opportunity.",
        weight: 12,
        ref: ref("funding_opportunity", opportunity.id),
      });
    } else if (unfinished > 0) {
      signals.push({
        code: "answers_outstanding",
        label: "Answers outstanding",
        detail: `${unfinished} of ${answers.length} answers are not yet approved.`,
        weight: 8,
        ref: ref("application", application.id),
      });
    }

    items.push(
      build({
        id: `opportunity_deadline:${opportunity.id}`,
        category: "funding",
        kind: "obligation",
        severity: days <= 14 ? "high" : "medium",
        title: `${opportunity.programmeName} closes in ${days} days`,
        detail: application
          ? `Application is ${application.status.replace(/_/g, " ")}.`
          : "No application has been started.",
        subject: ref("funding_opportunity", opportunity.id, opportunity.programmeName),
        dueInDays: days,
        signals,
        sources: application
          ? [ref("funding_opportunity", opportunity.id), ref("application", application.id)]
          : [ref("funding_opportunity", opportunity.id)],
        action: { label: "Open opportunity", href: `/funding/${opportunity.id}` },
      }),
    );
  }

  return items;
}

/**
 * Opportunity detection.
 *
 * Deliberately conservative and deliberately small. An attention list that
 * pads itself with opportunities trains people to skim it, and skimming is
 * exactly the failure mode the Command Centre exists to prevent. Both rules
 * below require a *record* — a completed fit assessment, a past award — rather
 * than an inference about what the organisation might like to do.
 */
export function detectOpportunityAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const opportunityById = new Map(s.opportunities.map((o) => [o.id, o]));

  for (const assessment of s.fitAssessments) {
    if (assessment.category !== "strong_match") continue;
    const opportunity = opportunityById.get(assessment.opportunityId);
    if (!opportunity || CLOSED_STAGES.has(opportunity.stage)) continue;
    // Already being worked on is not an opportunity, it is work in progress.
    if (s.applications.some((a) => a.opportunityId === opportunity.id)) continue;

    const days = daysUntil(opportunity.deadline, s.now);
    // Too close to start well. Surfacing it as an opportunity would be an
    // invitation to write a weak application against a deadline.
    if (days !== undefined && days >= 0 && days < 14) continue;
    if (days !== undefined && days < 0) continue;

    items.push(
      build({
        id: `strong_fit_unstarted:${opportunity.id}`,
        category: "funding",
        kind: "opportunity",
        severity: "medium",
        title: `${opportunity.programmeName} is a strong fit and has not been started`,
        detail: `Assessed at ${assessment.overallScore} out of 100. ${assessment.recommendedNextAction}`,
        subject: ref("funding_opportunity", opportunity.id, opportunity.programmeName),
        dueInDays: days,
        signals: [
          {
            code: "strong_fit",
            label: "Strong fit",
            detail: `Deterministic fit assessment scored ${assessment.overallScore} out of 100 across ${assessment.factors.length} factors.`,
            weight: 10,
            ref: ref("funding_opportunity", opportunity.id),
          },
        ],
        sources: [ref("funding_opportunity", opportunity.id)],
        action: { label: "Open opportunity", href: `/funding/${opportunity.id}` },
      }),
    );
  }

  for (const funder of s.funders) {
    const grants = s.grants.filter((g) => g.funderId === funder.id);
    if (grants.length === 0) continue;
    if (grants.some((g) => g.status === "active")) continue;
    const last = grants
      .map((g) => g.endDate)
      .sort()
      .at(-1);
    const sinceDays = last ? -(daysUntil(last, s.now) ?? 0) : undefined;
    // Between six months and three years since the last award: recent enough
    // to be remembered, long enough ago that nobody is going to act without a
    // prompt.
    if (sinceDays === undefined || sinceDays < 180 || sinceDays > 1095) continue;

    items.push(
      build({
        id: `lapsed_funder:${funder.id}`,
        category: "relationships",
        kind: "opportunity",
        severity: "low",
        title: `${funder.name} funded this organisation before and does not now`,
        detail: `${grants.length} past award${grants.length === 1 ? "" : "s"}, the most recent ending ${last}. There is no live application or grant.`,
        subject: ref("funder", funder.id, funder.name),
        signals: [
          {
            code: "lapsed_funder",
            label: "Previous funder, no live award",
            detail: `Last award ended ${last}, ${Math.round(sinceDays / 30)} months ago.`,
            weight: 6,
            ref: ref("funder", funder.id),
          },
        ],
        sources: [ref("funder", funder.id), ...grants.map((g) => ref("grant", g.id))],
        action: funder.externalOrganisationId
          ? { label: "Open relationship", href: `/relationships/${funder.externalOrganisationId}` }
          : { label: "Open funding", href: "/funding" },
      }),
    );
  }

  return items;
}

// --- Finance ------------------------------------------------------------

/**
 * Finance detection reads records, never `Grant.spentToDate`.
 *
 * The scalar cannot be verified: nothing says which transactions produced it.
 * Allocations name their transaction and their method, which is the difference
 * between a number a funder can audit and a number the organisation typed.
 */
export function detectFinanceAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const currency = s.currency;

  // Unrestricted position, from funds rather than from a total cash figure.
  const unrestrictedFunds = new Set(
    s.funds.filter((f) => f.restriction === "unrestricted").map((f) => f.id),
  );
  const unrestrictedTransactions = s.transactions.filter(
    (t) => t.fundId && unrestrictedFunds.has(t.fundId),
  );

  if (unrestrictedFunds.size > 0 && unrestrictedTransactions.length > 0) {
    const income = sumMoney(
      unrestrictedTransactions.filter((t) => t.direction === "income").map((t) => t.amount),
      currency,
    );
    const spend = sumMoney(
      unrestrictedTransactions.filter((t) => t.direction === "expenditure").map((t) => t.amount),
      currency,
    );
    const reserves = subtractMoney(income, spend);

    // Burn over the observed window rather than an assumed year: a three-month
    // ledger divided by twelve understates burn by a factor of four.
    const dates = unrestrictedTransactions.map((t) => parseISO(t.date).getTime());
    const spanDays = Math.max(
      1,
      differenceInCalendarDays(new Date(Math.max(...dates)), new Date(Math.min(...dates))),
    );
    const months = Math.max(1, spanDays / 30.44);
    const netBurnMinor = Math.round(Math.max(0, spend.minorUnits - income.minorUnits) / months);

    const runway = computeUnrestrictedRunway({
      organisationId: s.organisationId,
      unrestrictedReserves: reserves,
      monthlyUnrestrictedBurn: money(netBurnMinor, currency),
      now: s.now,
    });

    if (
      Number.isFinite(runway.runwayMonths) &&
      runway.runwayMonths <= ATTENTION_THRESHOLDS.runwayWarningMonths
    ) {
      const state = runwayState(runway.runwayMonths);
      items.push(
        build({
          id: `unrestricted_runway:${s.organisationId}`,
          category: "finance",
          kind: "risk",
          severity: state === "critical" ? "critical" : "high",
          title: `Unrestricted runway is ${runway.runwayMonths} months`,
          detail: `${formatMoney(reserves)} unrestricted against ${formatMoney(runway.monthlyUnrestrictedBurn)} net monthly burn, measured over ${Math.round(months)} months of recorded transactions.`,
          subject: ref("organisation", s.organisationId),
          signals: [
            {
              code: "unrestricted_runway_low",
              label: "Unrestricted runway",
              detail: `${runway.runwayMonths} months at the current net burn.`,
              weight: state === "critical" ? 25 : 15,
              ref: ref("organisation", s.organisationId),
            },
          ],
          sources: [
            ref("organisation", s.organisationId),
            ...[...unrestrictedFunds].map((id) => ref("fund", id)),
          ],
          action: { label: "Open finance", href: "/finance" },
        }),
      );
    }
  }

  // Funder concentration, over active award value.
  const funderName = new Map(s.funders.map((f) => [f.id, f.name]));
  const activeGrants = s.grants.filter((g) => g.status === "active");
  if (activeGrants.length > 1) {
    const position = computeConcentration(
      activeGrants.map((g) => ({
        funderId: g.funderId,
        funderName: funderName.get(g.funderId) ?? "Unnamed funder",
        amount: money(Math.round(g.awardValue * 100), currency),
      })),
      currency,
    );
    const largest = position.largest;
    if (largest && largest.sharePercent >= ATTENTION_THRESHOLDS.funderShareHigh) {
      const critical = largest.sharePercent >= ATTENTION_THRESHOLDS.funderShareCritical;
      items.push(
        build({
          id: `funder_concentration:${largest.funderId}`,
          category: "finance",
          kind: "risk",
          severity: critical ? "high" : "medium",
          title: `${largest.funderName} provides ${largest.sharePercent}% of active funding`,
          detail: position.reasons.join(" "),
          subject: ref("funder", largest.funderId, largest.funderName),
          signals: [
            {
              code: "funder_concentration",
              label: "Funding concentration",
              detail: `${largest.sharePercent}% of ${formatMoney(position.total)} active award value; top three ${position.topThreePercent}%.`,
              weight: critical ? 20 : 10,
              ref: ref("funder", largest.funderId),
            },
          ],
          sources: [
            ref("funder", largest.funderId),
            ...activeGrants
              .filter((g) => g.funderId === largest.funderId)
              .map((g) => ref("grant", g.id)),
          ],
          action: { label: "Review funding mix", href: "/funding" },
        }),
      );
    }
  }

  // Money that has left the account and has not been attributed to anything.
  const allocatedByTransaction = new Map<string, number>();
  for (const allocation of s.allocations) {
    if (!allocation.transactionId) continue;
    allocatedByTransaction.set(
      allocation.transactionId,
      (allocatedByTransaction.get(allocation.transactionId) ?? 0) + allocation.amount.minorUnits,
    );
  }
  const unallocated = s.transactions.filter((t) => {
    if (t.direction !== "expenditure") return false;
    return (allocatedByTransaction.get(t.id) ?? 0) < t.amount.minorUnits;
  });
  if (unallocated.length > 0) {
    const total = unallocated.reduce(
      (sum, t) =>
        addMoney(
          sum,
          money(t.amount.minorUnits - (allocatedByTransaction.get(t.id) ?? 0), currency),
        ),
      zero(currency),
    );
    items.push(
      build({
        id: `unallocated_expenditure:${s.organisationId}`,
        category: "finance",
        kind: "observation",
        severity: "medium",
        title: `${formatMoney(total)} of expenditure is unallocated`,
        detail: `${unallocated.length} transaction${unallocated.length === 1 ? " has" : "s have"} not been attributed to a grant, fund, programme or activity. Cost per outcome excludes them.`,
        subject: ref("organisation", s.organisationId),
        signals: [
          {
            code: "unallocated_expenditure",
            label: "Unallocated money",
            detail: `${unallocated.length} transactions totalling ${formatMoney(total)}.`,
            weight: Math.min(15, unallocated.length),
            ref: ref("organisation", s.organisationId),
          },
        ],
        sources: unallocated.slice(0, 10).map((t) => ref("transaction", t.id)),
        action: { label: "Review allocations", href: "/finance" },
      }),
    );
  }

  return items;
}

// --- Programmes, indicators and evidence --------------------------------

export function detectDeliveryAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const outcomeById = new Map(s.outcomes.map((o) => [o.id, o]));
  const programmeById = new Map(s.programmes.map((p) => [p.id, p]));

  for (const indicator of s.indicators) {
    const outcome = outcomeById.get(indicator.outcomeId);
    const programme = outcome ? programmeById.get(outcome.programmeId) : undefined;
    if (programme && programme.status !== "active") continue;

    const measuredDaysAgo = (() => {
      const d = daysUntil(indicator.lastUpdated, s.now);
      return d === undefined ? undefined : -d;
    })();

    if (
      measuredDaysAgo === undefined ||
      measuredDaysAgo > ATTENTION_THRESHOLDS.indicatorStaleDays
    ) {
      items.push(
        build({
          id: `indicator_stale:${indicator.id}`,
          category: "impact",
          kind: "risk",
          severity: "medium",
          title: `${indicator.name} has no recent measurement`,
          detail:
            measuredDaysAgo === undefined
              ? "This indicator has never recorded a measurement date."
              : `Last measured ${measuredDaysAgo} days ago, against a ${indicator.measurementFrequency.toLowerCase()} frequency.`,
          subject: ref("indicator", indicator.id, indicator.name),
          signals: [
            {
              code: "indicator_stale",
              label: "Stale indicator",
              detail:
                measuredDaysAgo === undefined
                  ? "No measurement date recorded."
                  : `${measuredDaysAgo} days since the last reading.`,
              weight: 12,
              ref: ref("indicator", indicator.id),
            },
          ],
          sources: outcome
            ? [ref("indicator", indicator.id), ref("outcome", outcome.id)]
            : [ref("indicator", indicator.id)],
          action: programme
            ? { label: "Update measurement", href: `/programmes/${programme.id}` }
            : undefined,
        }),
      );
      continue;
    }

    // Off track: progress against target, compared with time elapsed. Only
    // computed where the programme states a period, because "behind schedule"
    // is meaningless without one.
    if (programme?.startDate && programme.endDate) {
      const start = parseISO(programme.startDate).getTime();
      const end = parseISO(programme.endDate).getTime();
      const elapsed = ((s.now.getTime() - start) / (end - start)) * 100;
      if (elapsed > 10 && elapsed < 110) {
        const progress = indicatorProgress(indicator);
        const gap = elapsed - progress;
        if (gap >= ATTENTION_THRESHOLDS.offTrackPercentagePoints) {
          items.push(
            build({
              id: `indicator_off_track:${indicator.id}`,
              category: "impact",
              kind: "risk",
              severity: gap >= 40 ? "high" : "medium",
              title: `${indicator.name} is behind target`,
              detail: `${progress}% of target reached with ${Math.round(elapsed)}% of the programme period elapsed.`,
              subject: ref("indicator", indicator.id, indicator.name),
              signals: [
                {
                  code: "indicator_off_track",
                  label: "Behind target",
                  detail: `${Math.round(gap)} percentage points behind the time-elapsed position.`,
                  weight: Math.min(20, Math.round(gap / 2)),
                  ref: ref("indicator", indicator.id),
                },
              ],
              sources: [ref("indicator", indicator.id), ref("programme", programme.id)],
              action: { label: "Open programme", href: `/programmes/${programme.id}` },
            }),
          );
        }
      }
    }
  }

  // Outcomes nothing evidences. Not the same as an outcome not achieved.
  const evidencedTargets = new Set(
    s.evidenceTargets.map((link) => `${link.targetType}:${link.targetId}`),
  );
  for (const outcome of s.outcomes) {
    const programme = programmeById.get(outcome.programmeId);
    if (programme && programme.status !== "active") continue;
    const indicators = s.indicators.filter((i) => i.outcomeId === outcome.id);
    const evidenced =
      evidencedTargets.has(`outcome:${outcome.id}`) ||
      indicators.some(
        (i) =>
          evidencedTargets.has(`indicator:${i.id}`) ||
          s.measurements.some(
            (m) =>
              m.indicatorId === i.id && evidencedTargets.has(`indicator_measurement:${m.id}`),
          ),
      );
    if (evidenced) continue;
    items.push(
      build({
        id: `outcome_unevidenced:${outcome.id}`,
        category: "evidence",
        kind: "risk",
        severity: "medium",
        title: `No evidence supports ${outcome.title}`,
        detail:
          "This outcome is claimed in the results chain but nothing in the evidence library supports it or its indicators.",
        subject: ref("outcome", outcome.id, outcome.title),
        signals: [
          {
            code: "outcome_unevidenced",
            label: "No supporting evidence",
            detail: `${indicators.length} indicator${indicators.length === 1 ? "" : "s"}, none evidenced.`,
            weight: 12,
            ref: ref("outcome", outcome.id),
          },
        ],
        sources: [ref("outcome", outcome.id), ...indicators.map((i) => ref("indicator", i.id))],
        action: { label: "Add evidence", href: "/evidence" },
      }),
    );
  }

  return items;
}

// --- Relationships ------------------------------------------------------

export function detectRelationshipAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const orgById = new Map(s.externalOrganisations.map((o) => [o.id, o]));
  const personById = new Map(s.people.map((p) => [p.id, p]));

  /**
   * A relationship has no name of its own: it is a relationship *with* a body
   * or a person, and the name belongs to them. Resolving it here rather than
   * denormalising a copy onto the relationship is the same rule that keeps
   * `lastInteractionAt` off the record.
   */
  const nameOf = (relationship: (typeof s.relationships)[number]): string => {
    if (relationship.externalOrganisationId) {
      return orgById.get(relationship.externalOrganisationId)?.name ?? "This relationship";
    }
    if (relationship.personId) {
      const person = personById.get(relationship.personId);
      if (person) return `${person.preferredName ?? person.firstName} ${person.lastName}`;
    }
    return "This relationship";
  };

  for (const relationship of s.relationships) {
    if (relationship.status !== "active") continue;

    const personIds = new Set<string>(
      s.people
        .filter(
          (p) =>
            relationship.externalOrganisationId !== undefined &&
            p.primaryExternalOrganisationId === relationship.externalOrganisationId,
        )
        .map((p) => p.id),
    );
    if (relationship.personId) personIds.add(relationship.personId);

    const interactions = s.interactions.filter(
      (interaction) =>
        (relationship.externalOrganisationId !== undefined &&
          interaction.externalOrganisationIds.includes(relationship.externalOrganisationId)) ||
        interaction.personIds.some((id) => personIds.has(id)),
    );
    const commitments = s.commitments.filter(
      (c) =>
        (c.externalOrganisationId !== undefined &&
          c.externalOrganisationId === relationship.externalOrganisationId) ||
        (c.personId !== undefined && personIds.has(c.personId)),
    );

    const partyGrants = s.grants.filter((g) =>
      s.funders.some(
        (f) =>
          f.id === g.funderId &&
          f.externalOrganisationId !== undefined &&
          f.externalOrganisationId === relationship.externalOrganisationId,
      ),
    );
    const activeFunding = partyGrants.filter((g) => g.status === "active");

    const health = computeRelationshipHealth({
      relationship,
      interactions,
      commitments,
      activeFundingCount: activeFunding.length,
      historicalFundingCount: partyGrants.length - activeFunding.length,
      activePartnershipCount: s.relationshipLinks.filter(
        (l) => l.relationshipId === relationship.id && l.entity.type === "programme",
      ).length,
      now: s.now,
    });

    // `dormant` and `needs_attention` are the two states the health engine
    // uses to say something has gone wrong. The others describe a working
    // relationship and do not belong on a triage list.
    if (health.state === "needs_attention" || health.state === "dormant") {
      const negatives = health.signals.filter((sig) => sig.effect === "negative");
      items.push(
        build({
          id: `relationship_health:${relationship.id}`,
          category: "relationships",
          kind: "risk",
          severity:
            health.state === "needs_attention" && activeFunding.length > 0 ? "high" : "medium",
          title: `${nameOf(relationship)} needs attention`,
          detail: health.reason,
          subject: ref("relationship", relationship.id, nameOf(relationship)),
          signals: negatives.length
            ? negatives.map((sig) => ({
                code: sig.key,
                label: sig.label,
                detail: sig.detail,
                weight: 8,
                ref: ref("relationship", relationship.id),
              }))
            : [
                {
                  code: `relationship_${health.state}`,
                  label: "Relationship health",
                  detail: health.reason,
                  weight: 8,
                  ref: ref("relationship", relationship.id),
                },
              ],
          sources: [
            ref("relationship", relationship.id),
            ...activeFunding.map((g) => ref("grant", g.id)),
          ],
          action: relationship.externalOrganisationId
            ? {
                label: "Open relationship",
                href: `/relationships/${relationship.externalOrganisationId}`,
              }
            : undefined,
        }),
      );
    }
  }

  for (const commitment of s.commitments) {
    if (commitmentState(commitment, s.now) !== "overdue") continue;
    const days = daysUntil(commitment.dueAt, s.now);
    items.push(
      build({
        id: `commitment_overdue:${commitment.id}`,
        category: "relationships",
        kind: "obligation",
        // "We owe" outranks "they owe" because only one of the two is within
        // the organisation's control to discharge today.
        severity: commitment.direction === "they_owe" ? "medium" : "high",
        title:
          commitment.direction === "they_owe"
            ? `Outstanding from them: ${commitment.title}`
            : `We owe: ${commitment.title}`,
        detail: `Due ${commitment.dueAt}, still open.`,
        subject: ref("commitment", commitment.id, commitment.title),
        dueInDays: days,
        signals: [
          {
            code: "commitment_overdue",
            label: "Overdue commitment",
            detail: `Due ${commitment.dueAt}, still open.`,
            weight: commitment.direction === "they_owe" ? 8 : 15,
            ref: ref("commitment", commitment.id),
          },
        ],
        sources: commitment.relatedEntity
          ? [ref("commitment", commitment.id), commitment.relatedEntity]
          : [ref("commitment", commitment.id)],
        action: { label: "Open relationships", href: "/relationships" },
      }),
    );
  }

  return items;
}

// --- Governance and strategy --------------------------------------------

export function detectGovernanceAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const conflict of s.claimConflicts.filter((c) => !c.resolvedClaimId)) {
    items.push(
      build({
        id: `claim_conflict:${conflict.id}`,
        category: "governance",
        kind: "risk",
        severity: "medium",
        title: `Conflicting information about ${conflict.predicate.replace(/_/g, " ")}`,
        detail: conflict.reason,
        subject: conflict.subject,
        signals: [
          {
            code: "claim_conflict",
            label: "Conflicting sources",
            detail: `${conflict.claimIds.length} claims disagree and none has been chosen.`,
            weight: 10,
          },
        ],
        sources: [conflict.subject, ...conflict.claimIds.map((id) => ref("claim", id))],
        claimIds: conflict.claimIds,
        action: { label: "Resolve", href: "/organisation" },
      }),
    );
  }

  if (s.profile) {
    const governanceFields: [string, { verification: string }][] = [
      ["Safeguarding", s.profile.safeguardingStatus],
      ["Data protection", s.profile.dataProtectionStatus],
      ["Insurance", s.profile.insuranceStatus],
    ];
    for (const [label, field] of governanceFields) {
      if (field.verification !== "outdated" && field.verification !== "needs_review") continue;
      items.push(
        build({
          id: `governance_field:${label.toLowerCase().replace(/\s+/g, "_")}`,
          category: "governance",
          kind: "obligation",
          severity: field.verification === "outdated" ? "medium" : "low",
          title: `${label} status is ${field.verification.replace(/_/g, " ")}`,
          detail:
            "Funders ask for this in most applications. It is recorded but not currently verified.",
          subject: ref("organisation", s.organisationId),
          signals: [
            {
              code: "governance_unverified",
              label: "Unverified governance record",
              detail: `${label} is marked ${field.verification.replace(/_/g, " ")}.`,
              weight: 6,
            },
          ],
          action: { label: "Open organisation", href: "/organisation" },
        }),
      );
    }
  }

  return items;
}

export function detectStrategyAttention(s: MissionSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const priority of s.strategicPriorities) {
    if (priority.status !== "active") continue;
    const pursued = s.relations.filter(
      (r) =>
        r.kind === "pursues" && r.from.type === "strategic_priority" && r.from.id === priority.id,
    );
    if (pursued.length > 0) continue;
    items.push(
      build({
        id: `priority_unpursued:${priority.id}`,
        category: "strategy",
        kind: "observation",
        severity: "low",
        title: `${priority.title} has no delivery behind it`,
        detail:
          "This priority is active but no programme or funding need is linked to it, so no delivery can be traced to it.",
        subject: ref("strategic_priority", priority.id, priority.title),
        signals: [
          {
            code: "priority_unpursued",
            label: "Priority without delivery",
            detail: "No pursues edge into a programme or funding need.",
            weight: 5,
            ref: ref("strategic_priority", priority.id),
          },
        ],
        action: { label: "Open organisation", href: "/organisation" },
      }),
    );
  }

  return items;
}

// --- The whole board ----------------------------------------------------

export const DETECTORS: ((s: MissionSnapshot) => AttentionItem[])[] = [
  detectGrantAttention,
  detectReportAttention,
  detectFundingAttention,
  detectOpportunityAttention,
  detectFinanceAttention,
  detectDeliveryAttention,
  detectRelationshipAttention,
  detectGovernanceAttention,
  detectStrategyAttention,
];

/** Every single-domain signal, ranked. Cross-domain combination is separate. */
export function detectAttention(s: MissionSnapshot): AttentionItem[] {
  return rankAttention(DETECTORS.flatMap((detector) => detector(s)));
}
