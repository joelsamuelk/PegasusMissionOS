import { ArrowUpRight, Beaker, CircleAlert } from "lucide-react";
const rows = [
  ["Mission OS", "18", "6", "3", "17%"],
  ["AI Transformation", "12", "5", "2", "17%"],
  ["Product Build", "9", "2", "1", "11%"],
  ["Platform Transformation", "7", "1", "0", "0%"],
];
export default function GrowthIntelligencePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Commercial intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold">
          What is actually generating customers?
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Outcomes connected back to ICP, signal, buyer, message and source—with sample
          sizes visible.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-xs text-ink-muted">Meeting rate</p>
          <p className="mt-2 text-3xl font-semibold">18.4%</p>
          <p className="mt-1 text-xs text-success">↑ 3.1 pts · n=49 outreach</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs text-ink-muted">Median sales cycle</p>
          <p className="mt-2 text-3xl font-semibold">34 days</p>
          <p className="mt-1 text-xs text-ink-muted">Won opportunities · n=6</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs text-ink-muted">Qualified source</p>
          <p className="mt-2 text-3xl font-semibold">Warm intro</p>
          <p className="mt-1 text-xs text-ink-muted">42% reach discovery · n=12</p>
        </div>
      </div>
      <section className="surface-card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">ICP performance</h2>
          <p className="text-xs text-ink-muted">
            Different motions remain separate. Conversion is descriptive, not causal.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-sunken text-xs text-ink-muted">
            <tr>
              <th className="p-4">ICP</th>
              <th>Contacted</th>
              <th>Meetings</th>
              <th>Opportunities</th>
              <th>Opportunity rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t">
                <td className="p-4 font-semibold">{r[0]}</td>
                {r.slice(1).map((x, i) => (
                  <td key={i}>{x}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-blue" />
            <h2 className="font-semibold">Recommended experiment</h2>
          </div>
          <p className="mt-3 text-sm leading-6">
            Outreach anchored in a public strategy change has a higher reply rate (31%,
            n=13) than funding-only outreach (14%, n=14).
          </p>
          <div className="mt-4 rounded-lg bg-blue-soft p-3 text-xs text-blue">
            Recommendation: test the strategy-change angle for 10 more comparable
            accounts. Do not change production weights yet.
          </div>
        </section>
        <section className="surface-card p-5">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-warning" />
            <h2 className="font-semibold">Where deals stall</h2>
          </div>
          {[
            ["Discovery → Opportunity", "3 stalled", "No economic buyer identified"],
            ["Proposal → Decision", "2 stalled", "Decision process unknown"],
          ].map(([a, b, c]) => (
            <div className="mt-4 flex items-center justify-between border-b pb-4 last:border-0">
              <div>
                <b className="text-sm">{a}</b>
                <p className="text-xs text-ink-muted">{c}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold">
                {b}
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
