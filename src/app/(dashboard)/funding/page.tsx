import type { Metadata } from "next";
import { formatCurrency } from "@/lib/formatting";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { PageHeader } from "@/components/shared/PageHeader";
import { FundingPipeline } from "@/components/funding/FundingPipeline";

export const metadata: Metadata = { title: "Funding" };

export default async function FundingPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const [rawOpportunities, funders, users] = await Promise.all([
    repo.funding.listOpportunities(ctx),
    repo.funding.listFunders(ctx),
    repo.organisations.users(ctx),
  ]);
  const funderById = new Map(funders.map((f) => [f.id, f]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const opportunities = rawOpportunities.map((o) => ({
    ...o,
    funderName: funderById.get(o.funderId)?.name ?? "Funder",
    ownerName: o.ownerId ? userById.get(o.ownerId)?.name : undefined,
  }));

  const pipelineValue = opportunities
    .filter((o) => !["successful", "unsuccessful", "archived"].includes(o.stage))
    .reduce((s, o) => s + (o.maxAward ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Funding pipeline"
        title="Funding"
        description="Every opportunity in one place. Demo opportunities are drawn from fictional funders and clearly labelled as sample data."
      />
      <div className="mb-5 flex flex-wrap gap-6 border-b border-line pb-4 text-sm">
        <Stat label="Pipeline value" value={formatCurrency(pipelineValue)} />
        <Stat label="Opportunities" value={String(opportunities.length)} />
        <Stat label="Saved" value={String(opportunities.filter((o) => o.saved).length)} />
      </div>
      <FundingPipeline opportunities={opportunities} now={ctx.now()} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-heading text-heading font-semibold text-ink">{value}</div>
    </div>
  );
}
