import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/formatting";
import { q } from "@/features/store";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState, ProgressMeter } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Grants" };
const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export default function GrantsPage() {
  const grants = q.grants();
  const totalActive = grants
    .filter((g) => g.status === "active")
    .reduce((s, g) => s + g.awardValue, 0);
  const remaining = grants.reduce((s, g) => s + (g.awardValue - g.spentToDate), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Grants"
        title="Grants"
        description="Track award value, deliverables, payments, reporting and health for every active grant."
      />

      <div className="mb-5 flex flex-wrap gap-6 border-b border-line pb-4">
        <Stat label="Active grant value" value={formatCurrency(totalActive)} />
        <Stat label="Remaining balance" value={formatCurrency(remaining)} />
        <Stat label="Active grants" value={String(grants.filter((g) => g.status === "active").length)} />
      </div>

      {grants.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No grants yet"
          description="When an application is successful, convert it into an active grant to track delivery."
        />
      ) : (
        <div className="grid gap-3">
          {grants.map((g) => {
            const health = computeGrantHealth({
              grant: g,
              deliverables: q.grantDeliverables(g.id),
              reports: q.grantReports(g.id),
              linkedEvidenceCount: q.evidenceForTarget("grant", g.id).length,
              now: DEMO_NOW,
            });
            const funder = q.funder(g.funderId);
            return (
              <Card key={g.id} className="transition-shadow hover:shadow-elev-2">
                <Link href={`/grants/${g.id}`}>
                  <CardBody>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-title font-semibold text-ink">{g.title}</h2>
                          <EntityStatusBadge status={health.state} />
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {funder?.name} · {formatCurrency(g.awardValue)} ·{" "}
                          {g.restricted ? "Restricted" : "Unrestricted"}
                        </p>
                      </div>
                      <div className="w-full sm:w-40">
                        <ProgressMeter
                          value={health.budgetUsedPercent}
                          label="Budget used"
                          tone={
                            health.budgetUsedPercent > health.timeElapsedPercent + 25
                              ? "warning"
                              : "accent"
                          }
                        />
                      </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-serif text-heading font-medium text-ink">{value}</div>
    </div>
  );
}
