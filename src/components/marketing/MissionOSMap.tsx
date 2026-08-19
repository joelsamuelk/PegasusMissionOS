"use client";

import { useRef, useState } from "react";
import { ChevronDown, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { DOMAINS, OS_FOUNDATIONS, type Domain } from "@/lib/marketing/content";
import { StatusChip } from "@/components/marketing/primitives";
import { cn } from "@/lib/utils";

/**
 * The operating-system map: the page's centrepiece.
 *
 * Two genuinely different components rather than one component that shrinks.
 * A radial diagram at 375px is unreadable and unusable by touch, so mobile
 * gets an accordion carrying exactly the same content, and desktop gets a map
 * whose detail panel is a fixed-height region so hovering never reflows the
 * page. The `lg:` boundary swaps them; neither is the other's leftovers.
 *
 * Accessibility notes worth stating, because interactive diagrams usually get
 * this wrong:
 *
 * - The desktop map is a real `tablist` with roving tabindex and arrow key,
 *   Home and End support. Every domain is reachable and selectable by
 *   keyboard, and selection follows focus.
 * - The SVG connectors are `aria-hidden` decoration. The diagram is never the
 *   only carrier of meaning: the same relationships are stated in the labelled
 *   controls and the panel text.
 * - The mobile accordion uses `aria-expanded`/`aria-controls` on real buttons.
 */
export function MissionOSMap() {
  return (
    <>
      <div className="hidden lg:block">
        <DesktopMap />
      </div>
      <div className="lg:hidden">
        <MobileAccordion />
      </div>
    </>
  );
}

// --- Desktop -------------------------------------------------------------

function DesktopMap() {
  const [activeId, setActiveId] = useState(DOMAINS[0]!.id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = DOMAINS.find((d) => d.id === activeId) ?? DOMAINS[0]!;

  const select = (id: string) => {
    setActiveId(id);
    tabRefs.current[id]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = DOMAINS.findIndex((d) => d.id === activeId);
    if (index < 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % DOMAINS.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + DOMAINS.length) % DOMAINS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = DOMAINS.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(DOMAINS[next]!.id);
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
      {/* The map */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-elev-1">
        <Band
          icon={Sparkles}
          title="Pegasus Intelligence"
          detail="Understand · Anticipate · Recommend"
          tone="accent"
        />

        <div
          role="tablist"
          aria-label="Mission OS domains"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="mt-3 grid grid-cols-4 gap-2"
        >
          {DOMAINS.map((domain) => {
            const selected = domain.id === activeId;
            return (
              <button
                key={domain.id}
                ref={(el) => {
                  tabRefs.current[domain.id] = el;
                }}
                type="button"
                role="tab"
                id={`domain-tab-${domain.id}`}
                aria-selected={selected}
                aria-controls="domain-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(domain.id)}
                onMouseEnter={() => setActiveId(domain.id)}
                onFocus={() => setActiveId(domain.id)}
                className={cn(
                  "group flex min-h-[5.25rem] flex-col justify-between rounded-xl border p-3 text-left transition-all duration-fast ease-calm",
                  selected
                    ? "-translate-y-0.5 border-accent/40 bg-accent-soft shadow-elev-2"
                    : "border-line bg-paper hover:border-line-strong hover:shadow-elev-1",
                )}
              >
                <span
                  className={cn(
                    "font-heading text-[0.9375rem] font-semibold tracking-tight",
                    selected ? "text-accent-ink" : "text-ink",
                  )}
                >
                  {domain.name}
                </span>
                <span className="mt-1 text-[0.6875rem] leading-snug text-ink-subtle">
                  {domain.hint}
                </span>
              </button>
            );
          })}
          {/* Seven domains in a four-column grid leaves the last cell empty,
              and empty is correct. A filler tile here read as an eighth domain
              and repeated the pull-quote below the map. */}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {OS_FOUNDATIONS.map((foundation) => (
            <Band
              key={foundation.name}
              icon={foundation.name === "Trust" ? ShieldCheck : Layers}
              title={foundation.name}
              detail={foundation.detail}
              tone="quiet"
            />
          ))}
        </div>
      </div>

      {/* The detail panel. Fixed minimum height so hover never reflows. */}
      <div
        role="tabpanel"
        id="domain-panel"
        aria-labelledby={`domain-tab-${active.id}`}
        tabIndex={0}
        className="flex min-h-[22rem] flex-col rounded-2xl border border-line bg-paper p-7"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-heading text-[1.5rem] font-semibold tracking-tight text-ink">
            {active.name}
          </h3>
          {active.status && <StatusChip status={active.status} />}
        </div>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink">{active.role}</p>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
          {active.detail}
        </p>
        <div className="mt-auto pt-6">
          <div className="eyebrow">In the product</div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {active.surfaces.map((surface) => (
              <li
                key={surface}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[0.75rem] text-ink-muted"
              >
                {surface}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Band({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  tone: "accent" | "quiet";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3",
        tone === "accent"
          ? "border-accent/25 bg-accent-soft"
          : "border-line bg-surface-sunken/70",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0",
          tone === "accent" ? "text-accent" : "text-ink-subtle",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.12em]",
          tone === "accent" ? "text-accent-ink" : "text-ink",
        )}
      >
        {title}
      </span>
      <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-muted">
        {detail}
      </span>
    </div>
  );
}

// --- Mobile --------------------------------------------------------------

function MobileAccordion() {
  const [openId, setOpenId] = useState<string | null>(DOMAINS[0]!.id);

  return (
    <div>
      <div className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span className="font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-accent-ink">
            Pegasus Intelligence
          </span>
        </div>
        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
          Understand · Anticipate · Recommend
        </p>
      </div>

      <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {DOMAINS.map((domain) => (
          <MobileRow
            key={domain.id}
            domain={domain}
            open={openId === domain.id}
            onToggle={() => setOpenId(openId === domain.id ? null : domain.id)}
          />
        ))}
      </ul>

      <div className="mt-3 flex flex-col gap-2">
        {OS_FOUNDATIONS.map((foundation) => (
          <div
            key={foundation.name}
            className="rounded-xl border border-line bg-surface-sunken/70 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              {foundation.name === "Trust" ? (
                <ShieldCheck className="h-4 w-4 text-ink-subtle" aria-hidden />
              ) : (
                <Layers className="h-4 w-4 text-ink-subtle" aria-hidden />
              )}
              <span className="font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-ink">
                {foundation.name}
              </span>
            </div>
            <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
              {foundation.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileRow({
  domain,
  open,
  onToggle,
}: {
  domain: Domain;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`domain-body-${domain.id}`}
        id={`domain-button-${domain.id}`}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block font-heading text-[1rem] font-semibold tracking-tight text-ink">
            {domain.name}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-muted">
            {domain.role}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-ink-subtle transition-transform duration-fast",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={`domain-body-${domain.id}`}
          role="region"
          aria-labelledby={`domain-button-${domain.id}`}
          className="px-4 pb-4"
        >
          {domain.status && <StatusChip status={domain.status} className="mb-3" />}
          <p className="text-[0.875rem] leading-relaxed text-ink-muted">{domain.detail}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {domain.surfaces.map((surface) => (
              <li
                key={surface}
                className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[0.7rem] text-ink-muted"
              >
                {surface}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
