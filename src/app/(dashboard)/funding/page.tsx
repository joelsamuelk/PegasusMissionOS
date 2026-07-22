import type { Metadata } from "next";
import { formatCurrency } from "@/lib/formatting";
import { q } from "@/features/store";
import { PageHeader } from "@/components/shared/PageHeader";
import { FundingPipeline } from "@/components/funding/FundingPipeline";

export const metadata: Metadata = { title: "Funding" };

export default function FundingPage() {
  const opportunities = q.opportunities().map((o) => ({
    ...o,
    funderName: q.funder(o.funderId)?.name ?? "Funder",
    ownerName: q.user(o.ownerId)?.name,
  }));

  const pipelineValue = opportunities
    .filter((o) => !["successful", "unsuccessful", "archived"].includes(o.stage))
    .reduce((s, o) => s + (o.maxAward ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Funding pipeline"
        title="Funding"
        description="Every opportunity in one place. Demonstration opportunities are drawn from fictional funders and clearly labelled as sample data."
      />
      <div className="mb-5 flex flex-wrap gap-6 border-b border-line pb-4 text-sm">
        <Stat label="Pipeline value" value={formatCurrency(pipelineValue)} />
        <Stat label="Opportunities" value={String(opportunities.length)} />
        <Stat label="Saved" value={String(opportunities.filter((o) => o.saved).length)} />
      </div>
      <FundingPipeline opportunities={opportunities} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-serif text-heading font-medium text-ink">{value}</div>
    </div>
  );
}
