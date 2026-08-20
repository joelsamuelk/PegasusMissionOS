import type { RequestContext } from "@/server/context/request-context";
import type { Query } from "./query";

/**
 * The workspace activity feed writer.
 *
 * `actor_name` is stored rather than joined for the same reason the audit
 * trail stores it: the feed is a record of what happened at the time, and it
 * should still read correctly after the actor is renamed or leaves.
 */
export function createActivityRecorder(q: Query) {
  return async function recordActivity(
    ctx: RequestContext,
    verb: string,
    target: string,
  ): Promise<void> {
    const { data } = await q.raw.from("users").select("name").eq("id", ctx.userId).maybeSingle();
    await q.insert(
      ctx,
      "activity_events",
      {
        actorId: ctx.userId,
        actorName: (data?.name as string | undefined) ?? "Unknown actor",
        verb,
        target,
        createdAt: ctx.now().toISOString(),
      },
      { audit: false },
    );
  };
}
