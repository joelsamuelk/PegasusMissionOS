import { isSameSite, normaliseUrl } from "@/lib/organisation-intelligence/url";
import {
  safeClaim,
  type DiscoveryCandidate,
  type ProviderContext,
} from "@/lib/commercial/discovery";
import type { CommercialSignal, ResearchClaim } from "@/lib/commercial/types";
import { extractCommercialSignals } from "@/lib/commercial/intelligence";
import type {
  OrganisationResearchProvider,
  DiscoveryCapability,
} from "@/lib/commercial/discovery";
import type { FetchLike } from "./live-providers";
export interface ResearchBudget {
  maxPages: number;
  maxExternalSources: number;
  maxCharacters: number;
  maxRuntimeMs: number;
  maxProviderCost: number;
}
export interface ResearchTelemetry {
  pagesAttempted: number;
  pagesSuccessful: number;
  claimsExtracted: number;
  signalsExtracted: number;
  providerRequests: number;
  estimatedCost: number;
  cacheHits: number;
  durationMs: number;
  stoppedReason:
    | "sufficient_evidence"
    | "page_limit"
    | "character_limit"
    | "runtime_limit"
    | "completed";
}
const defaults: ResearchBudget = {
  maxPages: 5,
  maxExternalSources: 2,
  maxCharacters: 60_000,
  maxRuntimeMs: 15_000,
  maxProviderCost: 0.1,
};
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const links = (html: string, base: string) =>
  [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => normaliseUrl(m[1]!, base))
    .filter((x): x is string => Boolean(x))
    .filter((x) => isSameSite(x, base))
    .filter((x) => /(about|news|press|careers|jobs|report|impact|strategy)/i.test(x));
export class BoundedWebsiteResearchProvider implements OrganisationResearchProvider {
  readonly id = "bounded_public_web";
  readonly capabilities: ReadonlySet<DiscoveryCapability> = new Set([
    "websiteResearch",
    "publicDocumentResearch",
  ]);
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly budget: ResearchBudget = defaults,
  ) {}
  async research(candidate: DiscoveryCandidate, context: ProviderContext) {
    const started = Date.now(),
      queue = [candidate.website],
      visited = new Set<string>(),
      claims: ResearchClaim[] = [],
      signals: CommercialSignal[] = [];
    let successful = 0,
      characters = 0,
      injectionSuspected = false,
      stoppedReason: ResearchTelemetry["stoppedReason"] = "completed";
    while (queue.length && visited.size < this.budget.maxPages) {
      if (Date.now() - started > this.budget.maxRuntimeMs) {
        stoppedReason = "runtime_limit";
        break;
      }
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      try {
        const response = await this.fetcher(url, {
          headers: {
            "User-Agent":
              "PegasusResearchBot/1.0 (+https://pegasus-studio.co; bounded public research)",
          },
          signal: AbortSignal.timeout(Math.min(5000, this.budget.maxRuntimeMs)),
        });
        if (!response.ok) continue;
        const html = (await response.text()).slice(
          0,
          this.budget.maxCharacters - characters,
        );
        characters += html.length;
        successful++;
        const sourceText = text(html).slice(0, 8000);
        if (sourceText.length > 80) {
          const result = safeClaim({
            id: `claim-${candidate.providerRecordId}-${visited.size}`,
            accountId: candidate.providerRecordId,
            text: sourceText,
            sourceTitle: new URL(url).pathname || candidate.name,
            sourceUrl: url,
            observedAt: context.now.toISOString(),
            confidence: 0.65,
            origin: "provider",
            locator: "page body",
          });
          claims.push(result.claim);
          injectionSuspected ||= result.injectionSuspected;
        }
        for (const link of links(html, candidate.website))
          if (!visited.has(link) && queue.length < this.budget.maxPages * 2)
            queue.push(link);
        if (characters >= this.budget.maxCharacters) {
          stoppedReason = "character_limit";
          break;
        }
        if (claims.length >= 3) {
          stoppedReason = "sufficient_evidence";
          break;
        }
      } catch {
        /* Individual page failure is telemetry, never a fabricated claim. */
      }
    }
    signals.push(
      ...extractCommercialSignals({
        accountId: candidate.providerRecordId,
        motion: candidate.description?.toLowerCase().includes("charity")
          ? "mission_os"
          : "studio",
        claims,
        now: context.now.toISOString(),
      }),
    );
    return {
      claims,
      signals,
      injectionSuspected,
      telemetry: {
        pagesAttempted: visited.size,
        pagesSuccessful: successful,
        claimsExtracted: claims.length,
        signalsExtracted: signals.length,
        providerRequests: visited.size,
        estimatedCost: 0,
        cacheHits: 0,
        durationMs: Date.now() - started,
        stoppedReason:
          stoppedReason === "completed" && visited.size >= this.budget.maxPages
            ? "page_limit"
            : stoppedReason,
      } satisfies ResearchTelemetry,
    };
  }
}
