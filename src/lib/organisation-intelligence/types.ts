import type { VerificationState } from "@/types/domain";

/**
 * Organisation Intelligence domain model.
 *
 * The pipeline that populates it is deliberately staged rather than a single
 * prompt: discover → fetch → classify → extract → sanitise → deduplicate →
 * reconcile → review. Everything in this module is pure data.
 */

// --- Sources -------------------------------------------------------------

/**
 * How much authority a source carries. Ordinal: a general web page is never
 * treated as equivalent to a regulator record or audited accounts.
 */
export type SourceAuthority = "regulator" | "organisation" | "supporting" | "discovery";

export type SourceType =
  | "website"
  | "regulator"
  | "annual_report"
  | "impact_report"
  | "accounts"
  | "strategy"
  | "evaluation"
  | "funder"
  | "partner"
  | "government"
  | "research"
  | "news"
  | "other";

export type ExtractionStatus =
  | "discovered"
  | "fetched"
  | "extracted"
  | "failed"
  | "skipped";

export interface ResearchSource {
  id: string;
  organisationId: string;
  type: SourceType;
  title?: string;
  /** Normalised absolute URL. Deduplication key. */
  url: string;
  publisher?: string;
  authority: SourceAuthority;
  discoveredAt: string;
  retrievedAt?: string;
  publishedAt?: string;
  /** Detects change on re-crawl without reprocessing everything. */
  contentHash?: string;
  extractionStatus: ExtractionStatus;
  /** Why retrieval or extraction did not complete. */
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

// --- Page classification -------------------------------------------------

export type PageKind =
  | "home"
  | "about"
  | "mission"
  | "programmes"
  | "impact"
  | "reports"
  | "financials"
  | "governance"
  | "team"
  | "partners"
  | "funders"
  | "news"
  | "contact"
  | "policies"
  | "careers"
  | "unknown";

// --- Extraction ----------------------------------------------------------

/**
 * How a value was obtained. Structured markup is unambiguous and needs no
 * model; `ai` is reserved for semantic interpretation and is not used by the
 * deterministic extractors in this slice.
 */
export type ExtractionMethod =
  | "json-ld"
  | "microdata"
  | "meta"
  | "heading"
  | "pattern"
  | "ai";

/** Profile fields the pipeline can currently populate. */
export type CandidateField =
  | "legalName"
  | "tradingName"
  | "websiteUrl"
  | "description"
  | "missionStatement"
  | "yearFounded"
  | "registrationNumber"
  | "contactEmail"
  | "contactPhone"
  | "registeredAddress"
  | "operatingRegions"
  | "logoUrl";

/**
 * A single extracted fact, before any human has seen it.
 *
 * `confidence` and `verificationState` are deliberately separate (see
 * ORGANISATION_INTELLIGENCE.md §4). Confidence describes how sure the
 * *extractor* is that the source says this. Verification describes whether the
 * *organisation* has confirmed it. High confidence never auto-promotes.
 */
export interface ProfileCandidate {
  id: string;
  organisationId: string;
  field: CandidateField;
  value: string;
  /** 0..1 — extractor certainty, never a truth claim. */
  confidence: number;
  method: ExtractionMethod;
  sourceId: string;
  sourceUrl: string;
  authority: SourceAuthority;
  /** Where in the source this came from, e.g. "json-ld:Organization.name". */
  locator: string;
  extractedAt: string;
  verificationState: VerificationState;
  /**
   * Set when the source text contained instruction-shaped content. Forces
   * human review regardless of confidence.
   */
  injectionSuspected?: boolean;
}

// --- Conflicts -----------------------------------------------------------

export interface CandidateConflict {
  field: CandidateField;
  candidates: ProfileCandidate[];
  /** The candidate Pegasus recommends, chosen by authority then agreement. */
  recommended: ProfileCandidate;
  /** Human-readable justification, always shown rather than implied. */
  reason: string;
}

export interface ReconciliationResult {
  /** Fields where every source agrees (or only one source spoke). */
  agreed: ProfileCandidate[];
  /** Fields where sources materially disagree. Never auto-resolved. */
  conflicts: CandidateConflict[];
}

// --- Fetching ------------------------------------------------------------

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
  contentType?: string;
  retrievedAt: string;
}

/**
 * The network port.
 *
 * Injected rather than imported so the standard test suite runs against
 * fixtures and never touches a live website. A real implementation (Phase 2)
 * adds robots.txt compliance, rate limiting and redirect handling behind this
 * same interface.
 */
export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage | null>;
}
