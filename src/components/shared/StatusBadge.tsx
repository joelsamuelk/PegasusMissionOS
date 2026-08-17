import {
  AlertTriangle,
  Check,
  CircleDashed,
  Clock,
  FileText,
  Loader,
  Minus,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "success" | "warning" | "critical" | "info" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-line",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  critical: "bg-critical-soft text-critical border-critical/25",
  info: "bg-info-soft text-info border-info/25",
  accent: "bg-accent-soft text-accent-ink border-accent/30",
};

/**
 * Semantic status badge. Meaning is carried by an icon and text label as well
 * as colour, so it remains distinguishable without relying on colour alone.
 */
export function StatusBadge({
  tone = "neutral",
  label,
  icon: Icon,
  className,
}: {
  tone?: Tone;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

type Mapping = { tone: Tone; label: string; icon: React.ComponentType<{ className?: string }> };

const STATUS_MAP: Record<string, Mapping> = {
  // Answer statuses
  not_started: { tone: "neutral", label: "Not started", icon: CircleDashed },
  drafting: { tone: "info", label: "Drafting", icon: Loader },
  needs_evidence: { tone: "warning", label: "Needs evidence", icon: AlertTriangle },
  ready_for_review: { tone: "accent", label: "Ready for review", icon: Clock },
  changes_requested: { tone: "warning", label: "Changes requested", icon: AlertTriangle },
  approved: { tone: "success", label: "Approved", icon: Check },
  // Application statuses
  in_progress: { tone: "info", label: "In progress", icon: Loader },
  internal_review: { tone: "accent", label: "Internal review", icon: Clock },
  ready_to_submit: { tone: "accent", label: "Ready to submit", icon: Check },
  submitted: { tone: "info", label: "Submitted", icon: FileText },
  successful: { tone: "success", label: "Successful", icon: Check },
  unsuccessful: { tone: "critical", label: "Unsuccessful", icon: X },
  // Grant health
  on_track: { tone: "success", label: "On track", icon: Check },
  attention: { tone: "warning", label: "Attention required", icon: AlertTriangle },
  at_risk: { tone: "critical", label: "At risk", icon: AlertTriangle },
  completed: { tone: "neutral", label: "Completed", icon: ShieldCheck },
  // Programme
  active: { tone: "success", label: "Active", icon: Check },
  planning: { tone: "info", label: "Planning", icon: CircleDashed },
  paused: { tone: "warning", label: "Paused", icon: Minus },
  // Report
  draft: { tone: "neutral", label: "Draft", icon: FileText },
  in_review: { tone: "accent", label: "In review", icon: Clock },
};

export function EntityStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const map = STATUS_MAP[status] ?? {
    tone: "neutral" as Tone,
    label: status.replace(/_/g, " "),
    icon: Minus,
  };
  return <StatusBadge tone={map.tone} label={map.label} icon={map.icon} className={className} />;
}
