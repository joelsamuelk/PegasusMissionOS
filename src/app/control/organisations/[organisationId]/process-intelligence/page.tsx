import Link from "next/link";
import { MetricCard } from "@/components/process-intelligence/MetricCard";
import {
  createProcessCampaignAction,
  getProcessSummary,
  listCapturedProcesses,
} from "@/server/actions/process-intelligence";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { organisationId } = await params,
    { token } = await searchParams,
    [summary, processes] = await Promise.all([
      getProcessSummary(organisationId),
      listCapturedProcesses(organisationId),
    ]);
  if (!summary) return <p>Organisation not found.</p>;
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">{summary.organisation.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">AI transformation discovery</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Live discovery data from participant submissions.
        </p>
      </header>
      {token ? (
        <section className="rounded-xl border border-green-300 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">Campaign is live</h2>
          <p className="mt-1 text-sm text-green-900">
            Copy this link now. Only its secure digest is stored.
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
          <label className="flex gap-2 text-sm">
            <input name="identificationRequired" type="checkbox" defaultChecked />
            Require identification
          </label>
          <label className="flex gap-2 text-sm">
            <input name="anonymousAllowed" type="checkbox" />
            Allow anonymous responses
          </label>
          <button className="rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white md:col-span-2">
            Create campaign and link
          </button>
        </form>
      </details>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Processes captured" value={summary.processes} />
        <MetricCard
          label="Contributors"
          value={summary.contributors}
          note={`${summary.participants} participants`}
        />
        <MetricCard
          label="Annual hours represented"
          value={`≈ ${summary.annualHours}h`}
          note="Participant estimate"
        />
        <MetricCard label="Awaiting analysis" value={summary.awaitingAnalysis} />
      </section>
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold">Captured processes</h2>
            <p className="text-sm text-ink-muted">
              No demo records. These are live submissions.
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-blue"
            href={`/control/organisations/${organisationId}/processes`}
          >
            View all
          </Link>
        </div>
        {processes.length ? (
          <div className="divide-y divide-line">
            {processes.slice(0, 8).map((p) => (
              <Link
                href={`/control/processes/${p.id}`}
                key={p.id}
                className="grid gap-2 p-4 hover:bg-paper sm:grid-cols-[1fr_140px_120px]"
              >
                <div>
                  <strong>{p.name}</strong>
                  <p className="text-xs text-ink-muted">
                    {p.department ?? "Department not provided"} ·{" "}
                    {p.systems.join(" · ") || "No systems provided"}
                  </p>
                </div>
                <span className="text-sm">≈ {p.annualHours}h/year</span>
                <span className="text-sm font-semibold capitalize text-blue">
                  {p.analysisStatus}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-ink-muted">No submissions captured yet.</p>
        )}
      </section>
    </div>
  );
}
