import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { VerificationState } from "@/types/domain";
import {
  BadgeCheck,
  CircleAlert,
  CircleHelp,
  FileClock,
  Sparkles,
} from "lucide-react";
import { deadlineInfo } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { StatusBadge, type Tone } from "./StatusBadge";

// --- Verification badge -------------------------------------------------

const VERIFICATION_MAP: Record<
  VerificationState,
  { tone: Tone; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  verified: { tone: "success", label: "Verified", icon: BadgeCheck },
  provided: { tone: "info", label: "Provided by organisation", icon: FileClock },
  ai_extracted: { tone: "accent", label: "AI extracted", icon: Sparkles },
  needs_review: { tone: "warning", label: "Needs review", icon: CircleHelp },
  outdated: { tone: "critical", label: "Outdated", icon: CircleAlert },
};

export function VerificationBadge({
  state,
  className,
}: {
  state: VerificationState;
  className?: string;
}) {
  const m = VERIFICATION_MAP[state];
  return <StatusBadge tone={m.tone} label={m.label} icon={m.icon} className={className} />;
}

// --- Deadline indicator -------------------------------------------------

export function DeadlineIndicator({
  deadline,
  className,
  now,
}: {
  deadline?: string | null;
  className?: string;
  now?: Date;
}) {
  const info = deadlineInfo(deadline, now);
  const tone: Tone =
    info.tone === "critical"
      ? "critical"
      : info.tone === "warning"
        ? "warning"
        : info.tone === "info"
          ? "info"
          : "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <Clock3
        className={cn(
          "h-3.5 w-3.5",
          tone === "critical" && "text-critical",
          tone === "warning" && "text-warning",
          tone === "info" && "text-info",
          tone === "neutral" && "text-ink-subtle",
        )}
      />
      <span
        className={cn(
          "font-medium",
          tone === "critical" && "text-critical",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-ink-subtle",
          tone === "info" && "text-ink-muted",
        )}
      >
        {info.label}
      </span>
    </span>
  );
}

// --- Empty state --------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h3 className="text-title font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// --- Metric panel -------------------------------------------------------

export function MetricPanel({
  label,
  value,
  hint,
  tone,
  href,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const body = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-ink-subtle" />}
      </div>
      <div className="mt-4">
        <div className="font-serif text-heading-lg font-medium tracking-tight text-ink">
          {value}
        </div>
        {hint && (
          <div
            className={cn(
              "mt-1 text-xs",
              tone === "critical" && "text-critical",
              tone === "warning" && "text-warning",
              tone === "success" && "text-success",
              (!tone || tone === "neutral" || tone === "info" || tone === "accent") &&
                "text-ink-muted",
            )}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
  const classes =
    "surface-card h-full shadow-elev-1 transition-shadow duration-fast" +
    (href ? " hover:shadow-elev-2" : "");
  return href ? (
    <Link href={href} className={cn(classes, "block")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

// --- Progress meter -----------------------------------------------------

export function ProgressMeter({
  value,
  label,
  tone = "accent",
  className,
}: {
  value: number;
  label?: string;
  tone?: "accent" | "success" | "warning" | "critical";
  className?: string;
}) {
  const barTone =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "critical"
          ? "bg-critical"
          : "bg-accent";
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>{label}</span>
          <span className="font-medium text-ink">{Math.round(value)}%</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-slow ease-calm", barTone)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
