import {
  ArrowRight,
  Check,
  FileCheck2,
  Landmark,
  Library,
  Link2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";

const ROLES = [
  "Chief executives",
  "Fundraisers",
  "Programme teams",
  "Finance",
  "Impact & MEL",
  "Trustees",
] as const;

const GLANCE = [
  {
    icon: Target,
    title: "Find the right funding",
    body: "Check eligibility early, see fit factor by factor and keep every opportunity moving.",
    tone: "bg-blue-soft text-info",
  },
  {
    icon: Link2,
    title: "Keep the whole story connected",
    body: "Link grants to delivery, evidence, relationships and the reports they eventually become.",
    tone: "bg-accent-soft text-accent-ink",
  },
  {
    icon: Library,
    title: "Reuse what you already know",
    body: "Keep approved evidence ready for the next application, board pack or funder report.",
    tone: "bg-success-soft text-success",
  },
  {
    icon: Landmark,
    title: "See what needs attention",
    body: "Bring deadlines, grant health, delivery progress and financial pressure into one view.",
    tone: "bg-warning-soft text-warning",
  },
] as const;

/**
 * The homepage's benefit-led middle. Each chapter makes one argument and then
 * shows a small piece of interface-shaped proof, followed by a compact scan of
 * the product and its audiences. This keeps depth on `/product` while giving
 * the homepage the visual rhythm of a mature product site.
 */
export function HomeStory() {
  return (
    <>
      <section className="overflow-hidden bg-accent-soft/60" aria-labelledby="less-admin-heading">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28">
          <Reveal>
            <span className="eyebrow text-accent-ink">Uncomplicated</span>
            <h2 id="less-admin-heading" className="mt-4 max-w-xl text-balance font-heading text-[2rem] font-semibold leading-[1.08] text-ink sm:text-[2.6rem]">
              Less system-wrangling. More time for the mission.
            </h2>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-ink-muted">
              Add a fact once. The same funder, programme, outcome or piece of evidence is then ready wherever the work needs it, without another spreadsheet to reconcile.
            </p>
            <a href="/product" className="mt-7 inline-flex items-center gap-2 rounded text-sm font-semibold text-accent-ink hover:text-ink">
              See how the shared model works
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Reveal>

          <Reveal delay={100} className="relative min-h-[24rem]">
            <div className="absolute inset-x-0 top-5 rounded-[2rem] bg-surface p-5 shadow-elev-3 sm:p-7">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <span className="eyebrow">Application answer</span>
                  <h3 className="mt-1 font-heading text-lg font-semibold text-ink">Describe your track record</h3>
                </div>
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">Ready to review</span>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-relaxed text-ink-muted">
                <span className="block h-2.5 w-full rounded-full bg-surface-sunken" />
                <span className="block h-2.5 w-[92%] rounded-full bg-surface-sunken" />
                <span className="block h-2.5 w-[76%] rounded-full bg-surface-sunken" />
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-paper p-4">
                <FileCheck2 className="h-5 w-5 text-success" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Approved evidence linked</p>
                  <p className="text-xs text-ink-subtle">Every claim keeps its source visible.</p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-[72%] rounded-2xl border border-line bg-navy p-5 text-white shadow-elev-3 sm:right-5">
              <div className="flex items-center gap-2 text-white/65">
                <Sparkles className="h-4 w-4" aria-hidden />
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]">Pegasus Intelligence</span>
              </div>
              <p className="mt-3 font-heading text-base font-semibold">Drafted from records your team approved.</p>
              <p className="mt-2 text-xs leading-relaxed text-white/60">Nothing published automatically. A named person reviews every answer.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="glance-heading">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-28">
          <Reveal>
            <span className="eyebrow">Pegasus at a glance</span>
            <h2 id="glance-heading" className="mt-4 max-w-3xl text-balance font-heading text-[2rem] font-semibold leading-[1.08] text-ink sm:text-[2.6rem]">
              The work is complicated. The system holding it should not be.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {GLANCE.map(({ icon: Icon, title, body, tone }, index) => (
              <Reveal key={title} delay={index * 60} className="h-full">
                <article className="group flex h-full min-h-[15rem] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-6 transition-transform duration-slow hover:-translate-y-1 sm:p-8">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="mt-10">
                    <h3 className="font-heading text-xl font-semibold text-ink">{title}</h3>
                    <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">{body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="personas" className="scroll-mt-24 border-y border-line bg-blue-soft" aria-labelledby="personas-heading">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:py-20">
          <Reveal>
            <div className="flex items-center gap-2 text-info">
              <Users className="h-4 w-4" aria-hidden />
              <span className="eyebrow text-info">Built for the whole team</span>
            </div>
            <h2 id="personas-heading" className="mt-3 font-heading text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.15rem]">
              Different roles. The same organisational truth.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((role) => (
                <li key={role} className="flex items-center gap-2 rounded-xl border border-blue/15 bg-surface/80 px-4 py-3 text-sm font-semibold text-ink">
                  <Check className="h-4 w-4 text-info" aria-hidden />
                  {role}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </>
  );
}
