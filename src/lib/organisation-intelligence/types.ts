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
  /** A field returned by an official register, read from its API response. */
  | "registry"
  /** A labelled statement located in a parsed document, with a page or row. */
  | "document"
  | "ai";

/**
 * What an extracted value is about.
 *
 * Names are **singular where the thing repeats**: an organisation has several
 * programmes, so each one is its own candidate with its own source and its own
 * review decision. Packing a list into one candidate would mean approving five
 * programmes on the strength of the one you checked, and would leave four of
 * them without a locator.
 */
export type CandidateField =
  // Identity
  | "legalName"
  | "tradingName"
  | "websiteUrl"
  | "description"
  | "yearFounded"
  | "registrationNumber"
  | "companyNumber"
  | "organisationType"
  | "contactEmail"
  | "contactPhone"
  | "registeredAddress"
  | "logoUrl"
  // Mission and strategy
  | "missionStatement"
  | "vision"
  | "value"
  | "strategicPriority"
  // Reach
  | "communityServed"
  | "operatingRegions"
  | "geography"
  // Delivery
  | "programme"
  | "service"
  // People
  | "leader"
  | "trustee"
  // Network
  | "funder"
  | "partner"
  // Measurement
  | "outcome"
  | "indicator"
  | "impactFramework"
  // Finance
  | "annualIncome"
  | "annualExpenditure"
  | "financialYearEnd"
  // Governance
  | "policy"
  | "safeguardingStatus"
  | "regulatorStatus"
  // Publications
  | "report";

/**
 * Where an approved candidate lands.
 *
 * The distinction the review UI depends on: confirming a mission statement
 * writes a profile field, confirming a programme proposes a *node* in the
 * Mission Graph, and confirming an income figure records something we know
 * about the organisation without either. Treating all three the same is how a
 * review screen ends up creating twenty programmes nobody agreed to.
 */
export type CandidateTarget = "profile" | "graph_entity" | "fact";

export const FIELD_TARGETS: Record<CandidateField, CandidateTarget> = {
  legalName: "profile",
  tradingName: "profile",
  websiteUrl: "profile",
  description: "profile",
  yearFounded: "profile",
  registrationNumber: "profile",
  companyNumber: "profile",
  organisationType: "profile",
  contactEmail: "profile",
  contactPhone: "profile",
  registeredAddress: "profile",
  logoUrl: "profile",
  missionStatement: "profile",
  vision: "profile",
  value: "profile",
  strategicPriority: "graph_entity",
  communityServed: "profile",
  operatingRegions: "profile",
  geography: "profile",
  programme: "graph_entity",
  service: "graph_entity",
  leader: "fact",
  trustee: "profile",
  funder: "graph_entity",
  partner: "graph_entity",
  outcome: "graph_entity",
  indicator: "graph_entity",
  impactFramework: "fact",
  annualIncome: "fact",
  annualExpenditure: "fact",
  financialYearEnd: "profile",
  policy: "profile",
  safeguardingStatus: "profile",
  regulatorStatus: "fact",
  report: "graph_entity",
};

/** Human labels. The review screen never shows a camelCase field name. */
export const FIELD_LABELS: Record<CandidateField, string> = {
  legalName: "Legal name",
  tradingName: "Working name",
  websiteUrl: "Website",
  description: "Description",
  yearFounded: "Year founded",
  registrationNumber: "Charity number",
  companyNumber: "Company number",
  organisationType: "Organisation type",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  registeredAddress: "Registered address",
  logoUrl: "Logo",
  missionStatement: "Mission",
  vision: "Vision",
  value: "Value",
  strategicPriority: "Strategic priority",
  communityServed: "Community served",
  operatingRegions: "Operating regions",
  geography: "Geography",
  programme: "Programme",
  service: "Service",
  leader: "Leadership",
  trustee: "Trustee",
  funder: "Funder",
  partner: "Partner",
  outcome: "Outcome",
  indicator: "Indicator",
  impactFramework: "Impact framework",
  annualIncome: "Annual income",
  annualExpenditure: "Annual expenditure",
  financialYearEnd: "Financial year end",
  policy: "Policy",
  safeguardingStatus: "Safeguarding",
  regulatorStatus: "Regulator status",
  report: "Report",
};

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
  /** Set when the value came from an uploaded or discovered document. */
  documentId?: string;
  documentVersionId?: string;
  /** The sentence as it appeared, so a reviewer checks the claim not the label. */
  excerpt?: string;
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
