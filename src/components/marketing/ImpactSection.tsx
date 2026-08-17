import { PROVENANCE_CHAIN } from "@/lib/marketing/content";
import type { ProvenancePreview } from "@/lib/marketing/preview";
import {
  ChainStep,
  PreviewCaption,
  Section,
  SectionHeader,
} from "@/components/marketing/primitives";
import { ImpactProvenanceDemo } from "@/components/marketing/ImpactProvenanceDemo";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Impact and reporting.
 *
 * The server shell around the provenance island: heading, the grant-to-report
 * chain, the live indicator strip and the honest note about what reporting
 * does and does not do today.
 *
 * The chain is the argument. A funder asks what changed; the answer exists
 * already because each link was recorded when it happened rather than
 * reconstructed at the deadline.
 */
export function ImpactSection({ provenance }: { provenance: ProvenancePreview }) {
  return (
    <Section id="impact" tone="surface" bordered>
      <SectionHeader
        id="impact"
        eyebrow="Impact and reporting"
        title="When the funder asks what changed, the answer is already there."
        lead="Reporting is painful because the evidence is assembled after the fact, by whoever is free, from whatever can still be found. Pegasus records the chain as the work happens, so the report is a view over what you already know."
      />

      <Reveal className="mt-10">
        <ol className="-mx-5 flex items-center overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
          {PROVENANCE_CHAIN.map((step, i) => (
            <ChainStep
              key={step}
              label={step}
              index={i}
              total={PROVENANCE_CHAIN.length}
              emphasis={i === PROVENANCE_CHAIN.length - 1}
            />
          ))}
        </ol>
      </Reveal>

      {/* Live indicators from the demo programme. */}
      <Reveal className="mt-10">
        <div className="grid gap-3 sm:grid-cols-3">
          {provenance.indicators.slice(0, 3).map((indicator) => {
            const percent = indicator.target
              ? Math.min(100, Math.round((indicator.currentValue / indicator.target) * 100))
              : 0;
            return (
              <div
                key={indicator.id}
                className="rounded-xl border border-line bg-paper p-4"
              >
                <div className="text-[0.8125rem] font-medium leading-snug text-ink">
                  {indicator.name}
                </div>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="font-heading text-[1.5rem] font-semibold leading-none tracking-tight text-ink">
                    {indicator.currentValue}
                  </span>
                  <span className="text-[0.75rem] text-ink-muted">
                    of {indicator.target}
                    {indicator.unit === "%" ? "%" : ` ${indicator.unit}`}
                  </span>
                </div>
                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${indicator.name}: ${percent} percent of target`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 text-[0.7rem] text-ink-subtle">
                  Source: {indicator.evidenceSource} · updated {indicator.lastUpdated}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal className="mt-8">
        <ImpactProvenanceDemo provenance={provenance} />
      </Reveal>

      <PreviewCaption>
        Real claims and indicators from the demo workspace. Reports themselves are not
        yet rebuilt from live claims — a published report still holds the text it was
        written with, so correcting a figure does not silently rewrite last year&rsquo;s
        report. Connecting the two is the next piece of work, and the provenance model
        above is what it will be built on.
      </PreviewCaption>
    </Section>
  );
}
