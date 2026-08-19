import { Check, SlidersHorizontal } from "lucide-react";
import { icpProfiles } from "@/lib/commercial/demo-data";
export default function ICPPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="eyebrow">Targeting model</p>
          <h1 className="mt-2 text-3xl font-semibold">Ideal customer profiles</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Two commercial motions, with separate targeting logic. Weights are
            deterministic, explainable and changed only with human approval.
          </p>
        </div>
        <button className="rounded-lg border bg-surface px-4 py-2 text-sm font-semibold">
          New profile
        </button>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {icpProfiles.map((icp) => (
          <article className="surface-card p-5" key={icp.id}>
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${icp.commercialMotion === "studio" ? "bg-blue-soft text-blue" : "bg-success-soft text-success"}`}
                >
                  {icp.commercialMotion === "studio"
                    ? "Built With Pegasus"
                    : "Built By Pegasus"}
                </span>
                <h2 className="mt-3 text-lg font-semibold">{icp.name}</h2>
              </div>
              <SlidersHorizontal className="h-4 w-4 text-ink-subtle" />
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{icp.description}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-ink-muted">Positive signals</p>
                {icp.positiveSignals.slice(0, 3).map((x) => (
                  <p className="mt-2 flex gap-2 text-xs" key={x}>
                    <Check className="h-3.5 w-3.5 text-success" />
                    {x}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-ink-muted">Buyer personas</p>
                <p className="mt-2 text-xs leading-5">{icp.buyerPersonas.join(" · ")}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-1">
              {Object.entries(icp.weights).map(([k, v]) => (
                <div
                  title={`${k}: ${v}`}
                  key={k}
                  style={{ width: `${v}%` }}
                  className="h-1.5 rounded-full bg-blue"
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-ink-subtle">
              Fit 30 · Problem 20 · Timing 20 · Access 10 · Difference 10 · Potential 10
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
