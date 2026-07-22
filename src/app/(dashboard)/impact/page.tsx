import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { q } from "@/features/store";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Impact" };

export default function ImpactPage() {
  const reports = q.impactReports();

  return (
    <div>
      <PageHeader
        eyebrow="Impact reporting"
        title="Impact"
        description="Generate funder-ready impact reports from your programme and grant data. Every claim is grounded in your indicators and approved evidence."
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No reports yet"
          description="Create a report to bring together your outcomes, evidence and financial summary."
        />
      ) : (
        <div className="grid gap-3">
          {reports.map((r) => {
            const programme = r.programmeId ? q.programme(r.programmeId) : undefined;
            const filled = r.sections.filter((s) => s.content.trim()).length;
            return (
              <Card key={r.id} className="transition-shadow hover:shadow-elev-2">
                <Link href={`/impact/${r.id}`}>
                  <CardBody>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-title font-semibold text-ink">{r.title}</h2>
                          <EntityStatusBadge status={r.status} />
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {programme?.name} · {r.reportingPeriod}
                        </p>
                      </div>
                      <span className="text-sm text-ink-subtle">
                        {filled} of {r.sections.length} sections drafted
                      </span>
                    </div>
                  </CardBody>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
