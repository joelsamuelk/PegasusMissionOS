import { AlertTriangle, CheckCircle2, Copy, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { providerHealth } from "@/server/commercial/live-providers";
const review = [
  {
    name: "Northstar Youth Trust",
    claim: "The organisation expanded from four to seven programmes.",
    source: "2026–29 strategy · official document",
    confidence: 88,
    type: "Needs review",
  },
  {
    name: "Relay Health",
    claim: "A clinical-operations AI programme was announced in August.",
    source: "Official newsroom",
    confidence: 81,
    type: "Needs review",
  },
];
export default async function ResearchReviewPage() {
  const [brave, companies, charity] = await Promise.all([
    providerHealth("brave"),
    providerHealth("companies_house"),
    providerHealth("charity_commission"),
  ]);
  const badge = (state: string) =>
    state === "connected"
      ? "bg-success-soft text-success"
      : state === "configured_unhealthy"
        ? "bg-critical-soft text-critical"
        : "bg-surface-sunken text-ink-muted";
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Research operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Research review</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Approve important claims, resolve conflicts and see failures before they
          influence outreach.
        </p>
      </header>
      <section className="grid gap-3 md:grid-cols-3">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <b className="text-sm">Brave public-web search</b>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${badge(brave.state)}`}
            >
              {brave.state.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{brave.detail}</p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <b className="text-sm">Companies House</b>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${badge(companies.state)}`}
            >
              {companies.state.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{companies.detail}</p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <b className="text-sm">Charity Commission</b>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${badge(charity.state)}`}
            >
              {charity.state.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{charity.detail}</p>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-5">
        {(
          [
            ["Needs review", "2", ShieldAlert],
            ["Conflicts", "1", Copy],
            ["Low confidence", "3", AlertTriangle],
            ["Duplicates", "1", Copy],
            ["Failures", "0", CheckCircle2],
          ] as [string, string, LucideIcon][]
        ).map(([l, v, Icon]) => (
          <div key={l} className="surface-card p-4">
            <Icon className="h-4 w-4 text-ink-subtle" />
            <p className="mt-3 text-2xl font-semibold">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </div>
        ))}
      </div>
      <section className="surface-card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Needs review</h2>
          <p className="text-xs text-ink-muted">
            Bulk approval is intentionally unavailable for material commercial claims.
          </p>
        </div>
        {review.map((item) => (
          <article
            key={item.name}
            className="grid gap-4 border-b p-5 last:border-0 lg:grid-cols-[1fr_1.5fr_auto]"
          >
            <div>
              <b>{item.name}</b>
              <p className="text-xs text-ink-muted">{item.type}</p>
            </div>
            <div>
              <p className="text-sm">{item.claim}</p>
              <p className="mt-2 text-xs text-blue">
                {item.source} · {item.confidence}% extraction confidence
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border px-3 py-2 text-xs font-bold">
                Reject
              </button>
              <button className="rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white">
                Approve fact
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="surface-card p-5">
        <h2 className="font-semibold">Recent research telemetry</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-6">
          {[
            ["Pages attempted", "5"],
            ["Successful", "4"],
            ["Claims", "7"],
            ["Signals", "2"],
            ["Cache hits", "1"],
            ["Duration", "3.2s"],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-xs text-ink-muted">{l}</p>
              <b>{v}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
