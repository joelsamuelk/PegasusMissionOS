import type { ActivityEvent } from "@/types/domain";
import { timeAgo } from "@/lib/formatting";

export function ActivityFeed({
  events,
  now,
  limit = 8,
}: {
  events: ActivityEvent[];
  now?: Date;
  limit?: number;
}) {
  const shown = events.slice(0, limit);
  if (shown.length === 0) {
    return <p className="text-sm text-ink-subtle">No recent activity.</p>;
  }
  return (
    <ul className="flex flex-col">
      {shown.map((e) => (
        <li key={e.id} className="flex gap-3 border-b border-line py-3 last:border-0">
          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[0.65rem] font-medium text-ink-muted">
            {e.actorName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              <span className="font-medium">{e.actorName}</span>{" "}
              <span className="text-ink-muted">{e.verb}</span> {e.target}
            </p>
            <p className="text-xs text-ink-subtle">{timeAgo(e.createdAt, now)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
