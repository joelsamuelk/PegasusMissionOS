import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/shared/ui";

const CAPABILITIES = [
  "Discover and qualify funding opportunities",
  "Assess eligibility and fit with transparent reasoning",
  "Draft grant applications with organisation-aware AI",
  "Run funded programmes and track outcomes",
  "Generate funder-ready impact reports",
];

const MODULES = [
  { name: "Command Centre", detail: "Your organisation's position at a glance." },
  { name: "Funding Pipeline", detail: "Table and Kanban views of every opportunity." },
  { name: "Applications", detail: "A structured workspace for every submission." },
  { name: "Grants", detail: "Health, deliverables, payments and reports." },
  { name: "Programmes", detail: "Activities, outputs, outcomes and indicators." },
  { name: "Impact", detail: "Evidence-based reports from real programme data." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark showProduct />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-ink-muted hover:text-ink"
          >
            Sign in
          </Link>
          <ButtonLink href="/dashboard" size="sm" variant="primary">
            Enter demonstration
          </ButtonLink>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="absolute inset-0 grid-motif" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6 py-24">
            <div className="eyebrow mb-5">The operating system for mission-driven organisations</div>
            <h1 className="max-w-3xl font-serif text-display-lg font-medium tracking-tight text-ink">
              Every mission deserves world-class technology.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Pegasus Mission OS gives charities, NGOs and social enterprises one
              intelligent place to discover funding, manage applications, run
              programmes and demonstrate impact.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/dashboard" size="lg" variant="primary">
                Explore the demonstration workspace
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/signup" size="lg" variant="secondary">
                Create a workspace
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-ink-subtle">
              The demonstration uses Northstar Community Foundation, a fictional UK
              charity, with clearly labelled sample data.
            </p>
          </div>
        </section>

        {/* Capabilities */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <div className="eyebrow mb-4">What it does</div>
              <h2 className="max-w-md font-serif text-heading-lg font-medium tracking-tight text-ink">
                An integrated operating system, not a collection of tools.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                Pegasus connects funding, delivery and evidence so your team spends
                less time on administration and more time on the mission. AI reduces
                the manual work. It never makes decisions for you, and every output is
                editable, explainable and reviewable.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {CAPABILITIES.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-3 border-b border-line pb-3 text-ink"
                >
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                  <span className="text-sm">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Modules */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="eyebrow mb-8">Modules</div>
            <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => (
                <div key={m.name} className="bg-surface p-6">
                  <div className="text-title font-semibold text-ink">{m.name}</div>
                  <div className="mt-1.5 text-sm text-ink-muted">{m.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <Wordmark />
          <p className="text-xs text-ink-subtle">
            Pegasus builds the operating system for mission-driven organisations.
          </p>
        </div>
      </footer>
    </div>
  );
}
