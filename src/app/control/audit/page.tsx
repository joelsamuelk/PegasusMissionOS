import { requireControlCapability } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";

export default async function ControlAuditPage() {
  const ctx = await resolveControlRequestContext();
  requireControlCapability(ctx.role, "audit:view");
  const events = await (await getControlRepository()).audit.list(ctx);
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Operate</p><h1 className="mt-2 text-3xl font-semibold">Internal audit</h1><p className="mt-2 text-sm text-ink-muted">Append-only records of consequential Control Plane actions.</p></div>
      <div className="surface-card overflow-hidden">
        {events.length === 0 ? <p className="p-8 text-center text-sm text-ink-muted">No internal audit events recorded yet.</p> : (
          <ul>{events.map((event) => <li key={event.id} className="grid gap-2 border-b border-line p-4 text-sm last:border-0 sm:grid-cols-[180px_1fr_1fr]">
            <time className="text-ink-muted">{new Date(event.occurredAt).toLocaleString("en-GB")}</time>
            <div><div className="font-semibold">{event.action}</div><div className="text-xs text-ink-muted">{event.targetType}: {event.targetId}</div></div>
            <div><div>{event.reason ?? "No reason required"}</div><div className="text-xs text-ink-subtle">Request {event.requestId}</div></div>
          </li>)}</ul>
        )}
      </div>
    </div>
  );
}
