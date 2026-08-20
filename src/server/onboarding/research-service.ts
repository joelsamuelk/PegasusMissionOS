import { reconcile } from "@/lib/organisation-intelligence/reconcile";
import { researchWebsite } from "@/lib/organisation-intelligence/pipeline";
import type {
  PageFetcher,
  ProfileCandidate,
  ReconciliationResult,
  ResearchSource,
} from "@/lib/organisation-intelligence/types";
import type { OnboardingRun } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data/types";
import {
  OrganisationDiscoveryService,
  type IdentityResolution,
  type OnboardingInput,
} from "./discovery-service";
import { DocumentDiscoveryService } from "./document-service";
import type { RegistryLookup } from "@/lib/organisation-intelligence/registry";

/**
 * OrganisationResearchService.
 *
 * The orchestrator, running the pipeline the MG-3 brief specifies:
 *
 *     identity → website → registry → documents → extraction
 *              → conflict detection → candidate Mission Graph → human review
 *
 * Two properties matter more than the sequence.
 *
 * **Every stage degrades independently.** A registry outage, an unreachable
 * website and an unparseable PDF are each recorded and stepped over. An
 * organisation whose site is down still finishes onboarding with whatever the
 * register knew, and is told plainly what could not be read. A pipeline that
 * fails whole because one stage failed is a pipeline that mostly fails.
 *
 * **Nothing it produces is trusted.** Every value that comes out is a
 * candidate carrying its source, its locator and its extractor's confidence.
 * The transition to organisational truth happens in review, performed by a
 * person, and there is no path around it in this service.
 */

export interface ResearchDependencies {
  repo: MissionRepository;
  fetcher: PageFetcher;
  registers: readonly RegistryLookup[];
  now: () => Date;
  makeId: (prefix: string) => string;
  /** Page budget for the website crawl. */
  maxPages?: number;
  /** Documents to fetch and parse in one run. Each is a download. */
  maxDocuments?: number;
  fetchBytes?: (url: string) => Promise<Uint8Array | null>;
}

export interface ResearchResult {
  run: OnboardingRun;
  identity: IdentityResolution;
  sources: ResearchSource[];
  candidates: ProfileCandidate[];
  reconciliation: ReconciliationResult;
  documents: { title: string; status: string; note?: string; candidates: number }[];
  /** Stages that could not run, and what that means for the result. */
  limitations: string[];
}

export class OrganisationResearchService {
  private readonly discovery: OrganisationDiscoveryService;
  private readonly documents: DocumentDiscoveryService;

  constructor(private readonly deps: ResearchDependencies) {
    this.discovery = new OrganisationDiscoveryService({
      registers: deps.registers,
      now: deps.now,
      makeId: deps.makeId,
    });
    this.documents = new DocumentDiscoveryService({
      repo: deps.repo,
      now: deps.now,
      makeId: deps.makeId,
      fetchBytes: deps.fetchBytes,
    });
  }

