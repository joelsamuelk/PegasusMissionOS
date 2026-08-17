import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
import commandCentreShot from "@/../public/preview-command-centre.png";
import fundingBoardShot from "@/../public/preview-funding-board.png";
import { BrandMotif, Wordmark } from "@/components/brand/Wordmark";
import { BrowserFrame } from "@/components/marketing/BrowserFrame";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Reveal } from "@/components/marketing/Reveal";
import { ButtonLink } from "@/components/shared/ui";

const CAPABILITIES = [
  "Discover and qualify funding opportunities",
  "Assess eligibility and fit with transparent reasoning",
  "Draft grant applications with organisation-aware AI",
  "Run funded programmes and track outcomes",
  "Generate funder-ready impact reports",
];

const STEPS = [
  {
    icon: Search,
    step: "01",
    title: "Find the funding that fits",
    body: "Opportunities are scored against your charitable objects, beneficiaries and track record — with the reasoning shown, never hidden behind a number.",
  },
  {
    icon: FileText,
    step: "02",
    title: "Write with your own evidence",
    body: "Draft answers grounded in your programmes, outcomes and approved evidence library. Every sentence stays yours to edit, question or reject.",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "Prove what you delivered",
    body: "Turn live programme data into funder-ready reports, with every figure traceable back to the evidence it came from.",
  },
];

const MODULES = [
  { name: "Command Centre", detail: "Your organisation's position at a glance." },
  { name: "Funding Pipeline", detail: "Table and Kanban views of every opportunity." },
  { name: "Applications", detail: "A structured workspace for every submission." },
  { name: "Grants", detail: "Health, deliverables, payments and reports." },
  { name: "Programmes", detail: "Activities, outputs, outcomes and indicators." },
  { name: "Impact", detail: "Evidence-based reports from real programme data." },
];

const PIPELINE_POINTS = [
  "Every opportunity in one pipeline, from discovered to decided",
  "Fit scored against your objects and beneficiaries, with reasoning",
  "Deadlines that surface before they become emergencies",
  "Table for working, board for seeing where everything stands",
];

