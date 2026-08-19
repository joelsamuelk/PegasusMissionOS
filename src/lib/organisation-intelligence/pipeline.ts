import { authorityFor, pagePriority } from "./authority";
import { classifyDocument, classifyPage } from "./classify";
import { extractFromPage } from "./extract";
import { reconcile } from "./reconcile";
import { isSameSite, looksLikeDocument, normaliseUrl } from "./url";
import type {
  PageFetcher,
  PageKind,
  ProfileCandidate,
  ReconciliationResult,
  ResearchSource,
} from "./types";

/**
 * Website research pipeline.
 *
 * DISCOVER → FETCH → CLASSIFY → EXTRACT → DEDUPLICATE → RECONCILE
 *
 * Structured deliberately rather than handed to one large prompt. Every stage
 * degrades independently: a page that fails to fetch is recorded as failed and
 * the run continues, so a single broken link never costs the organisation its
 * onboarding.
 */

export interface ResearchProgress {
  stage:
    | "resolving"
    | "discovering"
    | "fetching"
    | "extracting"
    | "reconciling"
    | "complete";
  message: string;
  /** Real counts from the run, never fabricated progress. */
  pagesFound?: number;
  pagesFetched?: number;
  candidatesFound?: number;
}

export interface ResearchOptions {
  organisationId: string;
  websiteUrl: string;
  fetcher: PageFetcher;
  now: () => Date;
  makeId: (prefix: string) => string;
  /** Hard cap on pages fetched. Keeps crawling polite and bounded. */
  maxPages?: number;
  onProgress?: (progress: ResearchProgress) => void;
}

export interface ResearchOutcome {
  sources: ResearchSource[];
  candidates: ProfileCandidate[];
  reconciliation: ReconciliationResult;
  /** Set when the site could not be researched at all (see §45 fallback). */
  degraded?: { reason: string; guidance: string };
}

/** Extract in-page links with their anchor text. */
function linksFrom(html: string, baseUrl: string): { url: string; text: string }[] {
  const anchors = html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const results: { url: string; text: string }[] = [];

  for (const anchor of anchors) {
    const href = anchor.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = normaliseUrl(href, baseUrl);
    if (!url) continue;
    const text = anchor
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ url, text });
  }
  return results;
}

export async function researchWebsite(
  options: ResearchOptions,
): Promise<ResearchOutcome> {
  const {
    organisationId,
    websiteUrl,
    fetcher,
    now,
    makeId,
    maxPages = 12,
    onProgress,
  } = options;

  const report = (progress: ResearchProgress) => onProgress?.(progress);
  const sources: ResearchSource[] = [];
  const candidates: ProfileCandidate[] = [];

  const root = normaliseUrl(websiteUrl);
  if (!root) {
    return {
      sources: [],
      candidates: [],
      reconciliation: { agreed: [], conflicts: [] },
      degraded: {
        reason: "That website address could not be read.",
        guidance:
          "Check the address, or continue with a short guided setup instead. Nothing is lost either way.",
      },
    };
  }

  report({ stage: "discovering", message: "Looking at your website" });

  const homepage = await fetcher.fetch(root);
  if (!homepage || homepage.status >= 400) {
    // §45: no website, blocked crawling and unreachable sites all land here,
    // and all fall back to guided onboarding rather than an error state.
    return {
      sources: [
        {
          id: makeId("src"),
          organisationId,
          type: "website",
          url: root,
          authority: "organisation",
          discoveredAt: now().toISOString(),
          extractionStatus: "failed",
          failureReason: homepage
            ? `Responded ${homepage.status}`
            : "Could not be reached",
        },
      ],
      candidates: [],
      reconciliation: { agreed: [], conflicts: [] },
      degraded: {
        reason: "We could not read your website just now.",
        guidance:
          "That is not a problem. We will build your profile with a short guided setup, and you can point Pegasus at your site again later.",
      },
    };
  }

  // --- DISCOVER --------------------------------------------------------
  const discovered = new Map<string, { url: string; kind: PageKind; text: string }>();
  discovered.set(root, { url: root, kind: "home", text: "" });

  for (const link of linksFrom(homepage.html, root)) {
    if (!isSameSite(link.url, root)) continue;
    if (discovered.has(link.url)) continue;
    const kind = looksLikeDocument(link.url)
      ? "reports"
      : classifyPage(link.url, link.text);
    discovered.set(link.url, { url: link.url, kind, text: link.text });
  }

  // Highest-value pages first, so the page budget buys the most context.
  const queue = [...discovered.values()]
    .sort((a, b) => pagePriority(b.kind) - pagePriority(a.kind))
    .slice(0, maxPages);

  report({
    stage: "fetching",
    message: `Found ${discovered.size} pages worth reading`,
    pagesFound: discovered.size,
  });

  // --- FETCH + EXTRACT --------------------------------------------------
  let fetched = 0;

  for (const page of queue) {
    const isDocument = looksLikeDocument(page.url);
    const type = isDocument ? classifyDocument(page.url, page.text) : "website";
    const source: ResearchSource = {
      id: makeId("src"),
      organisationId,
      type,
      title: page.text || undefined,
      url: page.url,
      authority: authorityFor(type, isSameSite(page.url, root)),
      discoveredAt: now().toISOString(),
      extractionStatus: "discovered",
      metadata: { pageKind: page.kind },
    };

    // Document parsing is Phase 4. Record the source so it is not lost, and
    // skip extraction rather than pretending to have read it.
    if (isDocument) {
      source.extractionStatus = "skipped";
      source.failureReason = "Document extraction is not enabled yet.";
      sources.push(source);
      continue;
    }

    const result = page.url === root ? homepage : await fetcher.fetch(page.url);
    if (!result || result.status >= 400) {
      source.extractionStatus = "failed";
      source.failureReason = result ? `Responded ${result.status}` : "Could not be reached";
      sources.push(source);
      continue;
    }

    fetched += 1;
    source.retrievedAt = result.retrievedAt;
    source.extractionStatus = "fetched";

    const extracted = extractFromPage({
      source,
      html: result.html,
      organisationId,
      extractedAt: now().toISOString(),
      makeId: () => makeId("cand"),
    });

    source.extractionStatus = "extracted";
    candidates.push(...extracted);
    sources.push(source);
  }

  report({
    stage: "extracting",
    message: `Read ${fetched} pages`,
    pagesFound: discovered.size,
    pagesFetched: fetched,
    candidatesFound: candidates.length,
  });

  // --- RECONCILE --------------------------------------------------------
  report({ stage: "reconciling", message: "Checking what your sources agree on" });
  const reconciliation = reconcile(candidates);

  report({
    stage: "complete",
    message: "Draft profile ready for your review",
    pagesFound: discovered.size,
    pagesFetched: fetched,
    candidatesFound: candidates.length,
  });

  return { sources, candidates, reconciliation };
}