  async run(ctx: RequestContext, input: OnboardingInput): Promise<ResearchResult> {
    const { repo, now, makeId, maxPages = 12, maxDocuments = 5 } = this.deps;

    const run = await repo.onboarding.startRun(ctx, {
      name: input.name,
      websiteUrl: input.websiteUrl,
      country: input.country,
      registrationNumber: input.registrationNumber,
      organisationType: input.organisationType,
    });

    const sources: ResearchSource[] = [];
    const candidates: ProfileCandidate[] = [];
    const limitations: string[] = [];
    const documentReports: ResearchResult["documents"] = [];

    // --- Identity and registry ------------------------------------------
    await repo.onboarding.updateRun(ctx, run.id, { stage: "registry_research" });
    const identity = await this.discovery.resolve(input, ctx.organisationId);

    sources.push(...identity.sources);
    candidates.push(...identity.candidates);
    for (const unavailable of identity.unavailableRegisters) {
      limitations.push(unavailable.reason);
    }

    // --- Website ---------------------------------------------------------
    let pagesRead = 0;
    const fetchedPages: { url: string; html: string }[] = [];

    if (identity.websiteUrl) {
      await repo.onboarding.updateRun(ctx, run.id, { stage: "website_research" });

      const website = await researchWebsite({
        organisationId: ctx.organisationId,
        websiteUrl: identity.websiteUrl,
        fetcher: this.deps.fetcher,
        now,
        makeId,
        maxPages,
      });

      sources.push(...website.sources);
      candidates.push(...website.candidates);
      pagesRead = website.sources.filter((s) => s.extractionStatus === "extracted").length;

      if (website.degraded) {
        limitations.push(`${website.degraded.reason} ${website.degraded.guidance}`);
      }

      // Re-fetch the pages that were read so their links can be scanned for
      // documents. The alternative is threading raw HTML back out of the
      // pipeline, which would make the extraction stage hold every page it has
      // ever read in memory for the benefit of a later stage.
      for (const source of website.sources) {
        if (source.extractionStatus !== "extracted") continue;
        const page = await this.deps.fetcher.fetch(source.url);
        if (page && page.status < 400) fetchedPages.push({ url: source.url, html: page.html });
      }
    } else if (!input.websiteUrl) {
      limitations.push(
        "No website was given, so Pegasus could not read your public pages. " +
          "You can add one later and run research again.",
      );
    }

    // --- Documents -------------------------------------------------------
    await repo.onboarding.updateRun(ctx, run.id, { stage: "document_discovery" });

    const discovered = [
      ...this.documents.fromRegistry(identity.registryDocuments),
      ...(identity.websiteUrl
        ? this.documents.discoverFromPages(fetchedPages, identity.websiteUrl)
        : []),
    ];

    // Registry documents first: a set of filed accounts outranks a brochure,
    // and the document budget below should buy the most authoritative reading.
    // Written as a real comparator rather than a one-sided test, which sorts
    // inconsistently and leaves the order implementation-defined.
    const authorityRank = { regulator: 0, organisation: 1, supporting: 2, discovery: 3 } as const;
    const ordered = [...discovered].sort(
      (a, b) => authorityRank[a.authority] - authorityRank[b.authority],
    );
    let documentsParsed = 0;

    for (const document of ordered.slice(0, maxDocuments)) {
      const result = await this.documents.ingestDiscovered(ctx, document);

      if ("skipped" in result) {
        documentReports.push({ title: document.title, status: "skipped", note: result.skipped, candidates: 0 });
        continue;
      }

      if (result.parse.status === "parsed") documentsParsed += 1;
      candidates.push(...result.candidates);
      documentReports.push({
        title: result.title,
        status: result.parse.status,
        note: result.parse.note,
        candidates: result.candidates.length,
      });
    }

    if (discovered.length > maxDocuments) {
      // A silent cap reads as "we looked at everything". It is not.
      limitations.push(
        `${discovered.length} documents were found and the first ${maxDocuments} were read. ` +
          "The rest are listed and can be read on request.",
      );
    }

    // --- Reconcile -------------------------------------------------------
    await repo.onboarding.updateRun(ctx, run.id, { stage: "reconciliation" });
    const reconciliation = reconcile(candidates);

    await repo.onboarding.saveSources(ctx, run.id, sources);
    await repo.onboarding.saveCandidates(ctx, run.id, candidates);

    const counts = {
      sourcesDiscovered: sources.length,
      pagesRead,
      documentsFound: discovered.length,
      documentsParsed,
      candidatesFound: candidates.length,
      conflicts: reconciliation.conflicts.length,
    };

    // A run with nothing in it is reported as degraded, because "we found
    // nothing" and "we could not look" are different things to a user and only
    // one of them means their website has a problem.
    const degraded =
      candidates.length === 0
        ? {
            reason: "Pegasus could not establish anything about your organisation from public sources.",
            guidance:
              "That is usually a website Pegasus cannot read rather than anything wrong. " +
              "You can enter your details directly, or upload a recent report.",
          }
        : undefined;

    await repo.onboarding.updateRun(ctx, run.id, {
      stage: "review",
      status: "awaiting_review",
      counts,
      degraded,
      completedAt: now().toISOString(),
    });

    const stored = (await repo.onboarding.getRun(ctx, run.id))!;

    return {
      run: stored,
      identity,
      sources,
      candidates,
      reconciliation,
      documents: documentReports,
      limitations,
    };
  }
}
