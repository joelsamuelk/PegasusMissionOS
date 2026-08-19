import { AlertTriangle } from "lucide-react";
import { exitDemoModeAction, resetDemoDataAction } from "@/server/actions/control-demo";

/**
 * The banner that makes a demonstration impossible to mistake for real data.
 *
 * It renders above every Control Plane page while demonstration mode is on,
 * and carries the exit. The visual weight is deliberate: the whole safety of
 * demonstrating from a real operator's own account rests on nobody ever
 * reading an invented pipeline figure as their own.
 */
export function DemoModeBanner() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border-2 border-warning bg-warning-soft p-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Demonstration mode</p>
        <p className="text-xs text-ink-muted">
          Everything shown is example data, and every change is written to a throwaway
          sandbox. Your real records are untouched. Ends when you close the browser.
        </p>
      </div>
      <form action={resetDemoDataAction}>
        <button className="rounded-lg border border-warning px-3 py-2 text-xs font-bold">
          Reset demo data
        </button>
      </form>
      <form action={exitDemoModeAction}>
        <button className="rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white">
          Exit demonstration
        </button>
      </form>
    </div>
  );
}
