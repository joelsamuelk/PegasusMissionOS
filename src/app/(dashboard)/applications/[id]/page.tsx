import type { Metadata } from "next";
import type { EvidenceItem } from "@/types/domain";
import { notFound } from "next/navigation";
import { Check, FileText, Users } from "lucide-react";
import { formatDate } from "@/lib/formatting";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
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
  const ctx = await resolveRequestContext();
  const application = await getRepository().applications.get(ctx, id);
  return { title: application?.title ?? "Application" };
}

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const now = ctx.now();

  const app = await repo.applications.get(ctx, id);
  if (!app) notFound();

  const [opp, answers, users] = await Promise.all([
    repo.funding.getOpportunity(ctx, app.opportunityId),
    repo.applications.answers(ctx, app.id),
    repo.organisations.users(ctx),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  const funder = opp ? await repo.funding.getFunder(ctx, opp.funderId) : null;
  const owner = app.ownerId ? userById.get(app.ownerId) : undefined;
  const completion = applicationCompletion(answers);
  const needing = answersNeedingAttention(answers);
  const contributors = app.contributorIds.map((cid) => userById.get(cid)).filter(Boolean);
  const reviewers = app.reviewerIds.map((rid) => userById.get(rid)).filter(Boolean);

  // Answer-linked evidence, resolved once for the whole page.
  const evidenceIds = [...new Set(answers.flatMap((a) => a.evidenceIds))];
  const evidenceById = new Map(
    (await Promise.all(evidenceIds.map((eid) => repo.evidence.get(ctx, eid))))
      .filter((e): e is EvidenceItem => Boolean(e))
      .map((e) => [e.id, e]),
  );

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
              <DeadlineIndicator deadline={app.deadline} now={now} />
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
                    .map((eid) => evidenceById.get(eid))
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
