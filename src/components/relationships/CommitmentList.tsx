"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, RefreshCw } from "lucide-react";
import type { Commitment } from "@/types/domain";
import { commitmentState } from "@/lib/logic/relationship-health";
import { formatDate } from "@/lib/formatting";
import { setCommitmentStatus } from "@/server/actions/relationships";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

const DIRECTION = {
  we_owe: { label: "We owe", icon: ArrowUpRight },
  they_owe: { label: "They owe", icon: ArrowDownLeft },
  mutual: { label: "Mutual", icon: RefreshCw },
} as const;

/**
 * Open commitments in both directions.
 *
 * Direction is shown explicitly because "who owes whom" is the question people
 * actually get wrong, and an overdue state is derived from the due date rather
 * than read from a stored flag that would need a nightly job to stay true.
 */
export function CommitmentList({
  commitments,
  now,
  emptyMessage = "Nothing outstanding in either direction.",
}: {
  commitments: Commitment[];
  /** ISO instant. Passed from the server so client and server agree on "now". */
  now: string;
  emptyMessage?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nowDate = new Date(now);

  if (commitments.length === 0) {
    return <p className="px-5 py-4 text-sm text-ink-subtle">{emptyMessage}</p>;
  }

  return (
    <div>
      {error && (
        <p role="alert" className="border-b border-line px-5 py-2 text-xs text-critical">
          {error}
        </p>
      )}
      <ul className={cn("divide-y divide-line", pending && "opacity-70")}>
        {commitments.map((commitment) => {
          const state = commitmentState(commitment, nowDate);
          const meta = DIRECTION[commitment.direction];
          const Icon = meta.icon;
          const done = state === "completed";

          return (
            <li key={commitment.id} className="flex items-start gap-3 px-5 py-3">
              <button
                type="button"
                disabled={pending || done}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const result = await setCommitmentStatus(commitment.id, "completed");
                    if (!result.ok) setError(result.message ?? "That could not be saved.");
                  })
                }
                aria-label={`Mark "${commitment.title}" as completed`}
                className={cn(
                  "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  done
                    ? "border-success bg-success text-white"
                    : "border-line-strong hover:border-ink disabled:opacity-50",
                )}
              >
                {done && <Check className="h-3 w-3" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className={cn("text-sm text-ink", done && "text-ink-subtle line-through")}>
                  {commitment.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                  <span className="inline-flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {commitment.dueAt && <span>Due {formatDate(commitment.dueAt)}</span>}
                  {commitment.relatedEntity?.label && (
                    <span className="truncate">{commitment.relatedEntity.label}</span>
                  )}
                </div>
              </div>

              {state === "overdue" && <StatusBadge tone="critical" label="Overdue" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
