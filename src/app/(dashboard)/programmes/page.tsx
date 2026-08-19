import type { Metadata } from "next";
import Link from "next/link";
import { FolderGit2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { indicatorProgress } from "@/lib/logic/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState, ProgressMeter } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Programmes" };

export default async function ProgrammesPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const programmes = await repo.programmes.list(ctx);

  // Indicators and grants resolved per programme up front, so the card grid
  // below renders without further data access.
  const rows = await Promise.all(
    programmes.map(async (p) => {
      const [indicators, grants] = await Promise.all([
        repo.programmes.indicatorsForProgramme(ctx, p.id),
        repo.programmes.grantsFor(ctx, p.id),
      ]);
      return { programme: p, indicators, grants };
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Programmes"
        title="Programmes"
        description="Run funded programmes using a simple impact framework: activities, outputs, outcomes and long-term impact."
      />

      {programmes.length === 0 ? (
        <EmptyState icon={FolderGit2} title="No programmes yet" description="Create a programme to track delivery and outcomes." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ programme: p, indicators, grants }) => {
            const avg =
              indicators.length > 0
                ? Math.round(
                    indicators.reduce((s, i) => s + indicatorProgress(i), 0) / indicators.length,
                  )
                : 0;
            return (
              <Card key={p.id} className="flex flex-col transition-shadow hover:shadow-elev-2">
                <Link href={`/programmes/${p.id}`} className="flex flex-1 flex-col">
                  <CardBody className="flex flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-title font-semibold text-ink">{p.name}</h2>
                      <EntityStatusBadge status={p.status} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-ink-muted">{p.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.communitiesServed.slice(0, 2).map((c) => (
                        <Pill key={c}>{c}</Pill>
                      ))}
                    </div>
                    {indicators.length > 0 && (
                      <ProgressMeter
                        className="mt-4"
                        value={avg}
                        label={`${indicators.length} indicators, average progress`}
                        tone={avg >= 90 ? "success" : "accent"}
                      />
                    )}
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-subtle">
                      <span>
                        {formatDate(p.startDate)} to {formatDate(p.endDate)}
                      </span>
                      <span>
                        {grants.length} grant{grants.length === 1 ? "" : "s"} ·{" "}
                        {p.budget ? formatCurrency(p.budget) : "-"}
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
