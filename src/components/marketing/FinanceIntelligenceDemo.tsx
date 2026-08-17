import { Ban } from "lucide-react";
import { FINANCE_REFUSALS } from "@/lib/marketing/content";
import {
  AppFrame,
  MiniMetric,
  PreviewCaption,
  Section,
  SectionHeader,
  StatusChip,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Finance Intelligence.
 *
 * The honest position, stated in the section rather than buried in a footnote:
 * the calculation core is built and tested — runway, funding cliffs, gap
 * forecasting, concentration, cost roll-up, unit economics with mandatory
 * methodology, subsidy detection, comparability gates — and it has no product
 * surface. Ingestion, classification and the screens are Slice E.
 *
 * The figures below are the worked example from the finance test fixture
 * (`tests/fixtures/finance-fixture.ts`), which encodes the specification's own
 * example so the suite asserts against the spec rather than against whatever
 * the code happens to produce. They are the numbers the engine actually
 * returns for that fixture. They are not any organisation's real accounts, and
 * the caption says so.
 *
 * The refusal card is the part worth building a section around. A finance
 * feature that always produces a number is not more useful than one that
 * sometimes declines — it is less trustworthy, because you cannot tell the
 * confident answers from the invented ones.
 */
export function FinanceIntelligenceDemo() {
  return (
    <Section id="finance">
      <SectionHeader
        id="finance"
        eyebrow="Finance intelligence"
        title="Know where the money is going, and what happens next."
        lead="Restricted funding, programme economics, grant exposure and the cliff eighteen months out are the questions a trustee asks and a spreadsheet answers slowly. The engine that answers them is built and tested; the screens are being built now."
        status="in_development"
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <Reveal>
          <AppFrame path="/finance" label="In development">
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <MiniMetric
                  label="Unrestricted runway"
                  value="7 months"
                  hint="To 31 March 2027"
                  tone="warning"
                />
                <MiniMetric
                  label="Funding concentration"
                  value="31%"
                  hint="Largest funder, of £800,000"
                />
                <MiniMetric
                  label="Funding at risk"
                  value="£270k"
                  hint="Expires 31 March 2027"
                  tone="warning"
                />
                <MiniMetric
                  label="Projected gap"
                  value="£310k"
                  hint="2027 to 2028"
                  tone="warning"
                />
                <MiniMetric
                  label="Potential coverage"
                  value="81%"
                  hint="From matched opportunities"
                />
                <MiniMetric
                  label="Cost per participant"
                  value="£350"
                  hint="1,200 participants, £420k allocated"
                />
              </div>

              <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                <div className="eyebrow">Programme economics · Youth Futures</div>
                <dl className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  <UnitCost label="Per participant" value="£350" measure="1,200 participants" />
                  <UnitCost label="Per completion" value="£427" measure="984 completions" />
                  <UnitCost
                    label="Per employment outcome"
                    value="£890"
                    measure="472 outcomes"
                  />
                </dl>
                <p className="mt-3 text-[0.7rem] leading-relaxed text-ink-subtle">
                  Each figure carries its method: total allocated cost ÷ measured
                  delivery for the period, with 7% of it apportioned shared cost. A unit
                  cost cannot be constructed in Pegasus without one.
                </p>
              </div>

              {/* The refusal. This is the screen state that matters most. */}
              <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-surface-sunken/70 p-4">
                <div className="flex items-center gap-2">
                  <Ban className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" aria-hidden />
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    Withheld — social return on investment
                  </span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
                  Pegasus will not produce an SROI ratio from programme cost and outcome
                  counts. Doing so would require monetising outcomes that have not been
                  valued, and the resulting number would look precise and mean nothing.
                </p>
              </div>
            </div>
          </AppFrame>

          <PreviewCaption>
            <StatusChip status="in_development" className="mr-2 align-middle" />
            The calculation engine behind these figures is built and covered by 80
            tests. The screen is not shipped. The numbers are the worked example from
            the finance test fixture, not any organisation&rsquo;s accounts.
          </PreviewCaption>
        </Reveal>

        <div className="flex flex-col gap-4">
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            Money in Pegasus is held as integers and split by largest remainder, so
            allocations reconcile to the penny rather than to a rounding error.
            Everything derived from it keeps the inputs and the arithmetic that
            produced it.
          </p>
          {FINANCE_REFUSALS.map((refusal, i) => (
            <Reveal key={refusal.title} delay={i * 80}>
              <div className="rounded-xl border border-line bg-surface p-5">
                <h3 className="font-heading text-[1rem] font-semibold leading-snug tracking-tight text-ink">
                  {refusal.title}
                </h3>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-muted">
                  {refusal.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

function UnitCost({
  label,
  value,
  measure,
}: {
  label: string;
  value: string;
  measure: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2.5">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-[1.15rem] font-semibold leading-none text-ink">
        {value}
      </dd>
      <dd className="mt-1 text-[0.7rem] text-ink-muted">{measure}</dd>
    </div>
  );
}
