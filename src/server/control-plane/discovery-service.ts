import { requireControlCapability } from "@/lib/control-plane/permissions";
import {
  resolveOrganisationIdentity,
  type DiscoveryCandidate,
  type DiscoveryJob,
  type ProviderContext,
  type ProspectDiscoveryProvider,
} from "@/lib/commercial/discovery";
import { PILOT_LIMITS, type PilotDiscoveryJob } from "@/lib/commercial/pilot";
import {
  BraveSearchDiscoveryProvider,
  CharityCommissionDiscoveryProvider,
  CompaniesHouseDiscoveryProvider,
  ProviderError,
} from "@/server/commercial/live-providers";
import { createInternalAuditEvent } from "./audit";
import type { ControlRequestContext } from "./context";
import type { ControlRepository } from "./repository";
import { createProspect } from "./prospect-service";

/**
 * Why a run reports a provider as contributing nothing.
 *
 * Kept as a closed vocabulary because the discover page renders these after a
 * redirect: the summary travels through the query string, and only values the
 * page can map back to a fixed sentence are displayed. An operator must never
 * be shown a run outcome that a crafted URL invented.
 */
export const PROVIDER_FAILURE_KINDS = [
  "not_configured",
  "rate_limited",
  "timeout",
  "malformed_response",
  "upstream_failure",
  "no_discovery_capability",
] as const;
export type ProviderFailureKind = (typeof PROVIDER_FAILURE_KINDS)[number];

/** The identity fields duplicate resolution compares against. */
export interface KnownOrganisation {
  name: string;
  website?: string;
  registrationIdentifier?: string;
}

export interface DiscoveryProviderOutcome {
  provider: string;
  found: number;
  failure?: ProviderFailureKind;
}
export interface DiscoveryRunSummary {
  jobId: string;
  /** Candidates kept after the pilot cap — the number actually considered. */
  found: number;
  created: number;
  duplicates: number;
  /** Candidates a provider returned that could not become a prospect. */
  rejected: number;
  providers: DiscoveryProviderOutcome[];
}

export function createDiscoveryProvider(id: string): ProspectDiscoveryProvider | null {
  switch (id) {
    case "brave_search":
      return new BraveSearchDiscoveryProvider();
    case "companies_house":
      return new CompaniesHouseDiscoveryProvider();
    case "charity_commission_ew":
      return new CharityCommissionDiscoveryProvider();
    default:
      return null;
  }
}

/**
 * A pilot job describes one intent; a provider query needs one term.
 *
 * The registry providers search by organisation name, so handing them the job's
 * prose criteria returns nothing at all. Each term therefore becomes its own
 * provider call and the results are interleaved, so no single term crowds the
 * others out of the pilot cap.
 */
export function toDiscoveryJob(
  job: PilotDiscoveryJob,
  ctx: ControlRequestContext,
  searchCriteria: string,
): DiscoveryJob {
  return {
    id: job.id,
    name: job.name,
    icpProfileId: job.icpId,
    commercialMotion: job.motion,
    searchCriteria,
    geography: [...job.geography],
    sectors: [],
    signalRequirements: [...job.signalRequirements],
    excludedCriteria: [],
    sources: [...job.providers],
    status: "running",
    createdBy: ctx.internalUserId,
    createdAt: ctx.now().toISOString(),
    resultCount: 0,
    qualifiedCount: 0,
  };
}

function interleave<T>(lists: T[][]): T[] {
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  const out: T[] = [];
  for (let index = 0; index < longest; index++)
    for (const list of lists) {
      const item = list[index];
      if (item !== undefined) out.push(item);
    }
  return out;
}

/**
 * The wall-clock budget a run may spend inside providers.
 *
 * Every term is a separate network call and each provider allows itself eight
 * seconds, so an unbounded run is minutes long — longer than the platform will
 * keep the request alive. A killed request reports nothing at all, which is the
 * silent-button failure this module exists to prevent, so the run stops calling
 * providers while it still has time to persist and report what it has.
 */
export const PROVIDER_BUDGET_MS = 40_000;

