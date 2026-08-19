import Link from "next/link";
import {
  Banknote,
  CalendarCheck,
  FileText,
  Handshake,
  Landmark,
  ListChecks,
  Mail,
  Sparkles,
} from "lucide-react";
import { formatDate } from "@/lib/formatting";
import type { TimelineEvent, TimelineKind } from "@/lib/logic/relationship-timeline";
import { EmptyState } from "@/components/shared/misc";
import { cn } from "@/lib/utils";

const ICONS: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
  interaction: Mail,
  relationship_started: Handshake,
  grant_awarded: Landmark,
  grant_payment: Banknote,
  grant_report: FileText,
  application: FileText,
  impact_report: Sparkles,
  commitment: ListChecks,
  task: CalendarCheck,
};

const TONE_RING: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "border-line text-ink-subtle",
  positive: "border-success/30 bg-success-soft text-success",
  attention: "border-warning/30 bg-warning-soft text-warning",
};

/**
 * The unified relationship timeline.
 *
 * Every row is projected from a Mission Graph record and links back to it.
 * Nothing here is stored twice: a grant payment appears because the payment
 * row exists, and correcting that row corrects this line.
 */
export function RelationshipTimeline({
  events,
  limit,
}: {
  events: TimelineEvent[];
  limit?: number;
}) {
  const shown = limit ? events.slice(0, limit) : events;

  if (shown.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="Nothing recorded yet"
        description="Log a call, meeting or email and it will appear here alongside grants, applications and reports."
        className="m-5"
      />
    );
  }

  return (
    <ol className="relative px-5 py-4">
      {/* The spine. Decorative, so it is hidden from assistive technology. */}
      <span
        aria-hidden
        className="absolute bottom-6 left-[2.0625rem] top-7 w-px bg-line"
      />
      {shown.map((event) => {
        const Icon = ICONS[event.kind];
        const body = (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-ink">{event.title}</span>
              <time className="text-xs text-ink-subtle" dateTime={event.at}>
                {formatDate(event.at.slice(0, 10))}
              </time>
            </div>
            {event.detail && (
              <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{event.detail}</p>
            )}
          </>
        );

        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border bg-surface",
                TONE_RING[event.tone ?? "neutral"],
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              {event.href ? (
                <Link href={event.href} className="block rounded-sm hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
