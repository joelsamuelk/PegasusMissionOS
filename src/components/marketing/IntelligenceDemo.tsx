import { Check, CircleHelp, Cpu, HelpCircle, MinusCircle, Sparkles } from "lucide-react";
import {
  INTELLIGENCE,
  INTELLIGENCE_RULES,
  INTELLIGENCE_SPLIT,
} from "@/lib/marketing/content";
import type { FundingPreview } from "@/lib/marketing/preview";
import type { FactorStatus } from "@/types/domain";
import {
  PreviewCaption,
  Section,
  SectionHeader,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";
import { cn } from "@/lib/utils";

const FACTOR_ICON: Record<
  FactorStatus,
  { icon: React.ComponentType<{ className?: string }>; cls: string; word: string }
> = {
  met: { icon: Check, cls: "text-success", word: "Passed" },
  partial: { icon: CircleHelp, cls: "text-warning", word: "Review" },
  uncertain: { icon: HelpCircle, cls: "text-ink-subtle", word: "Uncertain" },
  unmet: { icon: MinusCircle, cls: "text-critical", word: "Not met" },
};

/**
 * Pegasus Intelligence.
 *
 * The section exists to draw one line clearly: what is computed and what is
 * generated. Getting that wrong in either direction is a failure — describing
 * a tested function as "AI-powered" oversells the model and undersells the
 * engineering, and describing a generation as analysis is how a product ends
 * up trusted for something it cannot do.
 *
 * The readout is not a mockup. `assessFit()` runs at build time against the
 * seeded organisation profile and the real opportunity record, and this
 * component renders whatever it returns — score, category, factors, rationale,
 * assumptions and next action. If the algorithm changes, this changes.
 */
export function IntelligenceDemo({ funding }: { funding: FundingPreview }) {
  const { fit } = funding;
  const assumptions = fit.factors.flatMap((f) => f.assumptions);
  // The union across eight factors runs to thirteen sources, which wraps to
  // four rows of chips and stops being scannable. Show a representative set
  // and count the rest rather than silently truncating.
  const sources = [...new Set(fit.factors.flatMap((f) => f.evidenceUsed))];
  const shownSources = sources.slice(0, 8);
  const remainingSources = sources.length - shownSources.length;

  return (
    <Section id="intelligence" tone="surface" bordered>
      <SectionHeader
        id="intelligence"
        eyebrow="Pegasus Intelligence"
        title={INTELLIGENCE.headline}
        lead={INTELLIGENCE.body}
      />

      {/* The boundary, stated as two columns rather than as a paragraph. */}
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {INTELLIGENCE_SPLIT.map((column, i) => (
          <Reveal key={column.kind} delay={i * 90}>
            <div
              className={cn(
                "h-full rounded-xl border p-6",
                column.kind === "Deterministic"
                  ? "border-ink/12 bg-paper"
                  : "border-accent/20 bg-accent-soft/40",
              )}
            >
              <div className="flex items-center gap-2">
                {column.kind === "Deterministic" ? (
                  <Cpu className="h-4 w-4 text-ink" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                )}
                <h3 className="font-heading text-[0.9375rem] font-semibold uppercase tracking-[0.1em] text-ink">
                  {column.label}
                </h3>
              </div>
              <ul className="mt-4 flex flex-col gap-2">
                {column.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-ink-muted"
                  >
                    <span
                      className={cn(
                        "mt-[0.55rem] h-1 w-1 flex-shrink-0 rounded-full",
                        column.kind === "Deterministic" ? "bg-ink" : "bg-accent",
                      )}
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>

      {/* The worked example. */}
      <Reveal className="mt-14">
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="border-b border-line px-6 py-5">
            <div className="eyebrow">A real question</div>
            <p className="mt-2 font-heading text-[1.25rem] font-semibold tracking-tight text-ink sm:text-[1.5rem]">
              &ldquo;{INTELLIGENCE.question}&rdquo;
            </p>
          </div>

          <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
            {/* Verdict */}
            <div className="border-b border-line p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-[3.25rem] font-semibold leading-none tracking-tight text-ink">
                  {fit.overallScore}
                </span>
                <span className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-success">
                  {funding.categoryLabel}
                </span>
              </div>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
                Weighted across {fit.factors.length} factors. This is decision support:
                a score is a starting point for a conversation, and a low one is never
                a rejection.
              </p>

              <div className="mt-6">
                <div className="eyebrow">Why</div>
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {fit.factors.slice(0, 3).map((factor) => (
                    <li
                      key={factor.key}
                      className="text-[0.8125rem] leading-snug text-ink-muted"
                    >
                      <span className="font-medium text-ink">{factor.label}. </span>
                      {factor.rationale}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                <div className="eyebrow">Based on</div>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {shownSources.map((source) => (
                    <li
                      key={source}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] text-ink-muted"
                    >
                      {source}
                    </li>
                  ))}
                  {remainingSources > 0 && (
                    <li className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[0.7rem] text-ink-subtle">
                      +{remainingSources} more
                    </li>
                  )}
                </ul>
              </div>

            </div>

            {/* Factors */}
            <div>
              <ul className="divide-y divide-line">
                {fit.factors.map((factor) => {
                  const { icon: Icon, cls, word } = FACTOR_ICON[factor.status];
                  return (
                    <li
                      key={factor.key}
                      className="flex items-center justify-between gap-4 px-6 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon className={cn("h-4 w-4 flex-shrink-0", cls)} aria-hidden />
                        <span className="truncate text-[0.9375rem] text-ink">
                          {factor.label}
                        </span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-3">
                        <span className={cn("text-[0.75rem] font-medium", cls)}>
                          {word}
                        </span>
                        <span className="w-8 text-right font-mono text-[0.75rem] text-ink-subtle">
                          {factor.score}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line bg-surface-sunken/60 px-6 py-4">
                <div className="eyebrow">Recommended next action</div>
                <p className="mt-1.5 text-[0.9375rem] text-ink">
                  {fit.recommendedNextAction}
                </p>

                {assumptions.length > 0 && (
                  <div className="mt-4 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3">
                    <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-warning">
                      Still needs a person
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {assumptions.map((assumption) => (
                        <li
                          key={assumption}
                          className="text-[0.75rem] leading-snug text-ink-muted"
                        >
                          {assumption}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <PreviewCaption>
        Computed live from the demo workspace: the {funding.opportunityTitle} record from{" "}
        {funding.funderName}, assessed against Northstar Community Foundation&rsquo;s
        profile and its {funding.evidenceCount} evidence items. Northstar is a fictional
        charity; the assessment is the product&rsquo;s own.
      </PreviewCaption>

      {/* The three rules. */}
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {INTELLIGENCE_RULES.map((rule, i) => (
          <Reveal key={rule.title} delay={i * 80}>
            <div className="h-full rounded-xl border border-line bg-paper p-6">
              <h3 className="font-heading text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink">
                {rule.title}
              </h3>
              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-muted">
                {rule.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
