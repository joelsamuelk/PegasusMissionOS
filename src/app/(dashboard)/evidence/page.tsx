import type { Metadata } from "next";
import { q } from "@/features/store";
import { PageHeader } from "@/components/shared/PageHeader";
import { EvidenceLibrary } from "@/components/evidence/EvidenceLibrary";

export const metadata: Metadata = { title: "Evidence" };

export default function EvidencePage() {
  const items = q.evidence();
  return (
    <div>
      <PageHeader
        eyebrow="Evidence library"
        title="Evidence"
        description="A central library of documents, statistics, testimonials and evaluations. Tag evidence by programme, grant, outcome and reporting period, and reuse it across applications and reports."
      />
      <EvidenceLibrary items={items} />
    </div>
  );
}
