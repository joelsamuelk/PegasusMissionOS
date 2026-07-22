import type { Metadata } from "next";
import type { EvidenceItem } from "@/types/domain";
import { notFound } from "next/navigation";
import { Check, FileText, Users } from "lucide-react";
import { formatDate } from "@/lib/formatting";
import { q } from "@/features/store";
import { applicationCompletion, answersNeedingAttention } from "@/lib/logic/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator, ProgressMeter } from "@/components/shared/misc";
import { AnswerEditor } from "@/components/applications/AnswerEditor";
import { ConvertToGrant } from "@/components/applications/ConvertToGrant";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: q.application(id)?.title ?? "Application" };
}

const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = q.application(id);
  if (!app) notFound();

  const opp = q.opportunity(app.opportunityId);
  const funder = opp ? q.funder(opp.funderId) : undefined;
  const owner = q.user(app.ownerId);
  const answers = q.answers(app.id);
  const completion = applicationCompletion(answers);
  const needing = answersNeedingAttention(answers);
  const contributors = app.contributorIds.map((cid) => q.user(cid)).filter(Boolean);
  const reviewers = app.reviewerIds.map((rid) => q.user(rid)).filter(Boolean);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Applications", href: "/applications" }, { label: app.title }]}
        eyebrow={funder?.name}
        title={app.title}
        actions={<ConvertToGrant applicationId={app.id} status={app.status} />}
      />

      {/* Overview strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <div className="eyebrow">Status</div>
            <div className="mt-2">
              <EntityStatusBadge status={app.status} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="eyebrow">Deadline</div>
            <div className="mt-2">
              <DeadlineIndicator deadline={app.deadline} now={DEMO_NOW} />
            </div>
            <div className="mt-1 text-xs text-ink-subtle">{formatDate(app.deadline)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="eyebrow">Completion</div>
            <ProgressMeter
              className="mt-2.5"
              value={completion}
              tone={completion === 100 ? "success" : "accent"}
            />
            <div className="mt-1.5 text-xs text-ink-subtle">
              {needing} of {answers.length} answers need attention
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="eyebrow">Owner</div>
            <div className="mt-2 text-sm font-medium text-ink">{owner?.name ?? "Unassigned"}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
              <Users className="h-3 w-3" /> {contributors.length} contributors,{" "}
              {reviewers.length} reviewers
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Answers */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-title font-semibold text-ink">Application questions</h2>
          <div className="flex flex-col gap-2.5">
            {answers.map((answer, i) => (
              <AnswerEditor
                key={answer.id}
                answer={answer}
                evidence={
                  answer.evidenceIds
                    .map((eid) => q.evidenceItem(eid))
                    .filter((e): e is EvidenceItem => Boolean(e))
                }
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText className="h-4 w-4 text-ink-subtle" /> Required documents
              </h3>
            </div>
            <ul className="divide-y divide-line">
              {app.requiredDocuments.map((d) => (
                <li key={d.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink-muted">{d.name}</span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      d.provided ? "text-success" : "text-ink-subtle",
                    )}
                  >
                    {d.provided ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Attached
                      </>
                    ) : (
                      "Missing"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Submission checklist</h3>
            </div>
            <ul className="divide-y divide-line">
              {app.submissionChecklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border",
                      c.done ? "border-success bg-success text-white" : "border-line-strong",
                    )}
                  >
                    {c.done && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn(c.done ? "text-ink-subtle line-through" : "text-ink-muted")}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Team</h3>
            </div>
            <CardBody className="flex flex-col gap-3 text-sm">
              <TeamRow label="Owner" people={owner ? [owner.name] : []} />
              <TeamRow label="Contributors" people={contributors.map((c) => c!.name)} />
              <TeamRow label="Reviewers" people={reviewers.map((r) => r!.name)} />
            </CardBody>
          </Card>

          {app.notes && (
            <Card className="bg-surface-sunken">
              <CardBody>
                <div className="eyebrow mb-1.5">Notes</div>
                <p className="text-sm text-ink-muted">{app.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamRow({ label, people }: { label: string; people: string[] }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      {people.length === 0 ? (
        <span className="text-xs text-ink-subtle">None assigned</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <span
              key={p}
              className="inline-flex items-center rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-ink"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
