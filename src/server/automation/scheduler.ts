import { differenceInCalendarDays, parseISO } from "date-fns";
import { grantReportFacts, requirementFacts, grantFacts } from "@/lib/automation/facts";
import type { FactBag } from "@/lib/automation/conditions";
import type { DomainEvent, EntityReference, ScheduledJob } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import { dispatch } from "./dispatcher";

/**
 * Time, as a source of events.
 *
 * Every trigger except this one is caused by somebody doing something. A
 * deadline approaching is caused by nothing at all, which is exactly why it is
 * the one the product has never been able to react to — and why §9 link 12 of
 * the architectural acceptance chain, *the relationship owner is reminded 30
 * days before reporting*, has stayed partial through six phases. The data a
 * scheduler needs has existed since MG-1. The scheduler has not.
 *
 * A Postgres table and an in-process runner. No queue, no broker, no worker
 * fleet. Two properties make that sufficient:
 *
 * **Idempotence.** A job carries a `dedupeKey` naming the subject, the horizon
 * and the date. Running the scanner twice produces the same key and the second
 * insert is refused. This is what makes it safe for the scan to run on a
 * request, on a cron, or on both.
 *
 * **Lateness is harmless.** A reminder that fires an hour late is a reminder.
 * Nothing here is a real-time obligation, so the runner does not need
 * guarantees a broker would provide.
 */

export interface DatedObligation {
  subject: EntityReference;
  /** Which field the date came from, e.g. `requirement.dueDate`. */
  dateField: string;
  date: string;
  facts: FactBag;
}

/**
 * Every dated obligation the organisation currently holds.
 *
 * Assembled from records rather than from a calendar table, because a date
 * that is copied into a second place goes stale the moment somebody moves the
 * deadline.
 */
