import Link from "next/link";
import { ArrowRight, CircleAlert, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill } from "@/components/shared/ui";
import { EmptyState, MetricPanel } from "@/components/shared/misc";
import { reconcile } from "@/lib/organisation-intelligence/reconcile";
import { buildOnboardingContext } from "@/lib/onboarding/context-builder";
import { buildOrganisationAudit, READINESS_LABELS, type ReadinessLevel } from "@/lib/onboarding/audit";
import { buildRecommendations } from "@/lib/onboarding/recommendations";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata = { title: "Your Mission OS is ready" };

/**
 * The Organisation Audit.
 *
 * Everything on this page is deterministic and every statement names what it
 * was computed from. There is no model call, and the copy carries the rule the
 * brief states: a gap is a statement about what Pegasus could see, never a
 * verdict on the organisation.
 */

const LEVEL_STYLES: Record<ReadinessLevel, string> = {
  ready: "border-success/30 bg-success-soft text-success",
  partial: "border-info/30 bg-info-soft text-info",
  limited: "border-warning/30 bg-warning-soft text-warning",
  not_established: "border-line bg-surface-sunken text-ink-muted",
};

const URGENCY_LABELS = {
  now: "Now",
  soon: "Soon",
  when_convenient: "When convenient",
} as const;

/** Sequential ids for one render. Deterministic, so output is stable. */
function makeIdFactory() {
  let counter = 0;
  return (prefix: string) => `${prefix}-${(counter += 1)}`;
}

export default async function OrganisationAuditPage() {
  const nextId = makeIdFactory();
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const run = await repo.onboarding.latestRun(ctx);
  if (!run) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <PageHeader eyebrow="Onboarding" title="No audit yet" />
        <EmptyState
          icon={SearchX}
          title="Research has not run"
          description="The audit describes what Pegasus established about your organisation. It needs a research run first."
          action={
            <Link href="/onboarding" className="text-sm text-accent hover:underline">
              Start onboarding
            </Link>
          }
        />
      </div>
    );
  }

  const [candidates, documents, opportunities, grants, grantReports] = await Promise.all([
    repo.onboarding.candidates(ctx, run.id),
    repo.documents.list(ctx),
    repo.funding.listOpportunities(ctx),
    repo.grants.list(ctx),
    repo.grants.allReports(ctx),
  ]);

  const reconciliation = reconcile(candidates);
  const context = buildOnboardingContext({ candidates, reconciliation });

  const documentReports = await Promise.all(
    documents.map(async (document) => {
      const version = await repo.documents.currentVersion(ctx, document.id);
      return {
        title: document.title,
        status: version?.parseStatus ?? "pending",
        note: version?.parseNote,
      };
    }),
  );

  const audit = buildOrganisationAudit({
    candidates,
    conflictFields: reconciliation.conflicts.map((c) => c.field),
    missingFields: context.missing.map((m) => m.field),
    documents: documentReports,
    pagesRead: run.counts.pagesRead,
    limitations: run.degraded ? [run.degraded.reason] : [],
  });

  const recommendations = buildRecommendations({
    candidates,
    conflictFields: reconciliation.conflicts.map((c) => c.field),
    missingFields: context.missing.map((m) => m.field),
    opportunities,
    grants,
    grantReports,
    now: ctx.now(),
    // Stable and unique within the page, so React keys do not collide and the
    // same run renders identically on every request. A random id would change
    // the DOM on refresh for no reason.
    makeId: nextId,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Onboarding"
        title="Your Mission OS is ready"
        description={`Built from ${run.counts.sourcesDiscovered} sources, without you filling in a single form.`}
        breadcrumbs={[{ label: "Onboarding", href: "/onboarding" }, { label: "Audit" }]}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <MetricPanel label="Facts established" value={String(audit.totals.established)} />
        <MetricPanel label="From the official register" value={String(audit.totals.fromRegister)} />
        <MetricPanel label="Not found" value={String(audit.totals.notFound)} />
      </div>

      {audit.totals.conflicting > 0 && (
        <Card className="mb-8 border-warning/30 bg-warning-soft">
          <CardBody className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-ink">
              {audit.totals.conflicting} of your sources disagree with each other. Pegasus has not
              chosen between them.{" "}
              <Link href="/onboarding/review" className="text-accent hover:underline">
                Resolve them
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      )}

      {recommendations.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 font-heading text-title font-semibold text-ink">
            Where to start
          </h2>
          <p className="mb-4 text-sm text-ink-muted">
            Each of these comes from something Pegasus actually found. The reasoning is shown, so
            you can disagree with it.
          </p>
          <div className="space-y-3">
            {recommendations.map((recommendation) => (
              <Card key={recommendation.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-medium text-ink">{recommendation.title}</h3>
                    <Pill>{URGENCY_LABELS[recommendation.urgency]}</Pill>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-muted">{recommendation.detail}</p>

                  {/* Grounding is shown rather than linked to. A recommendation
                      whose basis takes a click to see is a recommendation
                      nobody checks. */}
                  <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
                    {recommendation.grounds.map((ground, index) => (
                      <li key={index} className="text-xs text-ink-subtle">
                        {ground}
                      </li>
                    ))}
                  </ul>

                  {recommendation.href && (
                    <Link
                      href={recommendation.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      Open
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {audit.sections.map((section) => (
          <Card key={section.key}>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-heading text-body font-semibold text-ink">{section.title}</h2>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${LEVEL_STYLES[section.level]}`}
                >
                  {READINESS_LABELS[section.level]}
                </span>
              </div>

              <p className="mt-2 text-sm text-ink-muted">{section.summary}</p>

              {section.observations.length > 0 && (
                <dl className="mt-4 space-y-3">
                  {section.observations.map((observation, index) => (
                    <div key={index}>
                      <dt className="text-sm text-ink">{observation.statement}</dt>
                      {observation.evidence.length > 0 && (
                        <dd className="mt-1.5 flex flex-wrap gap-1.5">
                          {observation.evidence.map((item, itemIndex) => (
                            <Pill key={itemIndex}>{item}</Pill>
                          ))}
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              )}

              {section.suggestions.map((suggestion, index) => (
                <p key={index} className="mt-3 text-sm text-ink-muted">
                  {suggestion}
                </p>
              ))}

              {/* What was looked at. This is what makes "not found" honest. */}
              <p className="mt-3 text-xs text-ink-subtle">{section.basis}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          Go to your workspace
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/onboarding/review" className="text-sm text-ink-muted hover:text-ink">
          Back to review
        </Link>
      </div>
    </div>
  );
}
