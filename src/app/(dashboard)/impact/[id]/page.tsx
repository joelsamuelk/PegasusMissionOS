import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EvidenceItem, Indicator } from "@/types/domain";
import { q } from "@/features/store";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportBuilder } from "@/components/impact/ReportBuilder";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: q.impactReport(id)?.title ?? "Impact report" };
}

export default async function ImpactReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = q.impactReport(id);
  if (!report) notFound();

  const programme = report.programmeId ? q.programme(report.programmeId) : undefined;
  const indicators = report.includedIndicatorIds
    .map((iid) => q.indicator(iid))
    .filter((i): i is Indicator => Boolean(i));
  const evidence = report.includedEvidenceIds
    .map((eid) => q.evidenceItem(eid))
    .filter((e): e is EvidenceItem => Boolean(e));

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