export async function datedObligations(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<DatedObligation[]> {
  const obligations: DatedObligation[] = [];

  const requirements = await repo.requirements.list(ctx);
  for (const requirement of requirements) {
    if (!requirement.dueDate) continue;
    if (requirement.status === "met" || requirement.status === "waived") continue;
    obligations.push({
      subject: {
        type: "reporting_requirement",
        id: requirement.id,
        label: requirement.title,
      },
      dateField: "requirement.dueDate",
      date: requirement.dueDate,
      facts: requirementFacts(requirement),
    });
  }

  const grantReports = await repo.grants.allReports(ctx);
  for (const report of grantReports) {
    if (report.status === "submitted") continue;
    obligations.push({
      subject: { type: "grant_report", id: report.id, label: report.title },
      dateField: "report.dueDate",
      date: report.dueDate,
      facts: grantReportFacts(report),
    });
  }

  const grants = await repo.grants.list(ctx);
  for (const grant of grants) {
    if (grant.status !== "active") continue;
    const [deliverables, reports] = await Promise.all([
      repo.grants.deliverables(ctx, grant.id),
      repo.grants.reports(ctx, grant.id),
    ]);
    obligations.push({
      subject: { type: "grant", id: grant.id, label: grant.title },
      dateField: "grant.endDate",
      date: grant.endDate,
      facts: grantFacts({
        grant,
        deliverables,
        reports,
        linkedEvidenceCount: 0,
        now: ctx.now(),
      }),
    });
  }

  return obligations;
}

export interface ScanResult {
  scanned: number;
  scheduled: ScheduledJob[];
  /** Jobs that already existed. Reported so a scan is legible, not silent. */
  alreadyScheduled: number;
}

/**
 * Schedule reminders for everything approaching its date.
 *
 * The horizons come from the automations themselves: an automation triggering
 * on `date.approaching` declares `daysBefore`, and the scanner schedules only
 * for horizons somebody has actually asked for. A scanner with hard-coded
 * horizons would either miss a rule or fill the job table with reminders
 * nobody wants.
 */
export async function scanDates(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<ScanResult> {
  const now = ctx.now();
  const automations = await repo.automation.activeFor(ctx, "date.approaching");
  const horizons = [
    ...new Set(
      automations
        .map((automation) => automation.trigger.daysBefore)
        .filter((days): days is number => typeof days === "number" && days > 0),
    ),
  ];

  if (horizons.length === 0) {
    return { scanned: 0, scheduled: [], alreadyScheduled: 0 };
  }

  const obligations = await datedObligations(ctx, repo);
  const scheduled: ScheduledJob[] = [];
  let alreadyScheduled = 0;

  for (const obligation of obligations) {
    const due = parseISO(obligation.date);
    if (Number.isNaN(due.getTime())) continue;

    for (const daysBefore of horizons) {
      const daysAway = differenceInCalendarDays(due, now);
      // Only schedule inside the window and not for dates already passed.
      // A reminder about a deadline that went by last month is noise, and the
      // overdue case is a different signal that MG-4's attention board already
      // surfaces.
      if (daysAway < 0 || daysAway > daysBefore) continue;

      const job = await repo.automation.scheduleJob(ctx, {
        kind: "send_reminder",
        subject: obligation.subject,
        // Fire now rather than at the exact horizon: the obligation is already
        // inside the window, and holding a reminder back so it lands on a
        // particular day would need a scheduler that runs on a particular day.
        runAfter: now.toISOString(),
        payload: {
          dateField: obligation.dateField,
          date: obligation.date,
          daysBefore,
          daysAway,
        },
        // Subject, horizon and date together. Including the date means moving
        // a deadline legitimately produces a fresh reminder, while re-running
        // the scanner does not.
        dedupeKey: `reminder:${obligation.subject.type}:${obligation.subject.id}:${daysBefore}:${obligation.date}`,
      });

      if (job) scheduled.push(job);
      else alreadyScheduled += 1;
    }
  }

  return { scanned: obligations.length, scheduled, alreadyScheduled };
}

export interface JobRunResult {
  ran: number;
  events: DomainEvent[];
  failed: number;
}

/**
 * Run whatever is due.
 *
 * Each job becomes a `date.approaching` event and is dispatched exactly as a
 * mutation-driven event is, so a rule triggering on time and a rule triggering
 * on a change take the same path through the same engine.
 */
export async function runDueJobs(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<JobRunResult> {
  const now = ctx.now();
  const jobs = await repo.automation.dueJobs(ctx, now);
  const events: DomainEvent[] = [];
  let failed = 0;

  for (const job of jobs) {
    try {
      if (job.kind !== "send_reminder" || !job.subject) {
        await repo.automation.completeJob(ctx, job.id, "cancelled", "Nothing to do.");
        continue;
      }

      const obligations = await datedObligations(ctx, repo);
      const obligation = obligations.find(
        (candidate) =>
          candidate.subject.type === job.subject!.type &&
          candidate.subject.id === job.subject!.id,
      );

      if (!obligation) {
        // The obligation was met, waived or deleted between scheduling and
        // running. Cancelling rather than firing is the difference between a
        // reminder system people trust and one they mute.
        await repo.automation.completeJob(
          ctx,
          job.id,
          "cancelled",
          "The obligation no longer exists or has been met.",
        );
        continue;
      }

      const event = await repo.automation.recordEvent(ctx, {
        kind: "date.approaching",
        subject: obligation.subject,
        facts: {
          ...(obligation.facts as Record<string, string | number | boolean | null>),
          "job.daysBefore": Number(job.payload.daysBefore ?? 0),
          "job.daysAway": Number(job.payload.daysAway ?? 0),
        },
        occurredAt: now.toISOString(),
      });

      await dispatch(ctx, repo, event);
      await repo.automation.markEventProcessed(ctx, event.id);
      await repo.automation.completeJob(ctx, job.id, "done");
      events.push(event);
    } catch (error) {
      failed += 1;
      await repo.automation.completeJob(ctx, job.id, "failed", (error as Error).message);
    }
  }

  return { ran: jobs.length, events, failed };
}

/** Scan and run, which is what a cron entry or a request-time tick calls. */
export async function tick(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<{ scan: ScanResult; jobs: JobRunResult }> {
  const scan = await scanDates(ctx, repo);
  const jobs = await runDueJobs(ctx, repo);
  return { scan, jobs };
}
