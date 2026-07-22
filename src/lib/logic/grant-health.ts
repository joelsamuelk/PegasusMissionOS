import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Grant,
  GrantDeliverable,
  GrantHealth,
  GrantReport,
} from "@/types/domain";

export interface GrantHealthInput {
  grant: Grant;
  deliverables: GrantDeliverable[];
  reports: GrantReport[];
  /** Count of evidence items linked to this grant. */
  linkedEvidenceCount: number;
  now?: Date;
}

export interface GrantHealthResult {
  state: GrantHealth;
  reasons: string[];
  budgetUsedPercent: number;
  timeElapsedPercent: number;
  overdueDeliverables: number;
  overdueReports: number;
}

/**
 * Derive grant health from deadlines, deliverables, financial position and
 * evidence completeness. Deterministic and testable.
 */
export function computeGrantHealth(input: GrantHealthInput): GrantHealthResult {
  const { grant, deliverables, reports, linkedEvidenceCount } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  if (grant.status === "completed" || grant.status === "closed") {
    return {
      state: "completed",
      reasons: ["Grant has been completed."],
      budgetUsedPercent: grant.awardValue ? (grant.spentToDate / grant.awardValue) * 100 : 0,
      timeElapsedPercent: 100,
      overdueDeliverables: 0,
      overdueReports: 0,
    };
  }

  const start = parseISO(grant.startDate).getTime();
  const end = parseISO(grant.endDate).getTime();
  const timeElapsedPercent =
    end > start
      ? Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100))
      : 0;
  const budgetUsedPercent = grant.awardValue
    ? (grant.spentToDate / grant.awardValue) * 100
    : 0;

  const overdueDeliverables = deliverables.filter(
    (d) =>
      d.status !== "complete" && differenceInCalendarDays(parseISO(d.dueDate), now) < 0,
  ).length;
  const overdueReports = reports.filter(
    (r) =>
      r.status !== "submitted" && differenceInCalendarDays(parseISO(r.dueDate), now) < 0,
  ).length;

  let score = 0; // higher = worse

  if (overdueDeliverables > 0) {
    score += overdueDeliverables >= 2 ? 3 : 2;
    reasons.push(`${overdueDeliverables} deliverable(s) overdue.`);
  }
  if (overdueReports > 0) {
    score += 3;
    reasons.push(`${overdueReports} report(s) overdue.`);
  }

  // Spend running well ahead of time.
  if (budgetUsedPercent - timeElapsedPercent > 25) {
    score += 2;
    reasons.push("Spend is running ahead of the delivery timeline.");
  }
  // Spend lagging badly (underspend risk).
  if (timeElapsedPercent - budgetUsedPercent > 35 && timeElapsedPercent > 40) {
    score += 1;
    reasons.push("Spend is behind the delivery timeline (underspend risk).");
  }

  if (linkedEvidenceCount === 0 && timeElapsedPercent > 40) {
    score += 1;
    reasons.push("No evidence has been linked to this grant yet.");
  }

  // Report due soon.
  const reportDueSoon = reports.some(
    (r) =>
      r.status !== "submitted" &&
      differenceInCalendarDays(parseISO(r.dueDate), now) >= 0 &&
      differenceInCalendarDays(parseISO(r.dueDate), now) <= 14,
  );
  if (reportDueSoon) {
    score += 1;
    reasons.push("A report is due within two weeks.");
  }

  let state: GrantHealth;
  if (score >= 4) state = "at_risk";
  else if (score >= 2) state = "attention";
  else state = "on_track";

  if (reasons.length === 0) reasons.push("Deliverables, spend and reporting are on schedule.");

  return {
    state,
    reasons,
    budgetUsedPercent: Math.round(budgetUsedPercent),
    timeElapsedPercent: Math.round(timeElapsedPercent),
    overdueDeliverables,
    overdueReports,
  };
}

export const GRANT_HEALTH_LABELS: Record<GrantHealth, string> = {
  on_track: "On track",
  attention: "Attention required",
  at_risk: "At risk",
  completed: "Completed",
};
