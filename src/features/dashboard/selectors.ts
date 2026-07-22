import { deadlineInfo } from "@/lib/formatting";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { applicationCompletion, answersNeedingAttention } from "@/lib/logic/progress";
import { q } from "@/features/store";

/** "Today" for the demonstration workspace. */
export const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export function dashboardMetrics() {
  const opps = q.opportunities();
  const applications = q.applications();
  const grants = q.grants();

  const activePipeline = opps.filter(
    (o) => !["successful", "unsuccessful", "archived"].includes(o.stage),
  );
  const pipelineValue = activePipeline.reduce((s, o) => s + (o.maxAward ?? 0), 0);

  const inProgress = applications.filter(
    (a) => a.status === "in_progress" || a.status === "internal_review",
  );

  const activeGrants = grants.filter((g) => g.status === "active");
  const securedThisYear = grants
    .filter((g) => g.startDate >= "2025-04-01")
    .reduce((s, g) => s + g.awardValue, 0);

  const reportsDue = q
    .allGrantReports()
    .filter((r) => r.status !== "submitted").length;

  // Outcomes awaiting evidence: indicators with no linked evidence via outcome.
  const outcomesAwaitingEvidence = q
    .allIndicators()
    .filter((i) => q.evidenceForTarget("outcome", i.outcomeId).length === 0).length;

  return {
    pipelineValue,
    pipelineCount: activePipeline.length,
    inProgressCount: inProgress.length,
    activeGrantsCount: activeGrants.length,
    securedThisYear,
    reportsDue,
    outcomesAwaitingEvidence,
  };
}

export interface DeadlineRow {
  id: string;
  label: string;
  sublabel: string;
  deadline: string;
  href: string;
}

export function upcomingDeadlines(): DeadlineRow[] {
  const rows: DeadlineRow[] = [];
  q.opportunities()
    .filter((o) => o.deadline)
    .forEach((o) =>
      rows.push({
        id: o.id,
        label: o.programmeName,
        sublabel: q.funder(o.funderId)?.name ?? "Funder",
        deadline: o.deadline!,
        href: `/funding/${o.id}`,
      }),
    );
  q.allGrantReports()
    .filter((r) => r.status !== "submitted")
    .forEach((r) =>
      rows.push({
        id: r.id,
        label: r.title,
        sublabel: q.grant(r.grantId)?.title ?? "Grant",
        deadline: r.dueDate,
        href: `/grants/${r.grantId}`,
      }),
    );
  return rows
    .map((r) => ({ r, info: deadlineInfo(r.deadline, DEMO_NOW) }))
    .filter((x) => x.info.days <= 60)
    .sort((a, b) => a.info.days - b.info.days)
    .map((x) => x.r);
}

export interface Priority {
  title: string;
  detail: string;
  href: string;
  tone: "critical" | "warning" | "info";
}

/**
 * AI-generated priorities for the week. These are derived deterministically
 * from the organisation's real data (deadlines, review states, grant health)
 * rather than invented, in keeping with the trust model.
 */
export function weeklyPriorities(): Priority[] {
  const priorities: Priority[] = [];

  // Imminent funding deadlines.
  upcomingDeadlines()
    .map((r) => ({ r, info: deadlineInfo(r.deadline, DEMO_NOW) }))
    .filter((x) => x.info.days >= 0 && x.info.days <= 14)
    .slice(0, 2)
    .forEach((x) =>
      priorities.push({
        title: `${x.r.label} closes in ${x.info.days} day${x.info.days === 1 ? "" : "s"}`,
        detail: `${x.r.sublabel}. Confirm the submission is on track.`,
        href: x.r.href,
        tone: x.info.days <= 7 ? "critical" : "warning",
      }),
    );

  // Applications with answers needing review.
  q.applications().forEach((app) => {
    const answers = q.answers(app.id);
    const needing = answersNeedingAttention(answers);
    const ready = answers.filter((a) => a.status === "ready_for_review").length;
    if (ready > 0) {
      priorities.push({
        title: `${ready} answer${ready === 1 ? "" : "s"} ready for review`,
        detail: `${app.title}. ${needing} of ${answers.length} answers still need attention.`,
        href: `/applications/${app.id}`,
        tone: "info",
      });
    }
  });

  // Grants needing attention.
  q.grants().forEach((g) => {
    const health = computeGrantHealth({
      grant: g,
      deliverables: q.grantDeliverables(g.id),
      reports: q.grantReports(g.id),
      linkedEvidenceCount: q.evidenceForTarget("grant", g.id).length,
      now: DEMO_NOW,
    });
    if (health.state === "at_risk" || health.state === "attention") {
      priorities.push({
        title: `${g.title}: ${health.state === "at_risk" ? "at risk" : "needs attention"}`,
        detail: health.reasons[0] ?? "",
        href: `/grants/${g.id}`,
        tone: health.state === "at_risk" ? "critical" : "warning",
      });
    }
  });

  return priorities.slice(0, 5);
}

export function applicationsWithProgress() {
  return q.applications().map((app) => ({
    app,
    completion: applicationCompletion(q.answers(app.id)),
    needing: answersNeedingAttention(q.answers(app.id)),
    opportunity: q.opportunity(app.opportunityId),
  }));
}
