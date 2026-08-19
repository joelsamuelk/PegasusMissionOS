import { Minus, TrendingDown, TrendingUp, UserCheck } from "lucide-react";
import type { RelationshipHealth } from "@/lib/logic/relationship-health";
import { Card, CardBody } from "@/components/shared/ui";
import { RelationshipHealthBadge } from "./RelationshipBadges";
import { cn } from "@/lib/utils";

const EFFECT = {
  positive: { icon: TrendingUp, className: "text-success" },
  negative: { icon: TrendingDown, className: "text-warning" },
  neutral: { icon: Minus, className: "text-ink-subtle" },
} as const;

/**
 * Why the relationship is in the state it is in.
 *
 * The state alone would be a mystery score. Every signal that fed the rule is
 * listed with its direction, so a user can disagree with the conclusion on the
 * evidence rather than on faith — and override it if they know better.
 */
export function RelationshipHealthPanel({ health }: { health: RelationshipHealth }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-title font-semibold text-ink">Relationship health</h2>
        <RelationshipHealthBadge state={health.state} />
      </div>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{health.reason}</p>

        {health.overridden && (
          <p className="flex items-start gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
            <UserCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            A team member set this state manually. The signals below are still the ones
            Pegasus computed.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {health.signals.map((signal) => {
            const effect = EFFECT[signal.effect];
            const Icon = effect.icon;
            return (
              <li key={signal.key} className="flex items-start gap-2.5 text-sm">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", effect.className)} />
                <span className="min-w-0">
                  <span className="text-ink-subtle">{signal.label}: </span>
                  <span className="text-ink">{signal.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-ink-subtle">
          Computed from recorded interactions, funding and commitments. No score is inferred
          about the people involved.
        </p>
      </CardBody>
    </Card>
  );
}
