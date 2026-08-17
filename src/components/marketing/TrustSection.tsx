import { TRUST_PRINCIPLES } from "@/lib/marketing/content";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Trust.
 *
 * The most precisely worded section on the site, and the one most likely to be
 * softened by someone later. Two rules govern it:
 *
 * 1. The ISOLATED principle is quoted verbatim from `content.ts`, which is in
 *    turn quoted from `MARKETING_SITE_ARCHITECTURE.md` §9.3. Row-level
 *    security is written into the migrations and has **not** been verified
 *    against a live database, because no Supabase project is provisioned. The
 *    sentence names the layer that is proven and the layer that is not.
 * 2. Nothing here implies certification. No SOC 2, no ISO, no "enterprise
 *    grade", no "bank-level". A page arguing that Pegasus tells the truth
 *    about what it knows cannot itself overstate what it has.
 */
export function TrustSection() {
  return (
    <Section id="trust" tone="navy" className="text-white">
      <SectionHeader
        id="trust"
        eyebrow="Trust"
        title="Built for decisions that have consequences."
        lead="A wrong number in a funding application is not a bug report. It is a relationship, a programme and sometimes a job. Pegasus is built so that every consequential figure can be interrogated, and so that the software says what it does not know."
        invert
      />

      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_PRINCIPLES.map((principle, i) => (
          <li key={principle.name} className="bg-navy p-6 sm:p-7">
            <Reveal delay={i * 70}>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[0.7rem] text-white/35" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-heading text-[0.9375rem] font-semibold uppercase tracking-[0.14em] text-white">
                  {principle.name}
                </h3>
              </div>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-white/65">
                {principle.body}
              </p>
            </Reveal>
          </li>
        ))}
        <li className="flex items-center bg-navy p-6 sm:p-7">
          <p className="text-[0.875rem] leading-relaxed text-white/50">
            Every one of these is a constraint in the codebase rather than a policy in a
            document — enforced by tests that fail the build when they are broken.
          </p>
        </li>
      </ol>
    </Section>
  );
}
