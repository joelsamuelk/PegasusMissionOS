import { ChevronDown } from "lucide-react";
import { FAQS } from "@/lib/marketing/content";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * FAQ.
 *
 * Native `<details>`/`<summary>`: keyboard-operable, screen-reader-correct and
 * fully functional with JavaScript disabled, at the cost of zero bytes. A
 * hand-rolled accordion here would be strictly worse in every dimension.
 *
 * The answers are the sharp end of the truthfulness rule — this is where a
 * visitor asks the direct question. "What parts of Pegasus are available
 * today?" is answered by naming what is not, in the same sentence as what is.
 */
export function FAQ() {
  return (
    <Section id="faq" tone="surface" bordered>
      <SectionHeader
        id="faq"
        eyebrow="Questions"
        title="The things teams ask us first."
        lead="Including the ones with awkward answers."
      />

      <div className="mt-12 grid gap-3 lg:grid-cols-2 lg:gap-4">
        {FAQS.map((faq, i) => (
          <Reveal key={faq.q} delay={(i % 2) * 70}>
            <details
              open={i === 0}
              className="group h-full rounded-xl border border-line bg-paper p-5 transition-shadow ease-calm hover:shadow-card sm:p-6"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-heading text-[1rem] font-semibold leading-snug text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                {faq.q}
                <ChevronDown
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-ink-subtle transition-transform duration-fast group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-muted">{faq.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
