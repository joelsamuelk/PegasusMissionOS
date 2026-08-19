import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { rankedAccounts } from "@/lib/commercial/demo-data";
export default async function AccountBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    a = rankedAccounts.find((x) => x.id === id);
  if (!a) notFound();
  const studio = a.motion === "studio";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account brief · Research snapshot</p>
          <h1 className="mt-2 text-3xl font-semibold">{a.name}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {a.sector} · {a.location} · Last researched 19 August 2026
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border bg-surface px-4 py-2 text-sm font-bold">
          <RefreshCw className="h-4 w-4" />
          Refresh research
        </button>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <main className="space-y-5">
          <section className="surface-card p-5">
            <div className="flex justify-between">
              <div>
                <p className="eyebrow">Why Pegasus</p>
                <h2 className="mt-2 text-xl font-semibold">
                  Potential relevance, grounded in public evidence
                </h2>
              </div>
              <span className="rounded-full bg-blue-soft px-2 py-1 text-[10px] font-bold text-blue">
                {a.icp}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              {a.angle} This is a hypothesis to test—not a diagnosed organisational
              problem.
            </p>
          </section>
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Why now</p>
                <h2 className="mt-2 text-lg font-semibold">{a.whyNow}</h2>
              </div>
              <span className="rounded-full bg-success-soft px-2 py-1 text-[10px] font-bold text-success">
                CURRENT SIGNAL
              </span>
            </div>
            <div className="mt-4 rounded-lg bg-surface-sunken p-4">
              <div className="flex items-center justify-between">
                <b className="text-sm">Observed fact</b>
                <span className="text-xs text-ink-muted">{a.confidence}% confidence</span>
              </div>
              <p className="mt-2 text-sm">{a.whyNow}</p>
              <a
                href={a.sourceUrl}
                className="mt-3 inline-flex items-center gap-1 text-xs text-blue"
              >
                {a.source}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="mt-3 rounded-lg border border-warning/20 bg-warning-soft p-4">
              <b className="text-sm text-warning">Hypothesis</b>
              <p className="mt-2 text-sm">{a.angle}</p>
            </div>
          </section>
          <section className="surface-card p-5">
            <p className="eyebrow">Evidence and digital maturity</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <b className="text-xs text-success">Observed</b>
                <p className="mt-2 text-sm">
                  Public {a.source.toLowerCase()} and organisation website.
                </p>
              </div>
              <div>
                <b className="text-xs text-warning">Inferred</b>
                <p className="mt-2 text-sm">
                  {studio
                    ? "Growth may increase platform and delivery pressure."
                    : "Programme and reporting coordination may be increasingly complex."}
                </p>
              </div>
              <div>
                <b className="text-xs text-ink-muted">Unknown</b>
                <p className="mt-2 text-sm">
                  Internal systems, budget and decision process.
                </p>
              </div>
            </div>
          </section>
          <section className="surface-card p-5">
            <p className="eyebrow">People and buying committee</p>
            <div className="mt-4 flex items-center justify-between rounded-lg border p-4">
              <div>
                <b>{a.person}</b>
                <p className="text-xs text-ink-muted">
                  {a.role} · Primary suggested contact
                </p>
              </div>
              <span className="text-xs font-bold text-success">Role relevance: high</span>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Economic buyer and additional stakeholders remain unknown. No missing people
              have been fabricated.
            </p>
          </section>
        </main>
        <aside className="space-y-4">
          <div className="rounded-xl bg-navy p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              Scores
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Fit", a.fit],
                ["Intent", a.intent],
                ["Confidence", `${a.confidence}%`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white/10 p-2 text-center">
                  <b className="block text-xl">{v}</b>
                  <span className="text-[10px] text-white/55">{l}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-white/65">
              Ranked from deterministic factors. AI interpretation cannot modify these
              scores.
            </p>
          </div>
          <div className="surface-card p-5">
            <p className="eyebrow">Relevant proof</p>
            <h3 className="mt-2 font-semibold">
              {studio
                ? a.icp === "AI Transformation"
                  ? "AI that understands the work around it"
                  : "Platform Transformation"
                : "Mission OS · Evidence and reporting"}
            </h3>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Matched deterministically to the observed signal and ICP.
            </p>
          </div>
          <div className="surface-card p-5">
            <p className="eyebrow">Unknowns and risks</p>
            <ul className="mt-3 space-y-2">
              {a.unknowns.map((x) => (
                <li className="text-sm" key={x}>
                  ? &nbsp;{x}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-success">
              <ShieldCheck className="h-4 w-4" />
              No unsupported claim promoted
            </p>
          </div>
          <div className="surface-card p-5">
            <p className="text-xs text-ink-muted">Previous interaction</p>
            <p className="mt-1 text-sm font-bold">{a.lastInteraction}</p>
            <p className="mt-4 text-xs text-ink-muted">Recommended next action</p>
            <p className="mt-1 text-sm font-bold">{a.nextAction}</p>
            <Link
              href={`/control/outreach?account=${a.id}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white"
            >
              Open workbench <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
