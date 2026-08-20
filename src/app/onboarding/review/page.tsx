import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { CandidateCard } from "@/components/onboarding/CandidateReview";
import { DocumentUpload } from "@/components/onboarding/DocumentUpload";
import { reconcile } from "@/lib/organisation-intelligence/reconcile";
import {
  buildOnboardingContext,
  GROUP_DESCRIPTIONS,
  GROUP_LABELS,
  type FindingGroup,
} from "@/lib/onboarding/context-builder";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata = { title: "Review what Pegasus found" };

/**
 * The review screen.
 *
 * The boundary between extracted information and trusted organisational truth,
 * made into a page. Everything above it is machinery; this is where a person
 * decides.
 *
 * The order of the groups is deliberate and is the opposite of what a progress
 * bar would suggest. Conflicts first, because they are the only findings where
 * doing nothing leaves something actively wrong. Then the things needing a
 * closer look. Register-confirmed values last, because they are the ones least
 * likely to be wrong and a reviewer who spends their attention there will have
 * none left for the rest.
 */

const GROUP_ORDER: FindingGroup[] = [
  "conflicts",
  "needs_review",
  "extracted",
  "verified",
  "provided",
];

export default async function OnboardingReviewPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const run = await repo.onboarding.latestRun(ctx);

  if (!run) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <PageHeader
          eyebrow="Onboarding"
          title="Nothing to review yet"
          description="Research has not been run for this organisation."
        />
        <EmptyState
          icon={SearchX}
          title="No research has run"
          description="Give Pegasus your organisation name and it will look at what is public before asking you to type anything."
          action={
            <Link href="/onboarding" className="text-sm text-accent hover:underline">
              Start onboarding
            </Link>
          }
        />
      </div>
    );
  }

  const [candidates, decisions, sources] = await Promise.all([
    repo.onboarding.candidates(ctx, run.id),
    repo.onboarding.decisions(ctx, run.id),
    repo.onboarding.sources(ctx, run.id),
  ]);

  const context = buildOnboardingContext({
    candidates,
    reconciliation: reconcile(candidates),
  });

  const outstanding = context.findings.filter((f) => !decisions[f.candidate.id]).length;
  const readable = sources.filter((s) => s.extractionStatus === "extracted").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Onboarding"
        title="Review what Pegasus found"
        description={
          `Read from ${readable} source${readable === 1 ? "" : "s"}. ` +
          "None of it is part of your profile until you say so."
        }
        breadcrumbs={[{ label: "Onboarding", href: "/onboarding" }, { label: "Review" }]}
      />

      {run.degraded && (
        <Card className="mb-6 border-warning/30 bg-warning-soft">
          <CardBody>
            <p className="text-sm font-medium text-ink">{run.degraded.reason}</p>
            <p className="mt-1 text-sm text-ink-muted">{run.degraded.guidance}</p>
          </CardBody>
        </Card>
      )}

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-ink">
            <strong className="font-heading text-title">{outstanding}</strong> waiting on you
          </span>
          <span className="text-ink-subtle">
            {run.counts.pagesRead} pages read · {run.counts.documentsParsed} documents read ·{" "}
            {run.counts.candidatesFound} findings
          </span>
          {outstanding === 0 && (
            <Link
              href="/onboarding/audit"
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              See your organisation audit
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </CardBody>
      </Card>

      {GROUP_ORDER.map((group) => {
        const findings = context.byGroup[group];
        if (findings.length === 0) return null;

        return (
          <section key={group} className="mb-9">
            <div className="mb-3">
              <h2 className="font-heading text-title font-semibold text-ink">
                {GROUP_LABELS[group]}
                <Pill className="ml-2 align-middle">{findings.length}</Pill>
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{GROUP_DESCRIPTIONS[group]}</p>
            </div>
            <div className="space-y-3">
              {findings.map((finding) => (
                <CandidateCard
                  key={finding.candidate.id}
                  finding={finding}
                  decided={decisions[finding.candidate.id]}
                />
              ))}
            </div>
          </section>
        );
      })}

      {context.missing.length > 0 && (
        <section className="mb-9">
          <div className="mb-3">
            <h2 className="font-heading text-title font-semibold text-ink">
              {GROUP_LABELS.missing}
              <Pill className="ml-2 align-middle">{context.missing.length}</Pill>
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{GROUP_DESCRIPTIONS.missing}</p>
          </div>
          <div className="space-y-3">
            {context.missing.map((missing) => (
              <Card key={missing.field}>
                <CardBody>
                  <div className="eyebrow mb-1.5">{missing.label}</div>
                  <p className="text-sm text-ink-muted">{missing.whyItMatters}</p>
                  {/* "Not found" is a statement about the search, so the search
                      is stated. */}
                  <p className="mt-2 text-xs text-ink-subtle">
                    Pegasus looked in {missing.searchedIn}.
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-9">
        <h2 className="mb-3 font-heading text-title font-semibold text-ink">
          Add a document
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          An annual report or a set of accounts usually fills most of the gaps above. Pegasus
          reads it, shows you what it found and where, and adds nothing without your say-so.
        </p>
        <DocumentUpload />
      </section>
    </div>
  );
}
