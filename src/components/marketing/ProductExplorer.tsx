"use client";

import { useRef, useState } from "react";
import { formatCurrency, formatCurrencyCompact, formatDate, humanise } from "@/lib/formatting";
import type {
  FundingPreview,
  ProductExplorerPreview,
  RelationshipPreview,
} from "@/lib/marketing/preview";
import { AppFrame, AppRail, MiniMetric } from "@/components/marketing/primitives";
import { NAV_LABELS } from "@/lib/marketing/rail";
import { cn } from "@/lib/utils";

/**
 * The product explorer: six previews of the working application.
 *
 * HTML recreations rather than screenshots, and rendered from the seeded
 * workspace rather than written by hand. A recreation reflows at 375px, reads
 * correctly to a screen reader, follows the theme and cannot go stale; a PNG
 * does none of that.
 *
 * The line this deliberately does not cross: nothing here re-implements
 * application logic. Each panel renders data the server already computed with
 * the product's own functions. This is a viewer, not a second copy of the app.
 */
const TABS = [
  { id: "command", label: "Command Centre", rail: "Command Centre", path: "/dashboard" },
  { id: "funding", label: "Funding", rail: "Funding", path: "/funding" },
  { id: "application", label: "Application", rail: "Applications", path: "/applications" },
  { id: "relationship", label: "Relationship", rail: "Relationships", path: "/relationships" },
  { id: "programme", label: "Programme", rail: "Programmes", path: "/programmes" },
  { id: "impact", label: "Impact", rail: "Impact", path: "/impact" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProductExplorer({
  explorer,
  funding,
  relationship,
}: {
  explorer: ProductExplorerPreview;
  funding: FundingPreview;
  relationship: RelationshipPreview | null;
}) {
  const [activeId, setActiveId] = useState<TabId>("command");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = TABS.find((t) => t.id === activeId)!;

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === activeId);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const id = TABS[next]!.id;
    setActiveId(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Product previews"
        onKeyDown={onKeyDown}
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {TABS.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`product-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="product-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "flex-shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[0.8125rem] font-medium transition-colors duration-fast",
                selected
                  ? "border-ink bg-ink text-ink-inverse"
                  : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="product-panel"
        aria-labelledby={`product-tab-${active.id}`}
        tabIndex={0}
        className="mt-5"
      >
        <AppFrame path={active.path} label={active.label} compact>
          <div className="flex min-h-[26rem]">
            <AppRail items={NAV_LABELS} active={active.rail} />
            <div className="min-w-0 flex-1 overflow-x-auto p-4 sm:p-5">
              {activeId === "command" && <CommandPanel explorer={explorer} />}
              {activeId === "funding" && <FundingPanel explorer={explorer} funding={funding} />}
              {activeId === "application" && <ApplicationPanel explorer={explorer} />}
              {activeId === "relationship" && <RelationshipPanel relationship={relationship} />}
              {activeId === "programme" && <ProgrammePanel explorer={explorer} />}
              {activeId === "impact" && <ImpactPanel explorer={explorer} />}
            </div>
          </div>
        </AppFrame>
      </div>
    </div>
  );
}

// --- Panels --------------------------------------------------------------

function PanelHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-heading text-[1.05rem] font-semibold tracking-tight text-ink">
        {children}
      </h3>
      {sub && <p className="mt-1 text-[0.8125rem] text-ink-muted">{sub}</p>}
    </div>
  );
}

function CommandPanel({ explorer }: { explorer: ProductExplorerPreview }) {
  const { metrics } = explorer.command;
  return (
    <div>
      <PanelHeading sub="Your organisation's position for the week.">
        Good morning. Here is where {explorer.command.organisationName} stands.
      </PanelHeading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniMetric
          label="Funding pipeline"
          value={formatCurrencyCompact(metrics.pipelineValue)}
          hint={`${metrics.pipelineCount} live opportunities`}
        />
        <MiniMetric label="Applications" value={metrics.inProgressCount} hint="In progress" />
        <MiniMetric label="Active grants" value={metrics.activeGrantsCount} hint="Being delivered" />
        <MiniMetric
          label="Reports due"
          value={metrics.reportsDue}
          hint={`${metrics.outcomesAwaitingEvidence} outcomes awaiting evidence`}
          tone={metrics.reportsDue > 0 ? "warning" : "neutral"}
        />
      </div>
      <div className="mt-4 rounded-lg border border-line bg-paper">
        <div className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">
          Priorities for the week
        </div>
        <ul className="px-4">
          {explorer.command.priorities.map((p) => (
            <li key={p.title} className="border-b border-line py-2.5 last:border-0">
              <div className="text-[0.8125rem] font-medium text-ink">{p.title}</div>
              <div className="text-[0.75rem] text-ink-muted">{p.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FundingPanel({
  explorer,
  funding,
}: {
  explorer: ProductExplorerPreview;
  funding: FundingPreview;
}) {
  return (
    <div>
      <PanelHeading sub="Every opportunity, and what it needs next.">
        Funding pipeline
      </PanelHeading>
      <div className="min-w-[34rem]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {["Opportunity", "Funder", "Stage", "Max award", "Deadline"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-subtle"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {explorer.funding.map((row) => (
              <tr key={row.title} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3 text-[0.8125rem] font-medium text-ink">
                  {row.title}
                </td>
                <td className="py-2.5 pr-3 text-[0.8125rem] text-ink-muted">{row.funder}</td>
                <td className="py-2.5 pr-3">
                  <span className="whitespace-nowrap rounded-full border border-line bg-paper px-2.5 py-0.5 text-[0.65rem] uppercase tracking-[0.06em] text-ink-muted">
                    {humanise(row.stage)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-[0.8125rem] tabular-nums text-ink">
                  {formatCurrency(row.maxAward)}
                </td>
                <td className="py-2.5 text-[0.8125rem] text-ink-muted">
                  {formatDate(row.deadline)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-lg border border-line bg-paper p-4">
        <div className="eyebrow">Fit assessment · {funding.opportunityTitle}</div>
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="font-heading text-[1.75rem] font-semibold leading-none tracking-tight text-ink">
            {funding.fit.overallScore}
          </span>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-success">
            {funding.categoryLabel}
          </span>
        </div>
        <p className="mt-2 text-[0.8125rem] text-ink-muted">
          {funding.fit.recommendedNextAction}
        </p>
      </div>
    </div>
  );
}

function ApplicationPanel({ explorer }: { explorer: ProductExplorerPreview }) {
  const app = explorer.application;
  if (!app) return null;
  return (
    <div>
      <PanelHeading sub={`Status: ${humanise(app.status)}`}>{app.title}</PanelHeading>
      <ul className="flex flex-col gap-2.5">
        {app.answers.map((answer, i) => (
          <li key={i} className="rounded-lg border border-line bg-paper p-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[0.8125rem] font-medium leading-snug text-ink">
                {answer.question}
              </span>
              <span className="flex-shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-0.5 text-[0.65rem] uppercase tracking-[0.06em] text-ink-muted">
                {humanise(answer.status)}
              </span>
            </div>
            <div className="mt-2 text-[0.7rem] text-ink-subtle">
              {answer.words} words
              {answer.wordLimit ? ` of ${answer.wordLimit}` : ""}
            </div>
            {answer.wordLimit ? (
              <div
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
                role="progressbar"
                aria-valuenow={Math.min(100, Math.round((answer.words / answer.wordLimit) * 100))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Words used against the limit for question ${i + 1}`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.min(100, (answer.words / answer.wordLimit) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-subtle">
        Each answer is drafted from approved evidence, and every AI draft records what
        it drew on before a person accepts it.
      </p>
    </div>
  );
}

function RelationshipPanel({ relationship }: { relationship: RelationshipPreview | null }) {
  if (!relationship) return null;
  return (
    <div>
      <PanelHeading sub={relationship.headline}>{relationship.name}</PanelHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        {relationship.sections.slice(0, 4).map((section) => (
          <div key={section.title} className="rounded-lg border border-line bg-paper p-3.5">
            <div className="eyebrow">{section.title}</div>
            <dl className="mt-2 flex flex-col gap-1.5">
              {section.lines.map((line, i) => (
                <div key={i}>
                  <dt className="text-[0.7rem] text-ink-subtle">{line.label}</dt>
                  <dd className="text-[0.8125rem] leading-snug text-ink">{line.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgrammePanel({ explorer }: { explorer: ProductExplorerPreview }) {
  const programme = explorer.programme;
  if (!programme) return null;
  return (
    <div>
      <PanelHeading sub={programme.summary}>{programme.name}</PanelHeading>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniMetric label="Status" value={humanise(programme.status)} />
        <MiniMetric label="Location" value={programme.location} />
        <MiniMetric
          label="Budget"
          value={programme.budget ? formatCurrencyCompact(programme.budget) : "—"}
        />
      </div>
      <div className="mt-4 rounded-lg border border-line bg-paper">
        <div className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">
          Indicators
        </div>
        <ul className="px-4">
          {programme.indicators.map((indicator) => (
            <li
              key={indicator.name}
              className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
            >
              <span className="min-w-0 truncate text-[0.8125rem] text-ink">
                {indicator.name}
              </span>
              <span className="flex-shrink-0 whitespace-nowrap text-[0.8125rem] tabular-nums text-ink-muted">
                {indicator.current} / {indicator.target} {indicator.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ImpactPanel({ explorer }: { explorer: ProductExplorerPreview }) {
  const grant = explorer.grant;
  const programme = explorer.programme;
  return (
    <div>
      <PanelHeading sub="Delivery, spend and reporting against the award.">
        {grant?.title ?? "Grant"}
      </PanelHeading>
      {grant && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniMetric label="Award" value={formatCurrencyCompact(grant.awardValue)} />
            <MiniMetric label="Spent" value={formatCurrencyCompact(grant.spentToDate)} />
            <MiniMetric
              label="Budget used"
              value={`${Math.round(grant.budgetUsedPercent)}%`}
            />
            <MiniMetric
              label="Time elapsed"
              value={`${Math.round(grant.timeElapsedPercent)}%`}
            />
          </div>
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Grant health</span>
              <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[0.65rem] uppercase tracking-[0.06em] text-ink-muted">
                {humanise(grant.healthLabel)}
              </span>
            </div>
            <p className="mt-2 text-[0.8125rem] text-ink-muted">{grant.healthDetail}</p>
            <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
              Funder: {grant.funder} · Ends {formatDate(grant.endDate)}
            </p>
          </div>
        </>
      )}
      {programme && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <div className="eyebrow">Reported through</div>
          <p className="mt-1.5 text-[0.8125rem] text-ink">
            {programme.name} — {programme.indicators.length} indicators, each with an
            owner, a measurement frequency and a source.
          </p>
        </div>
      )}
    </div>
  );
}
