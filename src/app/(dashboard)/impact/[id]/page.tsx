import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EvidenceItem, Indicator } from "@/types/domain";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportBuilder } from "@/components/impact/ReportBuilder";

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

  const [programme, indicators, evidence] = await Promise.all([
    report.programmeId ? repo.programmes.get(ctx, report.programmeId) : null,
    Promise.all(
      report.includedIndicatorIds.map((iid) => repo.programmes.getIndicator(ctx, iid)),
    ).then((rows) => rows.filter((i): i is Indicator => Boolean(i))),
    Promise.all(report.includedEvidenceIds.map((eid) => repo.evidence.get(ctx, eid))).then(
      (rows) => rows.filter((e): e is EvidenceItem => Boolean(e)),
    ),
  ]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Impact", href: "/impact" }, { label: report.title }]}
        eyebrow={programme ? `Programme: ${programme.name}` : "Impact report"}
        title={report.title}
        description={`Reporting period: ${report.reportingPeriod}`}
      />
      <ReportBuilder report={report} indicators={indicators} evidence={evidence} />
    </div>
  );
}
