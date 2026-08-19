import {
  AlertTriangle,
  CircleDashed,
  Handshake,
  Moon,
  Sprout,
} from "lucide-react";
import type { RelationshipHealthState, RelationshipRole } from "@/types/domain";
import { HEALTH_LABELS } from "@/lib/logic/relationship-health";
import { roleFamily, roleLabel, sortRoles } from "@/lib/logic/relationship-roles";
import { StatusBadge, type Tone } from "@/components/shared/StatusBadge";
import { Pill } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

/**
 * Relationship health, shown the way the rest of the product shows a computed
 * state: icon plus text plus colour, never colour alone, and never a number
 * without the reason beside it.
 */
const HEALTH_MAP: Record<
  RelationshipHealthState,
  { tone: Tone; icon: React.ComponentType<{ className?: string }> }
> = {
  active: { tone: "success", icon: Handshake },
  established: { tone: "info", icon: Handshake },
  developing: { tone: "accent", icon: Sprout },
  dormant: { tone: "neutral", icon: Moon },
  needs_attention: { tone: "warning", icon: AlertTriangle },
};

export function RelationshipHealthBadge({
  state,
  className,
}: {
  state: RelationshipHealthState;
  className?: string;
}) {
  const map = HEALTH_MAP[state];
  return (
    <StatusBadge
      tone={map.tone}
      label={HEALTH_LABELS[state]}
      icon={map.icon}
      className={className}
    />
  );
}

const FAMILY_CLASSES: Record<string, string> = {
  funding: "border-info/30 bg-info-soft text-info",
  fundraising: "border-accent/30 bg-accent-soft text-accent-ink",
  delivery: "border-success/25 bg-success-soft text-success",
  knowledge: "border-line-strong bg-surface-sunken text-ink-muted",
  governance: "border-line-strong bg-surface-sunken text-ink-muted",
  supply: "border-line bg-surface text-ink-muted",
  community: "border-line bg-surface text-ink-muted",
  custom: "border-line bg-surface text-ink-muted",
};

/**
 * Roles, not a type. A relationship carries every role it plays at once, which
 * is the whole reason this layer exists rather than five contact tables.
 */
export function RoleChips({
  roles,
  className,
  limit,
}: {
  roles: RelationshipRole[];
  className?: string;
  limit?: number;
}) {
  if (roles.length === 0) {
    return <span className="text-xs text-ink-subtle">No role recorded</span>;
  }
  const ordered = sortRoles(roles);
  const shown = limit ? ordered.slice(0, limit) : ordered;
  const hidden = ordered.length - shown.length;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((role) => (
        <Pill key={role} className={cn("py-0.5 text-[0.6875rem]", FAMILY_CLASSES[roleFamily(role)])}>
          {roleLabel(role)}
        </Pill>
      ))}
      {hidden > 0 && (
        <span className="text-[0.6875rem] text-ink-subtle">+{hidden} more</span>
      )}
    </span>
  );
}

export function RelationshipStatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "active" ? "success" : status === "prospect" ? "info" : "neutral";
  return (
    <StatusBadge
      tone={tone}
      label={status.replace(/^\w/, (c) => c.toUpperCase())}
      icon={CircleDashed}
    />
  );
}
