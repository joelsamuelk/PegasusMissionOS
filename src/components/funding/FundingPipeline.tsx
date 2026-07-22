"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, KanbanSquare, Search, Table2 } from "lucide-react";
import type { FundingOpportunity } from "@/types/domain";
import { formatCurrencyCompact } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator, EmptyState } from "@/components/shared/misc";
import {
  KANBAN_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_TONE,
} from "@/features/funding/constants";

type OppView = FundingOpportunity & { funderName: string; ownerName?: string };

const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export function FundingPipeline({ opportunities }: { opportunities: OppView[] }) {
  const [view, setView] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [savedOnly, setSavedOnly] = useState(false);

  const filtered = useMemo(() => {
    return opportunities.filter((o) => {
      if (savedOnly && !o.saved) return false;
      if (stage !== "all" && o.stage !== stage) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !o.programmeName.toLowerCase().includes(s) &&
          !o.funderName.toLowerCase().includes(s) &&
          !o.priorityThemes.join(" ").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [opportunities, search, stage, savedOnly]);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search funders and themes"
              className="h-9 w-full rounded border border-line-strong bg-surface pl-8 pr-3 text-sm text-ink outline-none focus:shadow-focus"
              aria-label="Search opportunities"
            />
          </div>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-9 rounded border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus:shadow-focus"
            aria-label="Filter by stage"
          >
            <option value="all">All stages</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSavedOnly((v) => !v)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded border px-3 text-sm transition-colors",
              savedOnly
                ? "border-accent bg-accent/10 text-accent"
                : "border-line-strong bg-surface text-ink-muted hover:text-ink",
            )}
          >
            <Bookmark className={cn("h-3.5 w-3.5", savedOnly && "fill-current")} />
            Saved
          </button>
        </div>
        <div className="flex items-center gap-1 rounded border border-line-strong bg-surface p-0.5">
          <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={Table2} label="Table" />
          <ViewToggle active={view === "kanban"} onClick={() => setView("kanban")} icon={KanbanSquare} label="Board" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No opportunities match your filters"
          description="Try clearing the search or stage filter."
          icon={Search}
        />
      ) : view === "table" ? (
        <TableView opportunities={filtered} />
      ) : (
        <KanbanView opportunities={filtered} />
      )}
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded px-3 text-sm transition-colors",
        active ? "bg-ink text-ink-inverse" : "text-ink-muted hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TableView({ opportunities }: { opportunities: OppView[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {["Opportunity", "Funder", "Amount", "Deadline", "Stage", "Fit", "Owner"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-0 hover:bg-surface-sunken/40">
              <td className="px-4 py-3">
                <Link href={`/funding/${o.id}`} className="font-medium text-ink hover:underline">
                  {o.programmeName}
                </Link>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {o.priorityThemes.slice(0, 2).map((t) => (
                    <span key={t} className="text-xs text-ink-subtle">
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-ink-muted">{o.funderName}</td>
              <td className="px-4 py-3 text-ink">
                {o.maxAward ? formatCurrencyCompact(o.maxAward) : "-"}
              </td>
              <td className="px-4 py-3">
                <DeadlineIndicator deadline={o.deadline} now={DEMO_NOW} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={STAGE_TONE[o.stage]} label={STAGE_LABELS[o.stage]} />
              </td>
              <td className="px-4 py-3 text-ink-muted">{o.probability}%</td>
              <td className="px-4 py-3 text-ink-muted">{o.ownerName ?? "Unassigned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({ opportunities }: { opportunities: OppView[] }) {
  const stages = KANBAN_STAGES.filter((s) => opportunities.some((o) => o.stage === s));
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {stages.map((stage) => {
        const items = opportunities.filter((o) => o.stage === stage);
        return (
          <div key={stage} className="w-72 flex-shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium text-ink">{STAGE_LABELS[stage]}</span>
              <span className="text-xs text-ink-subtle">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((o) => (
                <Link
                  key={o.id}
                  href={`/funding/${o.id}`}
                  className="block rounded-md border border-line bg-surface p-3 shadow-elev-1 transition-shadow hover:shadow-elev-2"
                >
                  <div className="text-sm font-medium text-ink">{o.programmeName}</div>
                  <div className="mt-0.5 text-xs text-ink-subtle">{o.funderName}</div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">
                      {o.maxAward ? formatCurrencyCompact(o.maxAward) : ""}
                    </span>
                    <DeadlineIndicator deadline={o.deadline} now={DEMO_NOW} />
                  </div>
                  {o.nextAction && (
                    <div className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
                      {o.nextAction}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
