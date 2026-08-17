"use client";

import { useRef, useState } from "react";
import { PERSONAS } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * The persona explorer.
 *
 * A `tablist` rather than a set of cards, because the panel is the point: the
 * same product, described in the terms each role actually thinks in. Roving
 * tabindex, arrow keys, Home and End, and selection follows focus — the
 * standard pattern, implemented rather than approximated.
 *
 * The tablist is vertical on desktop and a horizontally scrolling strip on
 * mobile, which is why the orientation is declared dynamically. The panel has
 * a minimum height so switching personas does not shift the page under the
 * reader's thumb.
 */
export function PersonaExplorer() {
  const [activeId, setActiveId] = useState(PERSONAS[0]!.id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = PERSONAS.find((p) => p.id === activeId) ?? PERSONAS[0]!;

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = PERSONAS.findIndex((p) => p.id === activeId);
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (index + 1) % PERSONAS.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (index - 1 + PERSONAS.length) % PERSONAS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = PERSONAS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = PERSONAS[next]!.id;
    setActiveId(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr] lg:gap-10">
      <div
        role="tablist"
        aria-label="Who Pegasus is for"
        onKeyDown={onKeyDown}
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {PERSONAS.map((persona) => {
          const selected = persona.id === activeId;
          return (
            <button
              key={persona.id}
              ref={(el) => {
                tabRefs.current[persona.id] = el;
              }}
              type="button"
              role="tab"
              id={`persona-tab-${persona.id}`}
              aria-selected={selected}
              aria-controls="persona-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(persona.id)}
              className={cn(
                "flex-shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[0.875rem] font-medium transition-colors duration-fast lg:w-full lg:whitespace-normal lg:rounded-lg lg:px-4 lg:py-3 lg:text-left",
                selected
                  ? "border-accent/40 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {persona.role}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="persona-panel"
        aria-labelledby={`persona-tab-${active.id}`}
        tabIndex={0}
        className="flex min-h-[20rem] flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8"
      >
        <h3 className="max-w-xl font-heading text-[1.35rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.65rem]">
          {active.promise}
        </h3>
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
          {active.body}
        </p>

        <div className="mt-7">
          <div className="eyebrow">What that looks like</div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {active.looksLike.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[0.8125rem] leading-snug text-ink"
              >
                <span
                  className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
