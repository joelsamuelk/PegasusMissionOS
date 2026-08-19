/**
 * The demonstration view of Today.
 *
 * Rendered only when `ctx.demoMode` is true. Every figure below is invented,
 * which is why it lives here rather than in the page: the page decides who may
 * see it, and this file never decides anything.
 */
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { rankedAccounts } from "@/lib/commercial/demo-data";
import { PilotDisposition } from "@/components/control-plane/PilotDisposition";
const label = {
  new: "New",
  changed: "Changed",
  follow_up: "Follow-up",
  opportunity: "Opportunity",
};
export function DemoToday() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-warning-soft px-2 py-1 text-[10px] font-bold uppercase text-warning">
              Pilot discovery
            </span>
            <p className="eyebrow">Monday focus</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">
            Who deserves your attention today?
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            23 organisations found · 8 assessable · 4 worth review · 2 with strong timing
            signals.
          </p>
        </div>
        <Link
          href="/control/prospects/discover"
          className="rounded-lg border bg-surface px-4 py-2 text-sm font-bold"
        >
          Manage discovery
        </Link>
      </header>
      <div className="flex flex-wrap gap-2">
        {["All 4", "New 2", "Changed 1", "Follow-up 1", "Opportunity 0"].map((x, i) => (
          <button
            key={x}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${i === 0 ? "bg-navy text-white" : "border bg-surface"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <section className="space-y-4">
        {rankedAccounts.map((a, index) => (
          <article key={a.id} className="surface-card overflow-hidden">
            <div className="grid lg:grid-cols-[68px_1.2fr_.8fr_auto]">
              <div className="flex items-center justify-center bg-surface-sunken p-4">
                <span className="text-2xl font-semibold">{index + 1}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.recommendationType === "changed" ? "bg-warning-soft text-warning" : a.recommendationType === "follow_up" ? "bg-blue-soft text-blue" : "bg-success-soft text-success"}`}
                  >
                    {label[a.recommendationType ?? "new"]}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-ink-subtle">
                    {a.motion === "studio" ? "Built With Pegasus" : "Built By Pegasus"}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-semibold">{a.name}</h2>
                <p className="text-xs text-ink-muted">
                  {a.icp} · {a.sector} · {a.location}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-ink-subtle">
                      Why them
                    </p>
                    <p className="mt-1 text-sm">
                      Strong {a.icp} alignment with relevant organisational maturity.
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-ink-subtle">
                      Why now
                    </p>
                    <p className="mt-1 text-sm">{a.whyNow}</p>
                  </div>
                </div>
              </div>
              <div className="border-l p-5">
                <p className="text-[10px] font-bold uppercase text-ink-subtle">
                  Why #{index + 1}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <p className="flex gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    Strong ICP match
                  </p>
                  <p className="flex gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    Recent relevant signal
                  </p>
                  <p className="flex gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    Relevant buyer identified
                  </p>
                  <p className="flex gap-2 text-ink-muted">
                    <Minus className="h-3.5 w-3.5" />
                    {a.unknowns[0]}
                  </p>
                </div>
                <div className="mt-4 flex gap-3 text-xs font-bold">
                  <span>Fit {a.fit}</span>
                  <span>Intent {a.intent}</span>
                  <span>{a.confidence}% conf.</span>
                </div>
              </div>
              <div className="flex min-w-44 flex-col justify-center gap-2 p-5">
                <p className="text-xs text-ink-muted">Contact</p>
                <p className="text-sm font-bold">{a.person}</p>
                <p className="text-xs text-ink-muted">{a.role}</p>
                <Link
                  href={`/control/prospects/${a.id}/brief`}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-xs font-bold text-white"
                >
                  Review account <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <PilotDisposition accountId={a.id} />
          </article>
        ))}
      </section>
    </div>
  );
}
