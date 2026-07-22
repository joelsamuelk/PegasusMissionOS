import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, MapPin, Tag } from "lucide-react";
import { formatCurrency, formatDate, humanise } from "@/lib/formatting";
import { q } from "@/features/store";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button, ButtonLink, Card, CardBody, Pill } from "@/components/shared/ui";
import { DeadlineIndicator, EmptyState } from "@/components/shared/misc";
import { FitAssessmentPanel } from "@/components/funding/FitAssessmentPanel";
import {
  GenerateFitButton,
  SaveToggle,
  StageSelect,
} from "@/components/funding/OpportunityActions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const opp = q.opportunity(id);
  return { title: opp?.programmeName ?? "Opportunity" };
}

const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opp = q.opportunity(id);
  if (!opp) notFound();

  const funder = q.funder(opp.funderId);
  const questions = q.opportunityQuestions(id);
  const assessment = q.fitAssessment(id);
  const owner = q.user(opp.ownerId);
  const application = q.applications().find((a) => a.opportunityId === id);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Funding", href: "/funding" }, { label: opp.programmeName }]}
        eyebrow={funder?.name}
        title={opp.programmeName}
        description={opp.description}
        actions={
          <div className="flex items-center gap-2">
            <SaveToggle oppId={opp.id} saved={opp.saved} />
            {application ? (
              <ButtonLink href={`/applications/${application.id}`} variant="primary">
                Open application
              </ButtonLink>
            ) : (
              <Button variant="primary">Create application</Button>
            )}
          </div>
        }
      />

      {opp.isDemo && (
        <p className="mb-5 inline-flex rounded-md border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs text-accent">
          Demonstration opportunity. {funder?.name} is a fictional funder for this sample workspace.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Key facts */}
          <Card>
            <CardBody>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Fact label="Award range" value={awardRange(opp.minAward, opp.maxAward, opp.currency)} />
                <Fact label="Duration" value={opp.fundingDurationMonths ? `${opp.fundingDurationMonths} months` : "-"} />
                <Fact label="Funding type" value={humanise(opp.fundingType)} />
                <Fact label="Probability" value={`${opp.probability}%`} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm">
                <DeadlineIndicator deadline={opp.deadline} now={DEMO_NOW} />
                <span className="text-ink-subtle">Closes {formatDate(opp.deadline)}</span>
              </div>
            </CardBody>
          </Card>

          {/* Fit assessment */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-title font-semibold text-ink">Funding fit assessment</h2>
              <GenerateFitButton oppId={opp.id} hasAssessment={Boolean(assessment)} />
            </div>
            {assessment ? (
              <FitAssessmentPanel assessment={assessment} />
            ) : (
              <EmptyState
                icon={FileText}
                title="No assessment yet"
                description="Run a transparent, factor-by-factor fit assessment using your organisation profile and evidence. It is decision support, not a decision."
              />
            )}
          </section>

          {/* Eligibility + themes */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MapPin className="h-4 w-4 text-ink-subtle" /> Eligibility
                </h3>
              </div>
              <CardBody className="text-sm">
                <div className="eyebrow">Organisation types</div>
                <div className="mb-3 mt-1.5 flex flex-wrap gap-1.5">
                  {opp.eligibleOrgTypes.map((t) => (
                    <Pill key={t}>{humanise(t)}</Pill>
                  ))}
                </div>
                <div className="eyebrow">Locations</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {opp.eligibleLocations.map((l) => (
                    <Pill key={l}>{l}</Pill>
                  ))}
                </div>
              </CardBody>
            </Card>
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Tag className="h-4 w-4 text-ink-subtle" /> Priority themes
                </h3>
              </div>
              <CardBody>
                <div className="flex flex-wrap gap-1.5">
                  {opp.priorityThemes.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Questions */}
          {questions.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Application questions</h3>
              </div>
              <ol className="divide-y divide-line">
                {questions.map((qn) => (
                  <li key={qn.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-ink">{qn.text}</p>
                      {qn.wordLimit && (
                        <span className="flex-shrink-0 text-xs text-ink-subtle">
                          {qn.wordLimit} words
                        </span>
                      )}
                    </div>
                    {qn.guidance && (
                      <p className="mt-1 text-xs text-ink-subtle">{qn.guidance}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div>
                <div className="eyebrow mb-1.5">Stage</div>
                <StageSelect oppId={opp.id} stage={opp.stage} />
              </div>
              <SidebarRow label="Owner" value={owner?.name ?? "Unassigned"} />
              <SidebarRow label="Next action" value={opp.nextAction ?? "-"} />
              <SidebarRow label="Last verified" value={formatDate(opp.lastVerifiedAt)} />
              <SidebarRow label="Source" value={opp.sourceReference ?? "-"} />
            </CardBody>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Required documents</h3>
            </div>
            <ul className="divide-y divide-line">
              {opp.requiredDocuments.map((d) => (
                <li key={d} className="px-4 py-2.5 text-sm text-ink-muted">
                  {d}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Reporting requirements</h3>
            </div>
            <ul className="divide-y divide-line">
              {opp.reportingRequirements.map((r) => (
                <li key={r} className="px-4 py-2.5 text-sm text-ink-muted">
                  {r}
                </li>
              ))}
            </ul>
          </Card>

          {opp.notes && (
            <Card className="bg-surface-sunken">
              <CardBody>
                <div className="eyebrow mb-1.5">Internal notes</div>
                <p className="text-sm text-ink-muted">{opp.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function awardRange(min?: number, max?: number, currency = "GBP") {
  if (min && max) return `${formatCurrency(min, currency)} to ${formatCurrency(max, currency)}`;
  if (max) return `Up to ${formatCurrency(max, currency)}`;
  return "-";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
