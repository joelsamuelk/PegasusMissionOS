import { deadlineInfo } from "@/lib/formatting";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { applicationCompletion, answersNeedingAttention } from "@/lib/logic/progress";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";

/**
 * Command Centre selectors.
 *
 * Every selector takes the request context and the repository rather than
 * reading a process-global store, so the figures on the dashboard are scoped to
 * the caller's organisation and dated by the request clock. "Now" is
 * `ctx.now()` — these selectors previously pinned a module constant, which made
 * every deadline calculation independent of the request.
 */

export async function dashboardMetrics(ctx: RequestContext, repo: MissionRepository) {
  const [opps, applications, grants, grantReports, indicators] = await Promise.all([
    repo.funding.listOpportunities(ctx),
    repo.applications.list(ctx),
    repo.grants.list(ctx),
    repo.grants.allReports(ctx),
    repo.programmes.allIndicators(ctx),
  ]);

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

  const reportsDue = grantReports.filter((r) => r.status !== "submitted").length;

  // Outcomes awaiting evidence: indicators whose outcome has no linked evidence.
  // Resolved once per distinct outcome rather than once per indicator.
  const outcomeIds = [...new Set(indicators.map((i) => i.outcomeId))];
  const evidenceByOutcome = await Promise.all(
    outcomeIds.map(async (outcomeId) => ({
      outcomeId,
      count: (await repo.evidence.forTarget(ctx, "outcome", outcomeId)).length,
    })),
  );
  const outcomesWithoutEvidence = new Set(
    evidenceByOutcome.filter((e) => e.count === 0).map((e) => e.outcomeId),
  );
  const outcomesAwaitingEvidence = indicators.filter((i) =>
    outcomesWithoutEvidence.has(i.outcomeId),
  ).length;

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

export async function upcomingDeadlines(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<DeadlineRow[]> {
  const [opportunities, funders, grantReports, grants] = await Promise.all([
    repo.funding.listOpportunities(ctx),
    repo.funding.listFunders(ctx),
    repo.grants.allReports(ctx),
    repo.grants.list(ctx),
  ]);
  const funderById = new Map(funders.map((f) => [f.id, f]));
  const grantById = new Map(grants.map((g) => [g.id, g]));

  const rows: DeadlineRow[] = [];

  for (const o of opportunities) {
    if (!o.deadline) continue;
    rows.push({
      id: o.id,
      label: o.programmeName,
      sublabel: funderById.get(o.funderId)?.name ?? "Funder",
      deadline: o.deadline,
      href: `/funding/${o.id}`,
    });
  }

  for (const r of grantReports) {
    if (r.status === "submitted") continue;
    rows.push({
      id: r.id,
      label: r.title,
      sublabel: grantById.get(r.grantId)?.title ?? "Grant",
      deadline: r.dueDate,
      href: `/grants/${r.grantId}`,
    });
  }

  const now = ctx.now();
  return rows
    .map((r) => ({ r, info: deadlineInfo(r.deadline, now) }))
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
 * Priorities for the week, derived deterministically from the organisation's
 * real data (deadlines, review states, grant health) rather than generated.
 */
export async function weeklyPriorities(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<Priority[]> {
  const now = ctx.now();
  const priorities: Priority[] = [];

  // Imminent funding deadlines.
  const deadlines = await upcomingDeadlines(ctx, repo);
  deadlines
    .map((r) => ({ r, info: deadlineInfo(r.deadline, now) }))
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
  const applications = await repo.applications.list(ctx);
  const applicationAnswers = await Promise.all(
    applications.map(async (app) => ({
      app,
      answers: await repo.applications.answers(ctx, app.id),
    })),
  );
  for (const { app, answers } of applicationAnswers) {
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
  }

  // Grants needing attention.
  const grants = await repo.grants.list(ctx);
  const grantHealth = await Promise.all(
    grants.map(async (g) => {
      const [deliverables, reports, evidence] = await Promise.all([
        repo.grants.deliverables(ctx, g.id),
        repo.grants.reports(ctx, g.id),
        repo.evidence.forTarget(ctx, "grant", g.id),
      ]);
      return {
        grant: g,
        health: computeGrantHealth({
          grant: g,
          deliverables,
          reports,
          linkedEvidenceCount: evidence.length,
          now,
        }),
      };
    }),
  );
  for (const { grant, health } of grantHealth) {
    if (health.state === "at_risk" || health.state === "attention") {
      priorities.push({
        title: `${grant.title}: ${health.state === "at_risk" ? "at risk" : "needs attention"}`,
        detail: health.reasons[0] ?? "",
        href: `/grants/${grant.id}`,
        tone: health.state === "at_risk" ? "critical" : "warning",
      });
    }
  }

  return priorities.slice(0, 5);
}

export async function applicationsWithProgress(
  ctx: RequestContext,
  repo: MissionRepository,
) {
  const applications = await repo.applications.list(ctx);
  return Promise.all(
    applications.map(async (app) => {
      const [answers, opportunity] = await Promise.all([
        repo.applications.answers(ctx, app.id),
        repo.funding.getOpportunity(ctx, app.opportunityId),
      ]);
      return {
        app,
        completion: applicationCompletion(answers),
        needing: answersNeedingAttention(answers),
        opportunity: opportunity ?? undefined,
      };
    }),
  );
}
