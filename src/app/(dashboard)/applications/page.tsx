import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { q } from "@/features/store";
import { applicationCompletion } from "@/lib/logic/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator, EmptyState, ProgressMeter } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Applications" };
const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export default function ApplicationsPage() {
  const applications = q.applications();

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
          {applications.map((app) => {
            const answers = q.answers(app.id);
            const completion = applicationCompletion(answers);
            const opp = q.opportunity(app.opportunityId);
            const funder = opp ? q.funder(opp.funderId) : undefined;
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
                      <DeadlineIndicator deadline={app.deadline} now={DEMO_NOW} />
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
