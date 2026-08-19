import Link from "next/link";
import { FileUp, Plus, Search, ShieldCheck } from "lucide-react";
import { rankedAccounts } from "@/lib/commercial/demo-data";
import { pilotJobs, PILOT_LIMITS } from "@/lib/commercial/pilot";
export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Prospect discovery</p>
        <h1 className="mt-2 text-3xl font-semibold">Find accounts worth researching</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Discovery creates candidates, not outreach permission. Every account must pass
          evidence and relevance review.
        </p>
      </header>
      <div className="rounded-xl border border-warning/20 bg-warning-soft p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-warning px-2 py-1 text-[10px] font-bold uppercase text-white">
            Pilot discovery
          </span>
          <b className="text-sm">Calibrating against founder judgement</b>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Maximum {PILOT_LIMITS.maxCandidatesPerRun} candidates per run and{" "}
          {PILOT_LIMITS.maxRecommendations} recommendations. Scheduling remains off until
          configured.
        </p>
      </div>
      {pilotJobs.map((job) => (
        <section key={job.id} className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Pilot discovery job</p>
              <h2 className="mt-1 font-semibold">{job.name}</h2>
              <p className="mt-1 text-xs text-ink-muted">{job.criteria}</p>
            </div>
            <button className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
              Run now
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-muted">Provider</p>
              <b className="text-sm">{job.providers.join(" · ")}</b>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Last run</p>
              <b className="text-sm">Not run</b>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Found</p>
              <b className="text-sm">0 organisations</b>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Qualified</p>
              <b className="text-sm">0 for review</b>
            </div>
          </div>
        </section>
      ))}
      <section className="grid gap-3 md:grid-cols-3">
        <button className="surface-card flex items-center gap-3 p-4 text-left">
          <Plus className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Add manually</b>
            <span className="text-xs text-ink-muted">Best for one known account</span>
          </span>
        </button>
        <button className="surface-card flex items-center gap-3 p-4 text-left">
          <FileUp className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Import CSV</b>
            <span className="text-xs text-ink-muted">Preview and deduplicate first</span>
          </span>
        </button>
        <button className="surface-card flex items-center gap-3 p-4 text-left">
          <Search className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Research provider</b>
            <span className="text-xs text-ink-muted">
              Live when provider health passes
            </span>
          </span>
        </button>
      </section>
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-semibold">Discovery candidates</h2>
            <p className="text-xs text-ink-muted">7 found · 4 shown · sources retained</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" />
            No contact action yet
          </div>
        </div>
        {rankedAccounts.map((a) => (
          <div
            key={a.id}
            className="grid gap-4 border-b p-5 last:border-0 lg:grid-cols-[1fr_150px_1.4fr_auto]"
          >
            <div>
              <b>{a.name}</b>
              <p className="text-xs text-ink-muted">
                {a.sector} · {a.location}
              </p>
            </div>
            <div>
              <span className="rounded-full bg-blue-soft px-2 py-1 text-[10px] font-bold text-blue">
                {a.icp}
              </span>
              <p className="mt-2 text-xs">
                Estimated fit <b>{a.fit}</b>
              </p>
            </div>
            <div>
              <p className="text-sm">{a.whyNow}</p>
              <p className="mt-1 text-xs text-ink-muted">Source: {a.source}</p>
            </div>
            <Link
              className="self-center rounded-lg border px-3 py-2 text-xs font-bold"
              href={`/control/outreach?account=${a.id}`}
            >
              Review
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
