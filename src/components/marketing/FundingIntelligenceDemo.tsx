import { Check, X } from "lucide-react";
import { formatCurrency, formatDate, humanise } from "@/lib/formatting";
import { FUNDING_CHAIN } from "@/lib/marketing/content";
import type { FundingPreview } from "@/lib/marketing/preview";
import {
  AppFrame,
  ChainStep,
  PreviewCaption,
  Section,
  SectionHeader,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Funding Intelligence.
 *
 * Two claims, both demonstrated rather than asserted:
 *
 * 1. **Eligibility is explicit.** The funder's stated criteria are shown next
 *    to the organisation's actual type and regions, with the match marked. A
 *    team can see why they are or are not eligible without reading a PDF.
 * 2. **Fit reasoning is inspectable.** The factor table names its weight, its
 *    rationale and the evidence it used — the same panel the product shows.
 *
 * Everything renders from the seeded opportunity record and the live
 * `assessFit()` result. No figure here was typed by a person.
 */
export function FundingIntelligenceDemo({ funding }: { funding: FundingPreview }) {
  const { fit } = funding;
  const typeEligible = funding.eligibleOrgTypes.includes(funding.organisationType);
  const regionMatch = funding.eligibleLocations.find((loc) =>
    funding.operatingRegions.some(
      (region) =>
        region.toLowerCase().includes(loc.toLowerCase()) ||
        loc.toLowerCase().includes(region.toLowerCase()),
    ),
  );

  return (
    <Section id="funding" tone="surface" bordered>
      <SectionHeader
        id="funding"
        eyebrow="Funding intelligence"
        title="Stop chasing funding. Start pursuing the right funding."
        lead="A wasted application costs a small team a fortnight it did not have. Pegasus checks the stated criteria before anyone writes a word, then shows its reasoning factor by factor so the decision stays yours."
      />

      <Reveal className="mt-10">
        <ol className="-mx-5 flex items-center overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
          {FUNDING_CHAIN.map((step, i) => (
            <ChainStep
              key={step}
              label={step}
              index={i}
              total={FUNDING_CHAIN.length}
              emphasis={i === FUNDING_CHAIN.length - 1}
            />
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-10">
        <AppFrame path="/funding/opp-horizon" label="Funding">
          <div className="grid lg:grid-cols-[1fr_1.1fr]">
            {/* Opportunity + eligibility */}
            <div className="border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="eyebrow">{funding.funderName}</div>
              <h3 className="mt-1.5 font-heading text-[1.15rem] font-semibold tracking-tight text-ink">
                {funding.opportunityTitle}
              </h3>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact
                  label="Award range"
                  value={`${formatCurrency(funding.minAward)} – ${formatCurrency(funding.maxAward)}`}
                />
                <Fact label="Deadline" value={formatDate(funding.deadline)} />
                <Fact
                  label="Duration"
                  value={
                    funding.durationMonths ? `${funding.durationMonths} months` : "—"
                  }
                />
                <Fact label="Evidence available" value={`${funding.evidenceCount} items`} />
              </dl>

              <div className="mt-6">
                <div className="eyebrow">Eligibility, as stated by the funder</div>
                <ul className="mt-2.5 flex flex-col gap-2">
                  <Criterion
                    met={typeEligible}
                    requirement={`Organisation type: ${funding.eligibleOrgTypes.map(humanise).join(", ")}`}
                    actual={`Northstar is a ${humanise(funding.organisationType)}`}
                  />
                  <Criterion
                    met={Boolean(regionMatch)}
                    requirement={`Location: ${funding.eligibleLocations.join(", ")}`}
                    actual={
                      regionMatch
                        ? `Operates in ${funding.operatingRegions.join(", ")}`
                        : "No matching operating region recorded"
                    }
                  />
                </ul>
              </div>

              <div className="mt-6">
                <div className="eyebrow">Funder priority themes</div>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {funding.priorityThemes.map((theme) => (
                    <li
                      key={theme}
                      className="rounded-full border border-line bg-paper px-2.5 py-1 text-[0.7rem] text-ink-muted"
                    >
                      {theme}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Factor detail */}
            <div className="p-5 sm:p-6">
              <div className="eyebrow">Factor by factor</div>
              <ul className="mt-3 flex flex-col gap-3">
                {fit.factors.map((factor) => (
                  <li key={factor.key} className="rounded-lg border border-line bg-paper p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.875rem] font-medium text-ink">
                        {factor.label}
                      </span>
                      <span className="flex flex-shrink-0 items-baseline gap-2">
                        <span className="font-mono text-[0.7rem] text-ink-subtle">
                          weight {factor.weight}
                        </span>
                        <span className="font-heading text-[0.9375rem] font-semibold text-ink">
                          {factor.score}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-muted">
                      {factor.rationale}
                    </p>
                    {factor.evidenceUsed.length > 0 && (
                      <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-subtle">
                        <span className="font-medium">Uses:</span>{" "}
                        {factor.evidenceUsed.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AppFrame>
      </Reveal>

      <PreviewCaption>
        The real funding record and the real assessment, run against the demo
        workspace at build time. Northstar Community Foundation is a fictional UK
        charity; the opportunity is seeded demo data, clearly labelled as such inside
        the product.
      </PreviewCaption>
    </Section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-[0.875rem] text-ink">{value}</dd>
    </div>
  );
}

function Criterion({
  met,
  requirement,
  actual,
}: {
  met: boolean;
  requirement: string;
  actual: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${
          met ? "bg-success-soft text-success" : "bg-critical-soft text-critical"
        }`}
      >
        {met ? (
          <Check className="h-2.5 w-2.5" aria-hidden />
        ) : (
          <X className="h-2.5 w-2.5" aria-hidden />
        )}
        <span className="sr-only">{met ? "Met" : "Not met"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.8125rem] leading-snug text-ink">{requirement}</span>
        <span className="block text-[0.75rem] leading-snug text-ink-subtle">{actual}</span>
      </span>
    </li>
  );
}
