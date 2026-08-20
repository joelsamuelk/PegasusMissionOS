"use client";

/**
 * The control surface's error boundary.
 *
 * Without one, an uncaught server action error renders nothing at all: the
 * browser stays exactly where it was and the operator concludes the button is
 * dead. Every action here mutates real commercial data, so a failure that looks
 * like a no-op is the worst outcome available — it invites a second click.
 */
export default function ControlError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="surface-card mx-auto max-w-xl p-8">
      <p className="eyebrow">Pegasus Control Plane</p>
      <h1 className="mt-3 text-2xl font-semibold">That action did not complete</h1>
      <p className="mt-3 text-sm text-ink-muted">
        Nothing was recorded. Try again, and if it keeps failing, quote the reference
        below. The server log entry carries the same one.
      </p>
      {error.digest && (
        <p className="mt-3 rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs">
          {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-5 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
      >
        Try again
      </button>
    </section>
  );
}
