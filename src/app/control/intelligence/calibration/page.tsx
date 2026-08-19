import { AlertTriangle, ArrowRight, Beaker, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
const icps = [
  ["Mission OS", 12, 4, 4, 2, 2],
  ["AI Transformation", 8, 3, 2, 2, 1],
  ["Product Build", 5, 1, 2, 1, 1],
];
const signals = [
  ["Programme expansion", 8, 4, 3, 1, "88%"],
  ["New CTO", 7, 3, 2, 2, "71%"],
  ["Impact report", 6, 1, 2, 3, "50%"],
  ["AI initiative", 5, 2, 2, 1, "80%"],
];
export default function CalibrationPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-warning-soft px-2 py-1 text-[10px] font-bold uppercase text-warning">
              Pilot discovery
            </span>
            <p className="eyebrow">Founder calibration</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">
            Are these recommendations useful?
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Early observations only. The system never changes scoring from this feedback
            automatically.
          </p>
        </div>
        <Link
          href="/control/today"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
        >
          Review recommendations
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["Founder acceptance", "64%", "N = 22", Target],
            ["Immediate outreach", "36%", "N = 22", ArrowRight],
            ["Need more research", "15%", "N = 26", Beaker],
            ["Rejection rate", "36%", "N = 22", AlertTriangle],
          ] as [string, string, string, LucideIcon][]
        ).map(([l, v, n, Icon]) => (
          <div key={l} className="surface-card p-5">
            <Icon className="h-4 w-4 text-blue" />
            <p className="mt-4 text-xs text-ink-muted">{l}</p>
            <p className="mt-1 text-3xl font-semibold">{v}</p>
            <p className="text-xs text-ink-subtle">{n}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="surface-card overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-semibold">Acceptance by ICP</h2>
            <p className="text-xs text-ink-muted">
              Recommendations and completed founder dispositions
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <th className="p-3">ICP</th>
                <th>Rec.</th>
                <th>Now</th>
                <th>Nurture</th>
                <th>Reject</th>
                <th>Research</th>
              </tr>
            </thead>
            <tbody>
              {icps.map((r) => (
                <tr className="border-t" key={r[0]}>
                  {r.map((x, i) => (
                    <td className={i === 0 ? "p-3 font-bold" : ""} key={i}>
                      {x}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="surface-card overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-semibold">Acceptance by signal</h2>
            <p className="text-xs text-ink-muted">
              Small samples: descriptive, not statistically significant
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <th className="p-3">Signal</th>
                <th>Reviewed</th>
                <th>Now</th>
                <th>Nurture</th>
                <th>Reject</th>
                <th>Accepted</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((r) => (
                <tr className="border-t" key={r[0]}>
                  {r.map((x, i) => (
                    <td className={i === 0 ? "p-3 font-bold" : ""} key={i}>
                      {x}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="surface-card p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="font-semibold">High-ranked rejects</h2>
          </div>
          <div className="mt-4 rounded-lg bg-surface-sunken p-4">
            <div className="flex justify-between">
              <b className="text-sm">Civic Impact Alliance</b>
              <span className="text-xs font-bold">Rank #3 · Fit 87</span>
            </div>
            <div className="mt-3 grid gap-4 text-xs md:grid-cols-2">
              <div>
                <p className="font-bold text-ink-muted">System reasoning</p>
                <p className="mt-1">
                  Mission OS match · impact report · multiple programmes
                </p>
              </div>
              <div>
                <p className="font-bold text-critical">Founder: Reject</p>
                <p className="mt-1">
                  No credible problem: publishing reports does not establish operational
                  pain.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-xl bg-navy p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">
            Suggested calibration
          </p>
          <p className="mt-3 text-sm leading-6">
            Impact-report publication alone appears to have weak founder acceptance across
            the current six-account sample.
          </p>
          <p className="mt-3 text-xs text-white/60">
            Proposed only · confidence 46% · N = 6
          </p>
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-navy">
              Review proposal
            </button>
            <button className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold">
              Reject
            </button>
          </div>
        </section>
      </div>
      <section className="surface-card p-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-semibold">Discovery misses</h2>
            <p className="text-xs text-ink-muted">
              Capture organisations Pegasus should have found to evaluate recall.
            </p>
          </div>
          <span className="text-xs text-ink-muted">2 recorded</span>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            className="rounded-lg border bg-surface px-3 py-2 text-sm"
            placeholder="Organisation"
          />
          <select className="rounded-lg border bg-surface px-3 py-2 text-sm">
            <option>Mission OS</option>
            <option>Studio</option>
          </select>
          <input
            className="rounded-lg border bg-surface px-3 py-2 text-sm"
            placeholder="ICP"
          />
          <input
            className="rounded-lg border bg-surface px-3 py-2 text-sm"
            placeholder="Why it matters"
          />
          <button className="rounded-lg border px-3 py-2 text-sm font-bold">
            Record miss
          </button>
        </form>
      </section>
    </div>
  );
}
