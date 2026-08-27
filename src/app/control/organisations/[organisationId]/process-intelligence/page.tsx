import Link from "next/link";
import { MetricCard } from "@/components/process-intelligence/MetricCard";
import { demoProcesses } from "@/lib/process-intelligence";
import { createProcessCampaignAction } from "@/server/actions/process-intelligence";

const tabs = [
  "Discovery",
  "Processes",
  "Departments",
  "Systems",
  "Opportunities",
  "Transformation",
  "Outcomes",
];
export default async function OrganisationProcessIntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { organisationId } = await params;
  const { token } = await searchParams;
  const departments = Array.from(new Set(demoProcesses.map((p) => p.department)));
  const hours = demoProcesses.reduce((n, p) => n + p.annualHours, 0);
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Process Intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold">AI transformation discovery</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Evidence from participant-described work. Hours and benefits remain estimates
          until measured.
        </p>
      </header>
      {token ? (
        <section className="rounded-xl border border-green-300 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">Campaign is live</h2>
          <p className="mt-1 text-sm text-green-900">
            Copy this general link now. Pegasus stores only its secure digest and cannot
            show the same link again.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-white p-3 text-sm">{`https://mission.pegasus-studio.co/intake/${token}`}</code>
        </section>
      ) : null}
      <details className="surface-card p-5">
        <summary className="cursor-pointer font-semibold">Create intake campaign</summary>
        <form
          action={createProcessCampaignAction}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="organisationId" value={organisationId} />
          <label className="text-sm font-semibold">
            Campaign name
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-line p-3 font-normal"
              placeholder="Organisation-wide AI Discovery"
            />
          </label>
          <label className="text-sm font-semibold">
            Closing date
            <input
              name="closesAt"
              type="date"
              className="mt-1 w-full rounded-lg border border-line p-3 font-normal"
            />
          </label>
          <label className="md:col-span-2 text-sm font-semibold">
            Description
            <textarea
              name="description"
              rows={3}
              className="mt-1 w-full rounded-lg border border-line p-3 font-normal"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="identificationRequired" type="checkbox" defaultChecked />
            Require participant identification
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="anonymousAllowed" type="checkbox" />
            Allow anonymous responses
          </label>
          <button className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white md:col-span-2">
            Create campaign and general link
          </button>
        </form>
      </details>
      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab, i) => (
          <a
            key={tab}
            href={`#${tab.toLowerCase()}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${i === 0 ? "border-blue font-semibold" : "border-transparent text-ink-muted"}`}
          >
            {tab}
          </a>
        ))}
      </nav>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Processes captured" value={demoProcesses.length} />
        <MetricCard
          label="Departments mapped"
          value={`${departments.length} / 6`}
          note="Process discovery coverage"
        />
        <MetricCard
          label="Annual hours represented"
          value={`${hours.toLocaleString()}h`}
          note="Approximate"
        />
        <MetricCard
          label="Opportunities"
          value={demoProcesses.filter((p) => p.score >= 60).length}
          note="Awaiting human review"
        />
      </section>
      <section id="departments" className="surface-card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-semibold">Department coverage</h2>
          <p className="text-sm text-ink-muted">
            Coverage of work described so far, not a readiness score.
          </p>
        </div>
        <div className="divide-y divide-line">
          {departments.map((dept) => {
            const ps = demoProcesses.filter((p) => p.department === dept);
            return (
              <div
                key={dept}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-4"
              >
                <strong>{dept}</strong>
                <span className="text-sm text-ink-muted">
                  {ps.length} processes · {ps.reduce((n, p) => n + p.annualHours, 0)}
                  h/year
                </span>
                <span className="text-sm font-semibold text-blue">
                  {ps.filter((p) => p.score >= 60).length} opportunities
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section id="processes" className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold">Recently captured processes</h2>
            <p className="text-sm text-ink-muted">
              Source evidence remains available on every process.
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-blue"
            href={`/control/organisations/${organisationId}/processes`}
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-line">
          {demoProcesses.slice(0, 5).map((p) => (
            <Link
              href={`/control/processes/${p.id}`}
              key={p.id}
              className="grid gap-2 p-4 hover:bg-paper sm:grid-cols-[1fr_140px_100px]"
            >
              <div>
                <strong>{p.name}</strong>
                <p className="text-xs text-ink-muted">
                  {p.department} · {p.systems.join(" · ")}
                </p>
              </div>
              <span className="text-sm">{p.annualHours}h/year</span>
              <span className="font-semibold text-blue">Score {p.score}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
