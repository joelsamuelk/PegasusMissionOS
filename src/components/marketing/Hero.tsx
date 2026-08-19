import { ArrowRight } from "lucide-react";
import { HERO } from "@/lib/marketing/content";
import { BrandMotif } from "@/components/brand/Wordmark";
import { HeroComposition } from "@/components/marketing/HeroComposition";
import { ButtonLink } from "@/components/shared/ui";

/**
 * The hero.
 *
 * The headline is unchanged from the previous site and is not up for
 * negotiation — it is the brand statement. What changed underneath it is the
 * claim: the old supporting copy described four things Pegasus does, which is
 * how a product with modules describes itself. This one names the domains it
 * connects and then says the thing the modules framing could never say.
 *
 * The graphic occupies the right column from `lg` and is dropped below it, not
 * shrunk into it, on narrower screens: at 400px the seven labels collide and
 * the figure stops carrying its own argument. Copy first on every width.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div className="absolute inset-0 brand-wash" aria-hidden />
      <BrandMotif className="-right-24 top-1/2 h-[300px] w-auto -translate-y-1/2 opacity-[0.06] lg:hidden" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <span className="animate-fade-up inline-flex items-center rounded-full border border-blue/25 bg-blue-soft px-3.5 py-1.5 text-eyebrow font-semibold uppercase text-info">
            {HERO.eyebrow}
          </span>

          <h1
            id="hero-heading"
            className="animate-fade-up mt-7 text-balance font-heading text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.04em] text-ink sm:text-[4rem] lg:text-[5rem]"
            style={{ animationDelay: "80ms" }}
          >
            {HERO.headline}
          </h1>

          <p
            className="animate-fade-up mx-auto mt-7 max-w-3xl text-[1.0625rem] leading-relaxed text-ink-muted sm:text-xl"
            style={{ animationDelay: "150ms" }}
          >
            {HERO.body}
          </p>

          <p
            className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 font-heading text-[0.95rem] font-semibold tracking-tight text-ink sm:text-[1.0625rem]"
            style={{ animationDelay: "220ms" }}
          >
            {HERO.refrain.map((line, i) => (
              <span key={line} className="inline-flex items-center gap-2.5">
                {i > 0 && <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />}
                {line}
              </span>
            ))}
          </p>

          <div
            className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "290ms" }}
          >
            <ButtonLink href="#contact" size="lg" variant="blue">
              Get early access
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#see-it" size="lg" variant="secondary">
              See how it works
            </ButtonLink>
          </div>

          <p
            className="animate-fade-up mx-auto mt-5 max-w-xl text-xs leading-relaxed text-ink-subtle"
            style={{ animationDelay: "350ms" }}
          >
            {HERO.note}
          </p>
        </div>

        <div id="see-it" className="scroll-mt-24 pt-6">
          <HeroComposition />
        </div>
      </div>
    </section>
  );
}
