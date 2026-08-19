import { ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { FoundationNotice } from "@/components/control-plane/ControlPlaneShell";

const indicators = [
  ["Active organisations", "Not connected", "Awaiting usage adapter"],
  ["Organisations onboarding", "Not connected", "Planned for CONTROL-6"],
  ["Qualified prospects", "Not connected", "Planned for CONTROL-3"],
  ["Pipeline", "Not connected", "Planned for CONTROL-3"],
  ["Upcoming conversations", "Not connected", "Awaiting interaction data"],
];

export default function ControlCommandCentrePage() {
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Wednesday, 19 August</p>
          <h1 className="mt-2 text-3xl font-semibold">What needs your attention today?</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            One operational view across prospect, customer, product and system lifecycles.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted">
          CONTROL-1 foundation
        </span>
      </div>

      <FoundationNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {indicators.map(([label, value, note]) => (
          <div key={label} className="surface-card p-4">
            <div className="text-xs font-semibold text-ink-muted">{label}</div>
            <div className="mt-3 text-2xl font-semibold">{value}</div>
            <div className="mt-1 text-xs text-ink-subtle">{note}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2 className="mt-1 text-lg font-semibold">Deterministic attention queue</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-success" />
          </div>
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">No live rules are connected yet</p>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
              Attention items will include a severity, reason, related entity, recommended action and source signals. Empty is safer than invented operational status.
            </p>
          </div>
        </section>

        <section className="surface-card p-5">
          <p className="eyebrow">Foundation status</p>
          <div className="mt-4 space-y-4">
            {[
              ["Separate internal roles", "Implemented"],
              ["Capability checks", "Implemented"],
              ["Audit contracts", "Implemented"],
              ["Internal auth adapter", "Next"],
              ["Control repository", "Next"],
            ].map(([label, state]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <span className="text-xs font-semibold text-ink-muted">{state}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-muted">
            <Clock3 className="h-4 w-4" />
            Consequential actions remain unavailable
            <ArrowRight className="ml-auto h-4 w-4" />
          </div>
        </section>
      </div>
    </div>
  );
}