async function discoverWithProvider(
  provider: ProspectDiscoveryProvider,
  job: PilotDiscoveryJob,
  ctx: ControlRequestContext,
  context: ProviderContext,
  deadlineAt: number,
): Promise<{ candidates: DiscoveryCandidate[]; failure?: ProviderFailureKind }> {
  const perTerm: DiscoveryCandidate[][] = [];
  let failure: ProviderFailureKind | undefined;
  for (const term of job.searchTerms) {
    // Real elapsed time, not `ctx.now()`: this bounds the request itself rather
    // than describing when the run happened.
    if (Date.now() >= deadlineAt) {
      failure ??= "timeout";
      break;
    }
    try {
      perTerm.push(await provider.discover(toDiscoveryJob(job, ctx, term), context));
    } catch (error) {
      failure = error instanceof ProviderError ? error.kind : "upstream_failure";
      // A missing credential or a rate limit will not resolve on the next term.
      if (failure === "not_configured" || failure === "rate_limited") break;
    }
  }
  const seen = new Set<string>();
  const candidates = interleave(perTerm).filter((candidate) => {
    if (seen.has(candidate.providerRecordId)) return false;
    seen.add(candidate.providerRecordId);
    return true;
  });
  // A provider that returned something is reported as working, not as failed.
  return { candidates, failure: candidates.length ? undefined : failure };
}

/**
 * Run one pilot discovery job and persist what it found as prospects.
 *
 * Every provider is isolated: an unconfigured or failing one is reported in the
 * summary and the rest of the run continues. A run that silently produced
 * nothing is indistinguishable from a broken button, which is exactly the
 * failure this replaces — so the summary always says which provider did what.
 */
export async function runDiscoveryJob(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  job: PilotDiscoveryJob,
  makeProvider: (
    id: string,
  ) => ProspectDiscoveryProvider | null = createDiscoveryProvider,
  deadlineAt: number = Date.now() + PROVIDER_BUDGET_MS,
): Promise<DiscoveryRunSummary> {
  requireControlCapability(ctx.role, "prospect:create");
  const context: ProviderContext = { requestId: ctx.requestId, now: ctx.now() };

  // Providers are separate services with separate rate limits, so they run
  // together and the budget covers the slowest rather than the sum. Terms stay
  // sequential inside a provider, which is what its rate limit actually counts.
  const results = await Promise.all(
    job.providers.map(async (providerId) => {
      const provider = makeProvider(providerId);
      if (!provider?.capabilities.has("organisationDiscovery")) {
        return {
          outcome: {
            provider: providerId,
            found: 0,
            failure: "no_discovery_capability" as ProviderFailureKind,
          },
          candidates: [] as DiscoveryCandidate[],
        };
      }
      const result = await discoverWithProvider(
        provider,
        job,
        ctx,
        context,
        deadlineAt,
      );
      return {
        outcome: {
          provider: providerId,
          found: result.candidates.length,
          failure: result.failure,
        },
        candidates: result.candidates,
      };
    }),
  );
  const outcomes: DiscoveryProviderOutcome[] = results.map((r) => r.outcome);
  const byProvider = results
    .filter((r) => r.outcome.failure !== "no_discovery_capability")
    .map((r) => r.candidates);

  const selected = interleave(byProvider).slice(0, PILOT_LIMITS.maxCandidatesPerRun);
  const existing: KnownOrganisation[] = (await repo.prospects.list(ctx)).map(
    (prospect) => ({
      name: prospect.name,
      website: prospect.website,
      registrationIdentifier: prospect.registrationIdentifier,
    }),
  );

  let created = 0,
    duplicates = 0,
    rejected = 0;
  for (const candidate of selected) {
    if (resolveOrganisationIdentity(candidate, existing) !== "distinct") {
      duplicates++;
      continue;
    }
    try {
      // The register entry itself is recoverable from the identifier, so a
      // candidate without a website still leaves the reviewer a link to check.
      await createProspect(ctx, repo, {
        name: candidate.name,
        website: candidate.website,
        registrationIdentifier: candidate.registrationIdentifier,
        country: candidate.geography,
        source: `discovery:${job.id}`,
      });
    } catch {
      // One malformed candidate must not discard the rest of the run.
      rejected++;
      continue;
    }
    existing.push({
      name: candidate.name,
      website: candidate.website,
      registrationIdentifier: candidate.registrationIdentifier,
    });
    created++;
  }

  const summary: DiscoveryRunSummary = {
    jobId: job.id,
    found: selected.length,
    created,
    duplicates,
    rejected,
    providers: outcomes,
  };
  await repo.audit.append(
    ctx,
    createInternalAuditEvent(ctx, {
      action: "prospect.discovery_run",
      targetType: "discovery_job",
      targetId: job.id,
      after: { ...summary, providers: outcomes.map((o) => ({ ...o })) },
    }),
  );
  return summary;
}
