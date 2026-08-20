import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSearch, Landmark, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Card, CardBody } from "@/components/shared/ui";
import { StartResearch } from "@/components/onboarding/StartResearch";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata: Metadata = { title: "Onboarding" };

/**
 * Onboarding.
 *
 * This replaces an eight-step form that collected the same information twice
 * and persisted none of it. The premise is inverted: rather than asking an
 * organisation to describe itself, Pegasus reads what it has already published
 * and asks it to check the reading.
 *
 * The three notes below the form are not reassurance copy. They are the three
 * commitments the pipeline actually keeps, and each one is enforced somewhere
 * in the code rather than only stated here.
 */
export default async function OnboardingPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const existing = await repo.onboarding.latestRun(ctx);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Wordmark className="mb-10 h-7" />

      <h1 className="font-heading text-display font-semibold text-ink">
        Tell us who you are. We will do the rest.
      </h1>
      <p className="mt-3 max-w-xl text-body text-ink-muted">
        Pegasus reads your website, the official register and any documents you share, then shows
        you what it found and where it found it. You confirm what is right.
      </p>

      {existing && (
        <Card className="mt-8 border-info/30 bg-info-soft">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">
              Research has already run for {existing.input.name}, finding{" "}
              {existing.counts.candidatesFound} things.
            </p>
            <Link
              href="/onboarding/review"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              Continue reviewing
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="mt-8">
        <StartResearch />
      </div>

      <dl className="mt-10 grid gap-6 sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-2 text-sm font-medium text-ink">
            <ShieldCheck className="h-4 w-4 text-ink-subtle" aria-hidden />
            Nothing is assumed
          </dt>
          <dd className="mt-1.5 text-sm text-ink-muted">
            Everything Pegasus reads is a suggestion until you confirm it. Confidence never counts
            as confirmation.
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm font-medium text-ink">
            <FileSearch className="h-4 w-4 text-ink-subtle" aria-hidden />
            Everything shows its source
          </dt>
          <dd className="mt-1.5 text-sm text-ink-muted">
            Each finding names the page or document it came from, and where in it.
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm font-medium text-ink">
            <Landmark className="h-4 w-4 text-ink-subtle" aria-hidden />
            Gaps are stated plainly
          </dt>
          <dd className="mt-1.5 text-sm text-ink-muted">
            What Pegasus could not find is listed, along with where it looked. Not finding
            something is not the same as it not existing.
          </dd>
        </div>
      </dl>
    </main>
  );
}
