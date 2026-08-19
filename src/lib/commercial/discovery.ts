import { domainOf } from "@/lib/organisation-intelligence/url";
import { sanitiseSourceText } from "@/lib/organisation-intelligence/sanitise";
import type { CommercialMotion, CommercialSignal, ResearchClaim } from "./types";

export type DiscoveryCapability =
  | "organisationDiscovery"
  | "peopleDiscovery"
  | "newsSignals"
  | "fundingSignals"
  | "jobSignals"
  | "websiteResearch"
  | "publicDocumentResearch";
export type ResearchState =
  | "discovered"
  | "enriching"
  | "researched"
  | "scoring"
  | "qualified"
  | "ready_for_review"
  | "insufficient_data"
  | "duplicate"
  | "disqualified"
  | "research_failed";
export interface DiscoveryJob {
  id: string;
  name: string;
  icpProfileId: string;
  commercialMotion: CommercialMotion;
  searchCriteria: string;
  geography: string[];
  sectors: string[];
  organisationSize?: string;
  signalRequirements: string[];
  excludedCriteria: string[];
  sources: string[];
  status: "draft" | "ready" | "running" | "completed" | "failed";
  createdBy: string;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  resultCount: number;
  qualifiedCount: number;
}
export interface DiscoveryCandidate {
  providerRecordId: string;
  name: string;
  /**
   * The organisation's own website, when the provider actually knows it.
   *
   * A registry record does not: it knows a register entry, which belongs in
   * `sourceUrl`. Putting the register URL here would give every candidate from
   * one registry the same domain, and identity resolution would then read them
   * all as the same organisation.
   */
  website?: string;
  /** Company or charity number, when the provider is an official register. */
  registrationIdentifier?: string;
  description?: string;
  sector?: string;
  geography?: string;
  sourceUrl: string;
  discoveredAt: string;
}
export interface DiscoveredPerson {
  providerRecordId: string;
  name: string;
  title: string;
  sourceUrl: string;
  confidence: number;
}
export interface ProviderContext {
  requestId: string;
  now: Date;
}
export interface ProspectDiscoveryProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<DiscoveryCapability>;
  discover(job: DiscoveryJob, context: ProviderContext): Promise<DiscoveryCandidate[]>;
}
export interface OrganisationResearchProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<DiscoveryCapability>;
  research(
    candidate: DiscoveryCandidate,
    context: ProviderContext,
  ): Promise<{
    claims: ResearchClaim[];
    signals: CommercialSignal[];
    injectionSuspected: boolean;
  }>;
}
export interface PeopleDiscoveryProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<DiscoveryCapability>;
  discoverPeople(
    candidate: DiscoveryCandidate,
    context: ProviderContext,
  ): Promise<DiscoveredPerson[]>;
}

export function assertProviderCapability(
  provider: { capabilities: ReadonlySet<DiscoveryCapability> },
  capability: DiscoveryCapability,
) {
  if (!provider.capabilities.has(capability))
    throw new Error(`Provider does not declare ${capability} capability.`);
}
export function isResearchFresh(
  lastResearchedAt: string | undefined,
  now: Date,
  windowDays: number,
) {
  if (!lastResearchedAt) return false;
  return now.getTime() - new Date(lastResearchedAt).getTime() < windowDays * 86_400_000;
}

export type DuplicateDecision = "same" | "possible_duplicate" | "distinct";
const normaliseName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(limited|ltd|plc|inc|foundation|trust|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
export function resolveOrganisationIdentity(
  candidate: { name: string; website?: string; registrationIdentifier?: string },
  existing: { name: string; website?: string; registrationIdentifier?: string }[],
): DuplicateDecision {
  for (const item of existing) {
    if (
      candidate.registrationIdentifier &&
      item.registrationIdentifier &&
      candidate.registrationIdentifier === item.registrationIdentifier
    )
      return "same";
    const a = candidate.website ? domainOf(candidate.website) : null,
      b = item.website ? domainOf(item.website) : null;
    if (a && b && a === b) return "same";
    if (normaliseName(candidate.name) === normaliseName(item.name))
      return "possible_duplicate";
  }
  return "distinct";
}

/**
 * The public register page a `registrationIdentifier` refers to.
 *
 * A register candidate has no website of its own, so this is the only link a
 * reviewer can follow to check the organisation is real.
 */
export function registerUrl(registrationIdentifier: string | undefined): string | null {
  const [register, reference] = (registrationIdentifier ?? "").split(":");
  if (!reference) return null;
  if (register === "companies-house")
    return `https://find-and-update.company-information.service.gov.uk/company/${reference}`;
  if (register === "ccew")
    return `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${reference}`;
  return null;
}

export function safeClaim(input: {
  id: string;
  accountId: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
  origin: "human" | "ai" | "provider";
  locator?: string;
}) {
  const safe = sanitiseSourceText(input.text);
  return {
    claim: {
      id: input.id,
      accountId: input.accountId,
      claim: safe.text,
      kind: "fact",
      source: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      observedAt: input.observedAt,
      confidence: safe.injectionSuspected
        ? Math.min(input.confidence, 0.4)
        : input.confidence,
      verificationState: "needs_review",
      extractedBy: input.origin,
    } satisfies ResearchClaim,
    injectionSuspected: safe.injectionSuspected,
    locator: input.locator,
  };
}

export interface ResearchCostRecord {
  provider: string;
  requestId: string;
  accountId?: string;
  cost?: number;
  currency?: string;
  timestamp: string;
  cacheState: "hit" | "miss" | "bypass";
}
export async function runDiscovery(
  provider: ProspectDiscoveryProvider,
  job: DiscoveryJob,
  context: ProviderContext,
) {
  assertProviderCapability(provider, "organisationDiscovery");
  try {
    return {
      status: "completed" as const,
      results: await provider.discover(job, context),
      failure: undefined,
      cost: {
        provider: provider.id,
        requestId: context.requestId,
        timestamp: context.now.toISOString(),
        cacheState: "miss" as const,
      },
    };
  } catch (error) {
    return {
      status: "failed" as const,
      results: [],
      failure: error instanceof Error ? error.message : "Discovery provider failed.",
      cost: {
        provider: provider.id,
        requestId: context.requestId,
        timestamp: context.now.toISOString(),
        cacheState: "miss" as const,
      },
    };
  }
}
