"use server";

import { revalidatePath } from "next/cache";
import {
  buildReportBriefing,
  detectReportDrift,
  publishedVersion,
  renderReport,
  RendererUnavailableError,
  type ReportBriefing,
  type ReportFormat,
} from "@/lib/reporting";
import type { ApprovalDecision, ReportDrift, ReportVersion } from "@/types/domain";
import { getRepository } from "@/server/data";
import { authorise, ok, type ActionResult } from "./authorise";
import type { CreateReportInit } from "@/server/data/types";

/**
 * Reporting engine server actions.
 *
 * The capability split follows the one the permission model already makes and
 * that the audit called load-bearing: `reports:manage` edits, `reports:approve`
 * decides. A trustee reviewer holds the second and not the first, which is the
 * whole point — a trustee approves what the organisation produced without
 * being able to rewrite it.
 */

export interface CreateReportResult extends ActionResult {
  reportId?: string;
}

export async function createReport(init: CreateReportInit): Promise<CreateReportResult> {
  const auth = await authorise("reports:manage");
  if (!auth.ok) return auth.result;

  const reportId = await getRepository().reports.create(auth.ctx, init);
  revalidatePath("/impact");
  return { ...ok, reportId };
}

export interface VersionResult extends ActionResult {
  version?: ReportVersion;
}

/**
 * Cut a version.
 *
 * Publishing without cutting a version would leave the funder's copy resolving
 * against live data, which is the failure the whole phase exists to prevent.
 * So publication goes through here and nowhere else.
 */
export async function cutReportVersion(
  reportId: string,
  reason: ReportVersion["reason"],
  note?: string,
): Promise<VersionResult> {
  const auth = await authorise("reports:manage");
  if (!auth.ok) return auth.result;

  const version = await getRepository().reports.cutVersion(auth.ctx, reportId, reason, note);
  if (!version) return { ok: false, message: "That report could not be found." };

  revalidatePath(`/impact/${reportId}`);
  return { ...ok, version };
}

export async function decideOnVersion(
  reportId: string,
  versionId: string,
  decision: ApprovalDecision,
  comment?: string,
): Promise<ActionResult> {
  const auth = await authorise("reports:approve");
  if (!auth.ok) return auth.result;

  if (decision === "changes_requested" && !comment?.trim()) {
    return {
      ok: false,
      message: "Say what needs to change. An unexplained rejection cannot be acted on.",
    };
  }

  const id = await getRepository().reports.recordApproval(auth.ctx, {
    reportId,
    versionId,
    decision,
    comment,
  });
  if (!id) return { ok: false, message: "That version could not be found." };

  revalidatePath(`/impact/${reportId}`);
  return ok;
}

export interface ExportResult extends ActionResult {
  fileName?: string;
  mediaType?: string;
  content?: string;
}

/**
 * Export a report.
 *
 * Text formats only, and the refusal for the others is surfaced verbatim
 * rather than translated into a generic error: an organisation asking for a
 * PDF is owed the reason it cannot have one.
 */
export async function exportReport(
  reportId: string,
  format: ReportFormat,
): Promise<ExportResult> {
  const auth = await authorise("read");
  if (!auth.ok) return auth.result;

  const repo = getRepository();
  const report = await repo.reports.get(auth.ctx, reportId);
  if (!report) return { ok: false, message: "That report could not be found." };

  const claims = await repo.claims.list(auth.ctx);

  // A published report exports the version that was published, not the live
  // document. Exporting live content under a published report's name is the
  // same failure as re-rendering it.
  const versions = await repo.reports.versions(auth.ctx, reportId);
  const published = publishedVersion(versions);
  const source =
    published && (report.status === "submitted" || report.status === "approved")
      ? { ...report, sections: published.sections }
      : report;

  try {
    const rendered = renderReport(source, claims, format, auth.ctx.now());
    return {
      ...ok,
      fileName: rendered.fileName,
      mediaType: rendered.mediaType,
      content: typeof rendered.content === "string" ? rendered.content : undefined,
    };
  } catch (error) {
    if (error instanceof RendererUnavailableError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export interface WorkspaceResult {
  ok: boolean;
  briefing?: ReportBriefing;
  versions?: ReportVersion[];
  drift?: ReportDrift[];
  message?: string;
}

/**
 * Everything a drafter needs before writing a word.
 *
 * Assembled server-side in one call rather than by the page making six, so the
 * briefing a person reads and the readiness the approval gate uses are the
 * same computation over the same reads.
 */
export async function loadReportWorkspace(reportId: string): Promise<WorkspaceResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, message: auth.result.message };

  const repo = getRepository();
  const ctx = auth.ctx;
  const report = await repo.reports.get(ctx, reportId);
  if (!report) return { ok: false, message: "That report could not be found." };

  const [claims, evidence, indicators, versions] = await Promise.all([
    repo.claims.list(ctx),
    repo.evidence.list(ctx),
    repo.programmes.allIndicators(ctx),
    repo.reports.versions(ctx, reportId),
  ]);

  const requirements = report.definitionId
    ? await repo.reports.requirements(ctx, report.definitionId)
    : [];
  const funderRequirements = report.grantId
    ? await repo.requirements.forGrant(ctx, report.grantId)
    : [];
  const commitments = await repo.relationships.listCommitments(ctx);

  const previous = publishedVersion(versions);
  const previousSnapshot = previous?.snapshotId
    ? await repo.reports.getSnapshot(ctx, previous.snapshotId)
    : null;

  const briefing = buildReportBriefing({
    report,
    claims,
    evidence,
    indicators,
    requirements,
    funderRequirements,
    commitments,
    previousSnapshot,
    now: ctx.now(),
  });

  const drift = previousSnapshot
    ? detectReportDrift({
        snapshot: previousSnapshot,
        versionId: previous!.id,
        claims,
        indicators,
      })
    : [];

  return { ok: true, briefing, versions, drift };
}
