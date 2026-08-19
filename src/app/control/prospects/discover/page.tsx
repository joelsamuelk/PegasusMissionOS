import Link from "next/link";
import { FileUp, Plus, Search, ShieldCheck } from "lucide-react";
import { pilotJobs, PILOT_LIMITS, type PilotDiscoveryJob } from "@/lib/commercial/pilot";
import { registerUrl } from "@/lib/commercial/discovery";
import { canControl } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import {
  PROVIDER_FAILURE_KINDS,
  type ProviderFailureKind,
} from "@/server/control-plane/discovery-service";
import {
  importProspectCsvAction,
  runDiscoveryJobAction,
} from "@/server/actions/control-prospects";
import type { ProspectOrganisation } from "@/server/control-plane/types";

/**
 * A run reports through the query string, so nothing is rendered from it
 * directly: every value is matched against the definitions this page already
 * holds, and anything unrecognised is dropped rather than displayed.
 */
const FAILURE_SENTENCE: Record<ProviderFailureKind, string> = {
  not_configured: "no server credential is configured",
  rate_limited: "the provider rate limit was reached",
  timeout: "the provider did not respond in time",
  malformed_response: "the provider returned an unusable response",
  upstream_failure: "the provider returned an error",
  no_discovery_capability: "it researches organisations rather than discovering them",
};
const ERROR_SENTENCE: Record<string, string> = {
  unknown_job: "That discovery job no longer exists.",
  run_failed: "The run could not start. Check Control Plane configuration.",
  no_file: "Choose a CSV file before importing.",
  import_failed:
    "The CSV file could not be read. It needs a header row with a 'name' column.",
};

const count = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};
function failures(value: string | undefined, job: PilotDiscoveryJob) {
  return (value ?? "").split(",").flatMap((entry) => {
    const [provider, kind] = entry.split(":");
    return provider &&
      job.providers.includes(provider) &&
      (PROVIDER_FAILURE_KINDS as readonly string[]).includes(kind ?? "")
      ? [{ provider, kind: kind as ProviderFailureKind }]
      : [];
  });
}

const register = (prospect: ProspectOrganisation) =>
  registerUrl(prospect.registrationIdentifier);
const sourceOf = (job: PilotDiscoveryJob) => `discovery:${job.id}`;
function jobStats(job: PilotDiscoveryJob, prospects: ProspectOrganisation[]) {
  const own = prospects.filter((prospect) => prospect.source === sourceOf(job));
  const lastRun = own.reduce<string | undefined>(
    (latest, prospect) =>
      !latest || prospect.createdAt > latest ? prospect.createdAt : latest,
    undefined,
  );
  return {
    lastRun,
    found: own.length,
    qualified: own.filter((prospect) => prospect.status !== "discovered").length,
  };
}