const FAQS = [
  {
    q: "Does the AI decide anything for us?",
    a: "No. Every AI output is a draft for a person to accept, edit or throw away. Fit assessments are decision support, and each one shows the factors behind it so your team can disagree with it.",
  },
  {
    q: "Where does the evidence come from?",
    a: "Your own evidence library — documents, statistics, testimonials and programme indicators that your team has added and approved. Drafts cite what they drew on, so nothing arrives unsourced.",
  },
  {
    q: "Can we try it before committing?",
    a: "Yes. The demo workspace is open, no sign-up required. It runs on Northstar Community Foundation, a fictional UK charity, with every record clearly labelled as sample data.",
  },
  {
    q: "Do we have to move everything at once?",
    a: "No. Most teams start with the funding pipeline, because that is where deadlines hurt most, then bring in applications and impact reporting once the habit is established.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Wordmark showProduct />
          <nav className="hidden items-center gap-8 text-sm text-ink-muted md:flex">
            <a href="#how" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#modules" className="transition-colors hover:text-ink">
              Modules
            </a>
            <a href="#faq" className="transition-colors hover:text-ink">
              FAQ
            </a>
            <a href="#contact" className="transition-colors hover:text-ink">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:block"
            >
              Sign in
            </Link>
            <ButtonLink href="/dashboard" size="sm" variant="blue">
              Enter demo
            </ButtonLink>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 brand-wash" aria-hidden />
          <BrandMotif className="-right-28 top-1/2 hidden h-[360px] w-auto -translate-y-1/2 opacity-[0.07] lg:block lg:animate-float" />
          <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-24">
            <span className="animate-fade-up inline-flex items-center rounded-full border border-blue/25 bg-blue-soft px-3.5 py-1.5 text-eyebrow font-semibold uppercase text-info">
              For charities, NGOs and social enterprises
            </span>
            <h1
              className="animate-fade-up mt-6 max-w-3xl text-balance font-heading text-[2.1rem] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-5xl lg:text-display-lg"
              style={{ animationDelay: "80ms" }}
            >
              Every mission deserves world-class technology.
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted"
              style={{ animationDelay: "160ms" }}
            >
              Pegasus Mission OS gives charities, NGOs and social enterprises one
              intelligent place to discover funding, manage applications, run
              programmes and demonstrate impact.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <ButtonLink href="/dashboard" size="lg" variant="blue">
                Explore the demo workspace
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="#contact" size="lg" variant="secondary">
                Talk to us
              </ButtonLink>
            </div>
            <p
              className="animate-fade-up mt-5 text-xs text-ink-subtle"
              style={{ animationDelay: "320ms" }}
            >
              No sign-up required. The demo uses Northstar Community Foundation, a
              fictional UK charity, with clearly labelled sample data.
            </p>
          </div>
        </section>

        {/* Product preview */}
        <section className="relative mx-auto -mt-2 w-full max-w-6xl px-5 pb-20 sm:px-8">
          <Reveal>
            <BrowserFrame
              src={commandCentreShot}
              alt="The Pegasus Mission OS Command Centre, showing funding pipeline value, applications in progress, active grants, priorities for the week and upcoming deadlines."
              priority
            />
          </Reveal>
        </section>

        {/* Capabilities */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            <Reveal>
              <div className="eyebrow mb-4">What it does</div>
              <h2 className="max-w-md font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                An integrated operating system, not a collection of tools.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                Pegasus connects funding, delivery and evidence so your team spends
                less time on administration and more time on the mission. AI reduces
                the manual work. It never makes decisions for you, and every output is
                editable, explainable and reviewable.
              </p>
            </Reveal>
            <ul className="flex flex-col gap-3">
              {CAPABILITIES.map((c, i) => (
                <Reveal key={c} delay={i * 70}>
                  <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-ink transition-shadow ease-calm hover:shadow-card">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                    <span className="text-sm">{c}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-line bg-surface scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <Reveal>
              <div className="eyebrow mb-4">How it works</div>
              <h2 className="max-w-2xl font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                From a funding deadline to a proven outcome, without the scramble.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal key={s.step} delay={i * 110}>
                  <div className="flex h-full flex-col rounded-xl border border-line bg-paper p-6 transition-shadow ease-calm hover:shadow-card">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-soft">
                        <s.icon className="h-5 w-5 text-info" />
                      </span>
                      <span className="eyebrow">{s.step}</span>
                    </div>
                    <h3 className="mt-5 font-heading text-title font-semibold text-ink">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pipeline preview */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal>
              <div className="eyebrow mb-4">Funding pipeline</div>
              <h2 className="font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                See every opportunity, and what it needs next.
              </h2>
              <ul className="mt-6 flex flex-col gap-3">
                {PIPELINE_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-ink-muted">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/funding" size="md" variant="secondary" className="mt-8">
                Open the pipeline
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </Reveal>
            <Reveal delay={120}>
              <BrowserFrame
                src={fundingBoardShot}
                alt="The Pegasus Mission OS funding pipeline in board view, with opportunities grouped into discovered, reviewing, qualified and applying stages."
              />
            </Reveal>
          </div>
        </section>

        {/* Modules */}
        <section
          id="modules"
          className="relative overflow-hidden border-y border-line bg-surface scroll-mt-20"
        >
          <BrandMotif className="-bottom-20 -right-10 h-60 w-auto opacity-[0.06] sm:right-4 sm:h-72" />
          <div className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <Reveal>
              <div className="eyebrow mb-4">Modules</div>
              <h2 className="max-w-2xl font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                Six modules that share one source of truth.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <Reveal key={m.name} delay={i * 60}>
                  <div className="h-full rounded-xl border border-line bg-paper p-6 transition-shadow ease-calm hover:shadow-card">
                    <div className="font-heading text-title font-semibold text-ink">
                      {m.name}
                    </div>
                    <div className="mt-1.5 text-sm text-ink-muted">{m.detail}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Studio provenance */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-8 sm:p-12">
              <BrandMotif className="-right-6 -top-10 h-44 w-auto opacity-[0.06]" />
              <div className="relative max-w-2xl">
                <div className="eyebrow mb-4">Who builds it</div>
                <h2 className="font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                  Built by Pegasus Information Studio.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  Pegasus Information Studio partners with ambitious organisations to
                  design, build and scale high-performance software, and to embed AI
                  into everyday work where it earns its place. Mission OS is that
                  practice turned toward the sector we care most about — the
                  organisations doing the hardest work with the least slack.
                </p>
                <a
                  href="https://www.pegasus-studio.co/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-info transition-colors hover:text-ink"
                >
                  Visit pegasus-studio.co
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-y border-line bg-surface scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <Reveal>
              <div className="eyebrow mb-4">Questions</div>
              <h2 className="max-w-2xl font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                The things teams ask us first.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {FAQS.map((f, i) => (
                <Reveal key={f.q} delay={i * 70}>
                  <details
                    open={i === 0}
                    className="group h-full rounded-xl border border-line bg-paper p-6 transition-shadow ease-calm hover:shadow-card"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-heading text-title font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <ChevronDown className="mt-0.5 h-5 w-5 flex-shrink-0 text-ink-subtle transition-transform duration-fast group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">{f.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
              <Reveal>
                <div className="eyebrow mb-4">Contact</div>
                <h2 className="font-heading text-heading-lg font-semibold text-ink sm:text-[1.9rem]">
                  Tell us what your team is wrestling with.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  Whether you want a guided walkthrough, a second opinion on your
                  funding pipeline, or a route off a decade of spreadsheets — start
                  here and a person will read it.
                </p>
                <p className="mt-6 text-sm text-ink-muted">
                  Prefer email?{" "}
                  <a
                    href="mailto:hello@pegasus-studio.co"
                    className="font-medium text-info hover:underline"
                  >
                    hello@pegasus-studio.co
                  </a>
                </p>
                <p className="mt-2 text-xs text-ink-subtle">
                  All conversations are confidential.
                </p>
              </Reveal>
              <Reveal delay={120}>
                <div className="rounded-xl border border-line bg-surface p-6 shadow-elev-1 sm:p-8">
                  <ContactForm />
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <Wordmark showProduct />
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                The operating system for mission-driven organisations.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-2">
              <div>
                <div className="eyebrow mb-3">Product</div>
                <ul className="flex flex-col gap-2 text-sm text-ink-muted">
                  <li>
                    <a href="#how" className="transition-colors hover:text-ink">
                      How it works
                    </a>
                  </li>
                  <li>
                    <a href="#modules" className="transition-colors hover:text-ink">
                      Modules
                    </a>
                  </li>
                  <li>
                    <Link href="/dashboard" className="transition-colors hover:text-ink">
                      Demo workspace
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <div className="eyebrow mb-3">Company</div>
                <ul className="flex flex-col gap-2 text-sm text-ink-muted">
                  <li>
                    <a
                      href="https://www.pegasus-studio.co/"
                      target="_blank"
                      rel="noreferrer"
                      className="transition-colors hover:text-ink"
                    >
                      Pegasus Studio
                    </a>
                  </li>
                  <li>
                    <a href="#contact" className="transition-colors hover:text-ink">
                      Contact
                    </a>
                  </li>
                  <li>
                    <Link href="/login" className="transition-colors hover:text-ink">
                      Sign in
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-line pt-6 text-xs text-ink-subtle">
            © {new Date().getFullYear()} Pegasus Information Studio. Mission OS is a
            product of Pegasus Information Studio.
          </div>
        </div>
      </footer>
    </div>
  );
}
