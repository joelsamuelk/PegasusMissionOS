import { PRINCIPLES } from "@/lib/marketing/content";
import {
  Section,
  SectionHeader,
  StatusChip,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Engineering principles.
 *
 * What this section deliberately does not do: publish test counts, line
 * counts, or any other internal number dressed up as a quality signal. "259
 * tests" tells a visitor nothing they can evaluate, and it invites the reader
 * to trust an integer instead of a claim they can check.
 *
 * What it does instead is name six properties of the system, each of which is
 * either demonstrated elsewhere on this page or labelled as not yet shipped.
 */
export function PrinciplesSection() {
  return (
    <Section id="principles">
      <SectionHeader
        id="principles"
        eyebrow="How it is built"
        title="Built around evidence, not AI theatre."
        lead="The interesting engineering in Pegasus is not the model call. It is everything that makes a model call safe to rely on: the deterministic core it sits beside, the provenance it has to satisfy, and the approval it cannot bypass."
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((principle, i) => (
          <li key={principle.name} className="bg-surface p-6">
            <Reveal delay={i * 60}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-[1rem] font-semibold leading-snug tracking-tight text-ink">
                  {principle.name}
                </h3>
                {principle.status && <StatusChip status={principle.status} />}
              </div>
              <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-muted">
                {principle.body}
              </p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
