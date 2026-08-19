import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { applicationCompletion } from "@/lib/logic/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator, EmptyState, ProgressMeter } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const now = ctx.now();

  const [applications, funders] = await Promise.all([
    repo.applications.list(ctx),
    repo.funding.listFunders(ctx),
  ]);
  const funderById = new Map(funders.map((f) => [f.id, f]));

  const rows = await Promise.all(
    applications.map(async (app) => {
      const [answers, opp] = await Promise.all([
        repo.applications.answers(ctx, app.id),
        repo.funding.getOpportunity(ctx, app.opportunityId),
      ]);
      return {
        app,
        answers,
        funder: opp ? funderById.get(opp.funderId) : undefined,
      };
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Applications"
        title="Applications"
        description="A structured workspace for every submission. Draft answers with organisation-aware AI, review, and prepare for submission."
      />

      {applications.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No applications yet"
          description="Create an application from a funding opportunity to get started."
        />
      ) : (
        <div className="grid gap-3">
          {rows.map(({ app, answers, funder }) => {
            const completion = applicationCompletion(answers);
            return (
              <Card key={app.id} className="transition-shadow hover:shadow-elev-2">
                <Link href={`/applications/${app.id}`} className="block p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-title font-semibold text-ink">{app.title}</h2>
                        <EntityStatusBadge status={app.status} />
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        {funder?.name} · {answers.length} questions
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <DeadlineIndicator deadline={app.deadline} now={now} />
                      <div className="w-32">
                        <ProgressMeter
                          value={completion}
                          label="Complete"
                          tone={completion === 100 ? "success" : "accent"}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
