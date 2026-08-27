import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EvidenceItem, Indicator } from "@/types/domain";
import { assessReportReadiness } from "@/lib/reporting";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionTitle } from "@/components/shared/ui";
import { ReportBuilder } from "@/components/impact/ReportBuilder";
import { ReportWorkspace } from "@/components/reporting/ReportWorkspace";
import { loadReportWorkspace } from "@/server/actions/reports";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const report = await getRepository().reports.get(ctx, id);
  return { title: report?.title ?? "Impact report" };
}

export default async function ImpactReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const report = await repo.reports.get(ctx, id);
  if (!report) notFound();

  const [programme, indicators, evidence, claims, deliverables] = await Promise.all([
    report.programmeId ? repo.programmes.get(ctx, report.programmeId) : null,
    Promise.all(
      report.includedIndicatorIds.map((iid) => repo.programmes.getIndicator(ctx, iid)),
    ).then((rows) => rows.filter((i): i is Indicator => Boolean(i))),
    Promise.all(report.includedEvidenceIds.map((eid) => repo.evidence.get(ctx, eid))).then(
      (rows) => rows.filter((e): e is EvidenceItem => Boolean(e)),
    ),
    repo.claims.list(ctx),
    report.grantId ? repo.grants.deliverables(ctx, report.grantId) : [],
  ]);

  const workspace = await loadReportWorkspace(id);

  const readiness = assessReportReadiness({
    report,
    claims,
    indicators,
    evidence,
    deliverables,
    now: ctx.now(),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Impact", href: "/impact" }, { label: report.title }]}
        eyebrow={programme ? `Programme: ${programme.name}` : "Impact report"}
        title={report.title}
        description={`Reporting period: ${report.reportingPeriod}`}
      />
      {/*
        The workspace comes first, deliberately. A drafter who reads what is
        missing before they start does not write a section they cannot support,
        which is the whole reason report intelligence runs before drafting
        rather than as a check afterwards.
      */}
      {workspace.ok && workspace.briefing && (
        <div className="mb-8">
          <SectionTitle>Before you draft</SectionTitle>
          <ReportWorkspace
            briefing={workspace.briefing}
            versions={workspace.versions ?? []}
            drift={workspace.drift ?? []}
          />
        </div>
      )}

      <SectionTitle>Draft</SectionTitle>
      <ReportBuilder
        report={report}
        indicators={indicators}
        evidence={evidence}
        readiness={readiness}
      />
    </div>
  );
}
