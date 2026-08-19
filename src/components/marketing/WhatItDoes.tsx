import {
  ArrowRight,
  FileBarChart2,
  Library,
  HeartHandshake,
  Landmark,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react";
import { DOMAINS, WHAT_IT_DOES } from "@/lib/marketing/content";
import { Section, SectionHeader, StatusChip } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * What Pegasus does, on one screen.
 *
 * This section replaced four on the home page: the fragmentation animation,
 * the Mission OS map, the lifecycle rail and the composition diagram. All four
 * argued the same point — the domains are connected — and a visitor deciding
 * whether to keep reading needs that point made once, in a grid they can scan,
 * not four times in a row.
 *
 * The longer arguments still exist; they moved to `/product`, which the link
 * at the bottom is for. Each tile shows `role` (one sentence) rather than
 * `detail`, and honesty labels ride on the tile they qualify.
 *
 * The icons are keyed by domain id and shared with the hero graphic, so a
 * reader who saw `Funding` as a target on the ring meets the same target here.
 * They are decorative: every one sits beside the domain's name in text, so
 * they are hidden from assistive technology rather than labelled twice.
 *
 * Static. Adds nothing to the bundle beyond the seven icon paths.
 */

/** Keep in step with `MissionGraphic`, which draws the same seven. */
const DOMAIN_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  funding: Target,
  finance: Landmark,
  relationships: HeartHandshake,
  programmes: Layers,
  evidence: Library,
  impact: TrendingUp,
  reports: FileBarChart2,
};
export function WhatItDoes() {
  return (
    <Section id="what-it-does" tone="surface" bordered>
      <SectionHeader
        id="what-it-does"
        eyebrow={WHAT_IT_DOES.eyebrow}
        title={WHAT_IT_DOES.title}
        lead={WHAT_IT_DOES.lead}
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {DOMAINS.map((domain, i) => {
          const Icon = DOMAIN_ICON[domain.id] ?? Target;
          return (
            <li key={domain.id} className="bg-paper p-6">
              <Reveal delay={(i % 3) * 60}>
                <span
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft text-accent"
                  aria-hidden
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-[1.0625rem] font-semibold tracking-tight text-ink">
                    {domain.name}
                  </h3>
                  {domain.status && <StatusChip status={domain.status} />}
                </div>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {domain.role}
                </p>
              </Reveal>
            </li>
          );
        })}

        {/* Seven domains leave two empty cells in a three-column grid, so this
            spans both: the claim the grid exists to make, filling the space an
            eighth domain would otherwise be invented for. At two columns the
            seven tiles leave one gap and this fills it exactly. */}
        <li className="flex flex-col justify-between gap-4 bg-paper p-6 lg:col-span-2">
          <p className="font-heading text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink">
            Not seven tools that sync. One record of your organisation.
          </p>
          <a
            href="/product"
            className="inline-flex items-center gap-1.5 rounded text-[0.875rem] font-medium text-info transition-colors hover:text-ink"
          >
            See how it works
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </li>
      </ul>
    </Section>
  );
}
