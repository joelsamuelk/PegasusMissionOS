"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import type { Indicator } from "@/types/domain";
import { indicatorProgress } from "@/lib/logic/progress";
import { updateIndicator } from "@/server/actions/mutations";
import { formatDate } from "@/lib/formatting";
import { Button } from "@/components/shared/ui";
import { ProgressMeter } from "@/components/shared/misc";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE = {
  high: "text-success",
  medium: "text-warning",
  low: "text-critical",
};

/**
 * Outcome indicator with inline update. Editing an indicator records an audit
 * event and updates progress towards target. Confidence is shown so numbers are
 * never presented as more certain than they are.
 */
export function IndicatorEditor({ indicator }: { indicator: Indicator }) {
  const router = useRouter();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(indicator.currentValue));
  const [pending, start] = useTransition();

  const progress = indicatorProgress(indicator);

  function save() {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      notify("Enter a valid number.", "error");
      return;
    }
    start(async () => {
      const result = await updateIndicator(indicator.id, parsed, "Manual update");
      if (!result.ok) {
        notify(result.message ?? "That update was not permitted.", "error");
        return;
      }
      notify(`${indicator.name} updated.`);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{indicator.name}</div>
          <div className="mt-0.5 text-xs text-ink-subtle">{indicator.definition}</div>
        </div>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Update indicator">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 w-24 rounded border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:shadow-focus"
              aria-label={`Current value for ${indicator.name}`}
            />
            <span className="text-xs text-ink-subtle">
              {indicator.unit} (target {indicator.target})
            </span>
            <Button size="sm" variant="primary" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-heading font-semibold text-ink">
              {indicator.currentValue}
              {indicator.unit === "%" ? "%" : ""}
            </span>
            <span className="text-sm text-ink-subtle">
              of {indicator.target}
              {indicator.unit === "%" ? "%" : ` ${indicator.unit}`} target
            </span>
          </div>
        )}
      </div>

      <ProgressMeter
        className="mt-3"
        value={progress}
        tone={progress >= 90 ? "success" : progress >= 50 ? "accent" : "warning"}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
        <span>Frequency: {indicator.measurementFrequency}</span>
        {indicator.evidenceSource && <span>Source: {indicator.evidenceSource}</span>}
        <span>Updated {formatDate(indicator.lastUpdated)}</span>
        <span className={cn("font-medium", CONFIDENCE_TONE[indicator.confidence])}>
          {indicator.confidence} confidence
        </span>
      </div>
    </div>
  );
}
