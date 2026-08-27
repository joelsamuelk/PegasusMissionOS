import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ImportReview } from "@/components/finance/ImportReview";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata: Metadata = { title: "Statement import" };

/**
 * One imported statement, before it is a ledger.
 *
 * Nothing on this page has been posted. That is the point of the screen
 * existing at all: the pipeline puts `review` between `classify` and `post`,
 * and collapsing them would turn the classifier's suggestions into assertions
 * the moment a file was uploaded.
 */
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const record = await repo.finance.getImport(ctx, id);
  if (!record) notFound();

  const candidates = await repo.finance.candidates(ctx, id);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Statement import" }]}
        eyebrow="Statement import"
        title={record.fileName ?? "Imported statement"}
        description="Nothing here has been posted. Every classification is a suggestion showing the evidence behind it."
      />
      <ImportReview record={record} candidates={candidates} />
    </div>
  );
}