const field = "rounded-md border border-line bg-surface px-3 py-2 text-sm";
const tile = "surface-card flex items-center gap-3 p-4 text-left";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const ctx = await resolveControlRequestContext();
  const repo = await getControlRepository(ctx);
  if (!canControl(ctx.role, "prospect:view"))
    throw new Error("Prospect access required.");
  const mayRun = canControl(ctx.role, "prospect:create");
  const prospects = await repo.prospects.list(ctx);
  const discovered = prospects.filter(
    (prospect) =>
      prospect.source.startsWith("discovery:") || prospect.source === "csv_import",
  );

  const ranJob = pilotJobs.find((job) => job.id === one("job"));
  const errorSentence = ERROR_SENTENCE[one("error") ?? ""];
  const imported = one("import") === "1";

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

      {errorSentence && (
        <p className="rounded-xl border border-critical/20 bg-critical-soft p-4 text-sm">
          {errorSentence}
        </p>
      )}
      {!errorSentence && ranJob && (
        <section className="rounded-xl border border-blue/20 bg-blue-soft p-4">
          <b className="text-sm">{ranJob.name} run finished</b>
          <p className="mt-1 text-sm">
            {count(one("found"))} candidates considered · {count(one("created"))} new
            prospects created · {count(one("duplicates"))} already known
            {count(one("rejected")) > 0 &&
              ` · ${count(one("rejected"))} could not be recorded`}
          </p>
          {failures(one("failed"), ranJob).map((failure) => (
            <p key={failure.provider} className="mt-1 text-xs text-ink-muted">
              {failure.provider} contributed nothing: {FAILURE_SENTENCE[failure.kind]}.
            </p>
          ))}
        </section>
      )}
      {!errorSentence && imported && (
        <p className="rounded-xl border border-blue/20 bg-blue-soft p-4 text-sm">
          CSV import finished · {count(one("created"))} created ·{" "}
          {count(one("duplicates"))} already known · {count(one("rejected"))} skipped.
        </p>
      )}

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

      {pilotJobs.map((job) => {
        const stats = jobStats(job, prospects);
        return (
          <section key={job.id} className="surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Pilot discovery job</p>
                <h2 className="mt-1 font-semibold">{job.name}</h2>
                <p className="mt-1 text-xs text-ink-muted">{job.criteria}</p>
              </div>
              <form action={runDiscoveryJobAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <button
                  disabled={!mayRun}
                  title={mayRun ? undefined : "Your role cannot create prospects."}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Run now
                </button>
              </form>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-muted">Provider</p>
                <b className="text-sm">{job.providers.join(" · ")}</b>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Last run</p>
                <b className="text-sm">
                  {stats.lastRun
                    ? new Date(stats.lastRun).toLocaleString("en-GB")
                    : "Not run"}
                </b>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Found</p>
                <b className="text-sm">{stats.found} organisations</b>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Qualified</p>
                <b className="text-sm">{stats.qualified} for review</b>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Searches: {job.searchTerms.join(", ")}. Provider health is on{" "}
              <Link className="text-blue underline" href="/control/research">
                research review
              </Link>
              .
            </p>
          </section>
        );
      })}

      <section className="grid gap-3 md:grid-cols-3">
        <Link className={tile} href="/control/prospects">
          <Plus className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Add manually</b>
            <span className="text-xs text-ink-muted">Best for one known account</span>
          </span>
        </Link>
        <form action={importProspectCsvAction} className={`${tile} flex-wrap`}>
          <FileUp className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Import CSV</b>
            <span className="text-xs text-ink-muted">
              Header row with name, website, country, type
            </span>
          </span>
          <input
            required
            disabled={!mayRun}
            type="file"
            name="file"
            accept=".csv,text/csv"
            className={`${field} w-full`}
          />
          <button
            disabled={!mayRun}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            Import
          </button>
        </form>
        <Link className={tile} href="/control/research">
          <Search className="h-5 w-5 text-blue" />
          <span>
            <b className="block text-sm">Research provider</b>
            <span className="text-xs text-ink-muted">Check provider health and keys</span>
          </span>
        </Link>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-semibold">Discovery candidates</h2>
            <p className="text-xs text-ink-muted">
              {discovered.length} found · sources retained
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" />
            No contact action yet
          </div>
        </div>
        {discovered.length === 0 && (
          <p className="p-5 text-sm text-ink-muted">
            No candidates yet. Run a pilot job or import a CSV to create some.
          </p>
        )}
        {discovered.map((prospect) => (
          <div
            key={prospect.id}
            className="grid gap-4 border-b p-5 last:border-0 lg:grid-cols-[1fr_150px_1.4fr_auto]"
          >
            <div>
              <b>{prospect.name}</b>
              <p className="text-xs text-ink-muted">
                {prospect.organisationType ?? "Type not recorded"} ·{" "}
                {prospect.country ?? "Country not recorded"}
              </p>
            </div>
            <div>
              <span className="rounded-full bg-blue-soft px-2 py-1 text-[10px] font-bold text-blue">
                {prospect.status}
              </span>
            </div>
            <div>
              {prospect.website ? (
                <p className="text-sm">{prospect.website}</p>
              ) : register(prospect) ? (
                <a
                  className="text-sm text-blue underline"
                  href={register(prospect)!}
                  rel="noreferrer"
                  target="_blank"
                >
                  Public register entry
                </a>
              ) : (
                <p className="text-sm">No website recorded yet.</p>
              )}
              <p className="mt-1 text-xs text-ink-muted">Source: {prospect.source}</p>
            </div>
            <Link
              className="self-center rounded-lg border px-3 py-2 text-xs font-bold"
              href={`/control/prospects/${prospect.id}`}
            >
              Review
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
