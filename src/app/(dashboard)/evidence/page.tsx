import type { Metadata } from "next";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { PageHeader } from "@/components/shared/PageHeader";
import { EvidenceLibrary } from "@/components/evidence/EvidenceLibrary";

export const metadata: Metadata = { title: "Evidence" };

export default async function EvidencePage() {
  const ctx = await resolveRequestContext();
  const items = await getRepository().evidence.list(ctx);
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
