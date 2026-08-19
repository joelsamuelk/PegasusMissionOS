import type {
  Claim,
  EvidenceItem,
  GrantDeliverable,
  ImpactReport,
  Indicator,
  ReportStatus,
} from "@/types/domain";

export { REPORT_TEMPLATES } from "./templates";

export const REPORT_STATUS_ORDER: readonly ReportStatus[] = [
  "draft",
  "collecting_evidence",
  "drafting",
  "internal_review",
  "changes_requested",
  "ready_for_approval",
  "approved",
  "submitted",
  "archived",
];

const TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  draft: ["collecting_evidence", "drafting"],
  collecting_evidence: ["drafting"],
  drafting: ["collecting_evidence", "internal_review"],
  internal_review: ["changes_requested", "ready_for_approval"],
  changes_requested: ["drafting", "internal_review"],
  ready_for_approval: ["changes_requested", "approved"],
  approved: ["submitted", "changes_requested"],
  submitted: ["archived"],
  archived: [],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type ReadinessIssueKind =
  | "empty_section"
  | "missing_evidence"
  | "stale_indicator"
  | "unsupported_claim"
  | "superseded_claim"
  | "incomplete_deliverable"
  | "inconsistent_figure";

export interface ReportReadinessIssue {
  kind: ReadinessIssueKind;
  severity: "blocker" | "warning";
  message: string;
  sectionKey?: string;
  claimId?: string;
}

export interface ReportReadiness {
  score: number;
  readyForApproval: boolean;
  issues: ReportReadinessIssue[];
}

export interface ReportReadinessInput {
  report: ImpactReport;
  claims: Claim[];
  indicators: Indicator[];
  evidence: EvidenceItem[];
  deliverables?: GrantDeliverable[];
  now: Date;
  staleAfterDays?: number;
}

/**
 * Deterministic readiness. It never asks a model whether a report is safe to
 * approve: every deduction names the record that caused it.
 */
export function assessReportReadiness(input: ReportReadinessInput): ReportReadiness {
  const { report, claims, indicators, evidence, deliverables = [], now } = input;
  const staleAfterDays = input.staleAfterDays ?? 120;
  const issues: ReportReadinessIssue[] = [];
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  for (const section of report.sections) {
    if (!section.content.trim()) {
      issues.push({
        kind: "empty_section",
        severity: "blocker",
        sectionKey: section.key,
        message: `${section.title} has not been drafted.`,
      });
    }
    // Existing in-memory sessions may contain the pre-Slice-D shape until the
    // process restarts. Treat it as an uncited section during the migration.
    for (const claimId of section.claimIds ?? []) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        issues.push({
          kind: "unsupported_claim",
          severity: "blocker",
          sectionKey: section.key,
          claimId,
          message: `${section.title} references a claim that is not available.`,
        });
      } else if (claim.supersededBy) {
        issues.push({
          kind: "superseded_claim",
          severity: "warning",
          sectionKey: section.key,
          claimId,
          message: `${section.title} uses a claim that has since been corrected.`,
        });
      }
    }
  }

  if (report.includedEvidenceIds.length === 0 || evidence.length === 0) {
    issues.push({
      kind: "missing_evidence",
      severity: "blocker",
      message: "No evidence is included in this report.",
    });
  }

  const staleBefore = now.getTime() - staleAfterDays * 86_400_000;
  for (const indicator of indicators) {
    if (!indicator.lastUpdated || new Date(indicator.lastUpdated).getTime() < staleBefore) {
      issues.push({
        kind: "stale_indicator",
        severity: "warning",
        message: `${indicator.name} is older than ${staleAfterDays} days or has no update date.`,
      });
    }
  }

  for (const deliverable of deliverables) {
    if (deliverable.status !== "complete") {
      issues.push({
        kind: "incomplete_deliverable",
        severity: deliverable.status === "overdue" ? "blocker" : "warning",
        message: `${deliverable.title} is ${deliverable.status.replace(/_/g, " ")}.`,
      });
    }
  }

  // Two current claims for the same fact with different values means the
  // report cannot safely choose one. Superseded claims are excluded because
  // their relationship is already explicit and reported above.
  const currentByPredicate = new Map<string, Claim>();
  for (const claim of claims.filter((candidate) => !candidate.supersededBy)) {
    const key = `${claim.subject.type}:${claim.subject.id}:${claim.predicate}`;
    const previous = currentByPredicate.get(key);
    if (previous && JSON.stringify(previous.value) !== JSON.stringify(claim.value)) {
      issues.push({
        kind: "inconsistent_figure",
        severity: "blocker",
        claimId: claim.id,
        message: `Conflicting current values exist for ${claim.predicate.replace(/_/g, " ")}.`,
      });
    } else {
      currentByPredicate.set(key, claim);
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = issues.length - blockers;
  const score = Math.max(0, 100 - blockers * 15 - warnings * 5);
  return { score, readyForApproval: blockers === 0, issues };
}

export interface ReportExportDocument {
  title: string;
  type: ImpactReport["type"];
  reportingPeriod: string;
  status: ReportStatus;
  generatedAt: string;
  sections: Array<{
    title: string;
    type: ImpactReport["sections"][number]["type"];
    content: string;
    claims: Array<{ id: string; text: string; sources: Claim["sources"] }>;
  }>;
}

/** Provider-neutral export payload. PDF, DOCX and HTML adapters consume this. */
export function buildReportExport(
  report: ImpactReport,
  claims: Claim[],
  generatedAt: Date,
): ReportExportDocument {
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  return {
    title: report.title,
    type: report.type ?? "impact",
    reportingPeriod: report.reportingPeriod,
    status: report.status,
    generatedAt: generatedAt.toISOString(),
    sections: report.sections.map((section) => ({
      title: section.title,
      type: section.type,
      content: section.content,
      claims: (section.claimIds ?? []).flatMap((id) => {
        const claim = claimsById.get(id);
        return claim ? [{ id: claim.id, text: claim.text, sources: claim.sources }] : [];
      }),
    })),
  };
}
