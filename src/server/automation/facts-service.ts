import { assessReportCompleteness } from "@/lib/reporting";
import { grantReportFacts, mergeFacts, reportFacts } from "@/lib/automation/facts";
import type { FactBag } from "@/lib/automation/conditions";
import type { EntityReference } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";

/**
 * Facts that need the repository to compute.
 *
 * `lib/automation/facts.ts` is pure and takes records. Some fields a rule
 * author reasonably wants are not on any single record — `report.evidence
 * Completeness` is the brief's own example, and computing it needs claims,
 * evidence and requirements together.
 *
 * The important part is what happens when it cannot be computed: the field is
 * **omitted**, and a condition reading it evaluates to `unknown`. That is why
 * this returns a bag rather than a number with a default. A default of 1.0
 * would mean "the evidence is complete" and a default of 0 would mean "there
 * is none", and both are assertions about an organisation nobody has assessed.
 */

/**
 * A grant report is a deadline, not a document.
 *
 * `GrantReport` has a title, a due date and a status, and no sections. The
 * evidence behind it lives in the `ImpactReport` the organisation is writing
 * for that grant. Joining the two here is what makes "a report is due and its
 * evidence is thin" expressible as one condition rather than as a rule the
 * organisation has to hold in their head.
 */
export async function grantReportFactsWithEvidence(
  ctx: RequestContext,
  repo: MissionRepository,
  grantReportId: string,
): Promise<FactBag> {
  const reports = await repo.grants.allReports(ctx);
  const grantReport = reports.find((report) => report.id === grantReportId);
  if (!grantReport) return {};

  const base = grantReportFacts(grantReport);

  const impactReports = (await repo.reports.list(ctx)).filter(
    (report) => report.grantId === grantReport.grantId,
  );
  if (impactReports.length === 0) {
    // Deliberately no completeness field. The organisation has not started a
    // document for this grant, so there is nothing whose completeness could be
    // measured, and a rule about thin evidence should say "cannot be decided"
    // rather than "evidence is 0% complete".
    return base;
  }

  const [claims, evidence, indicators] = await Promise.all([
    repo.claims.list(ctx),
    repo.evidence.list(ctx),
    repo.programmes.allIndicators(ctx),
  ]);

  let satisfied = 0;
  let total = 0;

  for (const report of impactReports) {
    const requirements = report.definitionId
      ? await repo.reports.requirements(ctx, report.definitionId)
      : [];
    const completeness = assessReportCompleteness({
      report,
      claims,
      evidence,
      indicators,
      requirements,
      now: ctx.now(),
    });
    // Completeness is "requirements met over requirements set", not a blend of
    // seven counts. A single ratio is only defensible where its numerator and
    // denominator are the same kind of thing.
    const missing = completeness.missingEvidence.length;
    const met =
      requirements.length > 0
        ? requirements.filter((requirement) => requirement.required).length - missing
        : report.sections.length - missing;
    const of = requirements.length > 0
      ? requirements.filter((requirement) => requirement.required).length
      : report.sections.length;
    satisfied += Math.max(0, met);
    total += of;
  }

  if (total === 0) return base;

  return mergeFacts(base, {
    "report.evidenceCompleteness": Math.round((satisfied / total) * 100) / 100,
    "report.impactReportId": impactReports[0]!.id,
  });
}

export async function impactReportFacts(
  ctx: RequestContext,
  repo: MissionRepository,
  reportId: string,
): Promise<FactBag> {
  const report = await repo.reports.get(ctx, reportId);
  if (!report) return {};
  return reportFacts({ report });
}

/** Facts for any subject the automation layer knows how to describe. */
export async function factsForSubject(
  ctx: RequestContext,
  repo: MissionRepository,
  subject: EntityReference,
): Promise<FactBag> {
  switch (subject.type) {
    case "grant_report":
      return grantReportFactsWithEvidence(ctx, repo, subject.id);
    case "impact_report":
    case "report":
      return impactReportFacts(ctx, repo, subject.id);
    default:
      return {};
  }
}
