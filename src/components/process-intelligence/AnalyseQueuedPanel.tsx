import { analyseQueuedProcessesAction } from "@/server/actions/process-intelligence";

/** Batch analysis trigger, shown wherever queued or failed processes are listed. */
export function AnalyseQueuedPanel({
  organisationId,
  pending,
  available,
}: {
  organisationId: string;
  pending: number;
  available: boolean;
}) {
  if (!pending) return null;
  return (
    <section className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <h2 className="font-semibold">
          {pending} {pending === 1 ? "process is" : "processes are"} waiting for analysis
        </h2>
        <p className="text-sm text-ink-muted">
          {available
            ? "Each submission is broken into classified steps and scoped opportunities. Scores and hours are computed from participant estimates, not generated."
            : "Analysis is not configured. Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY."}
        </p>
      </div>
      {available ? (
        <form action={analyseQueuedProcessesAction}>
          <input type="hidden" name="organisationId" value={organisationId} />
          <button className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white">
            Analyse {pending} {pending === 1 ? "process" : "processes"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
