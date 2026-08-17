import { ArrowRight } from "lucide-react";
import { FINAL_CTA } from "@/lib/marketing/content";
import { BrandMotif } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/shared/ui";
import { ContactForm } from "@/components/marketing/ContactForm";

/**
 * The closing sequence: the ask, then the conversation.
 *
 * The CTA and the contact form share one section rather than sitting in two,
 * because splitting them puts a section boundary between "here is what to do"
 * and the means of doing it. The form is unchanged — validated, honeypotted
 * and rate-limited server-side — and stays four fields. Turning it into a
 * qualification form would contradict the sentence above it.
 */
export function FinalCTA() {
  return (
    <>
      <section
        aria-labelledby="cta-heading"
        className="relative overflow-hidden border-t border-line"
      >
        <div className="absolute inset-0 brand-wash" aria-hidden />
        <BrandMotif className="-right-24 top-1/2 hidden h-64 w-auto -translate-y-1/2 opacity-[0.06] lg:block" />
        <div className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <h2
            id="cta-heading"
            className="max-w-3xl text-balance font-heading text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.6rem]"
          >
            {FINAL_CTA.headline}
          </h2>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-muted">
            {FINAL_CTA.body}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/dashboard" size="lg" variant="blue">
              Explore the demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#contact" size="lg" variant="secondary">
              Talk to us
            </ButtonLink>
          </div>
        </div>
      </section>

      <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <div className="eyebrow mb-4">Contact</div>
              <h2
                id="contact-heading"
                className="font-heading text-[1.6rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.9rem]"
              >
                Tell us what your team is wrestling with.
              </h2>
              <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
                Whether you want a guided walkthrough, a second opinion on your funding
                pipeline, or a route off a decade of spreadsheets — start here and a
                person will read it.
              </p>
              <p className="mt-7 text-[0.9375rem] text-ink-muted">
                Prefer email?{" "}
                <a
                  href="mailto:hello@pegasus-studio.co"
                  className="rounded font-medium text-info hover:underline"
                >
                  hello@pegasus-studio.co
                </a>
              </p>
              <p className="mt-2 text-xs text-ink-subtle">
                All conversations are confidential.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-elev-1 sm:p-8">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
