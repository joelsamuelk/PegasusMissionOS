import { LIFECYCLE } from "@/lib/marketing/content";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * The mission lifecycle.
 *
 * The point is not the twelve boxes — every process diagram has boxes. It is
 * that each stage leaves something behind that the next one uses, so the last
 * stage in a cycle is the first stage of the next one already half-complete.
 * The copy under each stage names what it deposits rather than what happens
 * in it, which is the difference between a workflow chart and an argument.
 *
 * Desktop: a horizontal rail that scrolls with snap points, with a connective
 * line that fills once when the rail enters view. Mobile: a vertical timeline
 * with a left spine. Not the same component at two widths — the horizontal
 * rail is genuinely bad on a phone, and a squeezed one is worse.
 */
export function Lifecycle() {
  return (
    <Section id="lifecycle">
      <SectionHeader
        id="lifecycle"
        eyebrow="How it works"
        title="From understanding your organisation to proving what changed."
        lead="Nothing in Pegasus is entered for its own sake. Each stage of the cycle leaves something behind that the next one needs, so a year of work compounds into a starting position rather than an archive."
      />

      {/* Desktop rail */}
      <Reveal className="mt-14 hidden lg:block">
        <div className="lifecycle-rail relative">
          <ol className="relative grid grid-cols-6 gap-x-4 gap-y-10">
            {LIFECYCLE.map((stage, i) => (
              <li key={stage.name} className="relative min-w-0">
                {/* One connector per item rather than a single full-width
                    rule: the rail wraps to two rows, and a rule drawn across
                    the grid joined the first row and abandoned the second. */}
                {(i + 1) % 6 !== 0 && (
                  <span
                    className="lifecycle-line absolute left-11 right-[-1rem] top-[1.4rem] h-px origin-left bg-line-strong"
                    style={{ transitionDelay: `${120 + i * 70}ms` }}
                    aria-hidden
                  />
                )}
                <span
                  className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface font-mono text-[0.7rem] font-semibold text-ink-subtle shadow-elev-1"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-heading text-[1rem] font-semibold tracking-tight text-ink">
                  {stage.name}
                </h3>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-muted">
                  {stage.outcome}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* Mobile / tablet timeline */}
      <ol className="mt-10 lg:hidden">
        {LIFECYCLE.map((stage, i) => (
          <li key={stage.name} className="relative flex gap-4 pb-7 last:pb-0">
            {i < LIFECYCLE.length - 1 && (
              <span
                className="absolute left-[1.25rem] top-10 bottom-0 w-px bg-line-strong"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-[0.65rem] font-semibold text-ink-subtle"
              aria-hidden
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 pt-1">
              <h3 className="font-heading text-[1rem] font-semibold tracking-tight text-ink">
                {stage.name}
              </h3>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-muted">
                {stage.outcome}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Reveal>
        <p className="mt-12 max-w-2xl border-l-2 border-accent pl-5 font-heading text-[1.125rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.3rem]">
          By the twelfth stage, the organisation knows more than it did at the first —
          and none of that had to be typed twice.
        </p>
      </Reveal>
    </Section>
  );
}
