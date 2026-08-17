import { ChevronDown } from "lucide-react";
import { DOMAINS, FRAGMENTATION_LINES, FRAGMENTS } from "@/lib/marketing/content";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * The fragmentation problem, and the consolidation that answers it.
 *
 * The motion is the argument: eight scattered fragments travel to a single
 * column and resolve into one surface. It runs once, on entry, driven purely
 * by CSS — `.reveal.is-visible` flips a class and eight `converge` keyframes
 * play. No library, no scroll listener, no continuous animation.
 *
 * Categories, never brands. Naming a competitor's spreadsheet would be both
 * careless and beside the point: the claim is about the shape of the problem.
 *
 * Under `prefers-reduced-motion` the fragments render in their final
 * positions — the global rule in `globals.css` restores resting state rather
 * than freezing frame one, so nothing disappears.
 */
export function FragmentationSection() {
  return (
    <Section id="problem" tone="surface" bordered>
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeader
            id="problem"
            eyebrow="The problem"
            title={
              <>Your mission shouldn&rsquo;t run across twelve disconnected tools.</>
            }
          />
          <ul className="mt-8 flex flex-col gap-2.5">
            {FRAGMENTATION_LINES.map((line, i) => (
              <Reveal key={line} delay={i * 60}>
                <li className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                  <span
                    className="mt-[0.6rem] h-px w-4 flex-shrink-0 bg-line-strong"
                    aria-hidden
                  />
                  {line}
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={400}>
            <p className="mt-8 font-heading text-[1.25rem] font-semibold tracking-tight text-ink sm:text-[1.4rem]">
              Pegasus connects the work.
            </p>
            <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
              Not by syncing twelve systems to each other, which multiplies the places
              a fact can be wrong. By holding one organisational model that every part
              of the work reads from and writes to.
            </p>
          </Reveal>
        </div>

        <Reveal className="min-w-0">
          <div className="converge-stage relative">
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Where the work lives today">
              {FRAGMENTS.map((fragment, i) => (
                <li
                  key={fragment.label}
                  className={`converge converge-${i} rounded-lg border border-dashed border-line-strong bg-paper px-3 py-2.5`}
                >
                  <div className="text-[0.75rem] font-semibold leading-snug text-ink">
                    {fragment.label}
                  </div>
                  <div className="mt-0.5 text-[0.7rem] leading-snug text-ink-subtle">
                    {fragment.detail}
                  </div>
                </li>
              ))}
            </ul>

            {/* The consolidation, drawn. A bare gradient hairline was almost
                invisible against paper, which left the two halves reading as
                unrelated groups rather than as one becoming the other. */}
            <div
              className="converge-arrow mt-4 flex flex-col items-center"
              aria-hidden
            >
              <span className="h-7 w-px bg-gradient-to-b from-line-strong to-accent" />
              <ChevronDown className="-mt-1.5 h-4 w-4 text-accent" />
            </div>

            <div className="converge-target mt-3 rounded-xl border border-line bg-surface p-5 shadow-elev-2">
              <div className="eyebrow text-accent-ink">Pegasus Mission OS</div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {DOMAINS.map((domain) => (
                  <li
                    key={domain.id}
                    className="rounded-full border border-line bg-paper px-3 py-1 text-[0.75rem] font-medium text-ink"
                  >
                    {domain.name}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-muted">
                One shared organisational model underneath all of it. Enter a funder
                once and it is the same funder in your pipeline, your grant, your
                relationship history and your report.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
