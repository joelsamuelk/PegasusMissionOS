import { Activity } from "lucide-react";
import type { GrantHealthResult } from "@/lib/logic/grant-health";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { ProgressMeter } from "@/components/shared/misc";
import { Card } from "@/components/shared/ui";

/**
 * Grant health summary. The state is derived (not stored) from deadlines,
 * deliverables, spend and evidence, and the reasons are shown transparently.
 */
export function GrantHealthSummary({ health }: { health: GrantHealthResult }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-ink-subtle" />
          <h2 className="text-title font-semibold text-ink">Grant health</h2>
        </div>
        <EntityStatusBadge status={health.state} />
      </div>
      <div className="p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <ProgressMeter
            label="Budget used"
            value={health.budgetUsedPercent}
            tone={health.budgetUsedPercent > health.timeElapsedPercent + 25 ? "warning" : "accent"}
          />
          <ProgressMeter label="Time elapsed" value={health.timeElapsedPercent} tone="accent" />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <div className="eyebrow mb-2">Why this status</div>
          <ul className="flex flex-col gap-1.5">
            {health.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-muted">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-ink-subtle" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-subtle">
            Health is calculated from deliverables, spend against the timeline, reporting
            deadlines and linked evidence. It updates as those change.
          </p>
        </div>
      </div>
    </Card>
  );
}
