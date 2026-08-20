/**
 * Pegasus Mission OS domain model.
 *
 * These types describe the organisation-scoped operating system. Every
 * organisation-owned record carries an `organisationId`, plus audit stamps.
 * The mock store (src/features/store) and the Supabase schema
 * (supabase/migrations) both conform to this model.
 */

// --- Shared primitives ---------------------------------------------------

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD or full ISO timestamp

/** Trust state shown against every profile field and data point. */
export type VerificationState =
  | "verified"
  | "provided"
  | "ai_extracted"
  | "needs_review"
  | "outdated";

export interface AuditStamp {
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy?: UUID;
  updatedBy?: UUID;
  archivedAt?: ISODate | null;
}

/**
 * A value with an attached trust state.
 *
 * `Attested<T>` is the **read projection of a claim**. Where `claimId` is set,
 * the claim is the source of truth and this record is a denormalised copy for
 * display; where it is absent, the inline value is all there is. That fallback
 * is what lets the ~25 profile fields migrate onto claims one at a time rather
 * than in a single irreversible commit.
 *
 * `source` is a free-text note and is **deprecated**: a string cannot be joined,
 * traversed or counted, so it can never answer "where did this come from?"
 * beyond displaying itself. Use `claimId` and the claim's `sources`.
 */
export interface Attested<T> {
  value: T;
  verification: VerificationState;
  /** @deprecated Free text. Use `claimId` → `Claim.sources`. */
  source?: string;
  lastVerifiedAt?: ISODate;
  /** When set, the claim is authoritative and this value is a projection. */
  claimId?: UUID;
}

/**
 * Every entity the Mission Graph can point at.
 *
 * Some of these are not implemented yet (`meeting`, `donation`, `campaign`,
 * `partnership`, `event`). They are listed because `EntityReference` is what
 * records the edges, and an edge recorded today should not need a migration
 * when the entity on the other end arrives.
 */
export type EntityType =
  | "organisation"
  | "organisation_profile_field"
  | "external_organisation"
  | "person"
  | "relationship"
  | "user"
  | "claim"
  | "document"
  | "document_version"
  | "extracted_claim"
  | "onboarding_run"
  | "research_source"
  | "report"
  | "funder"
  | "funding_opportunity"
  | "application"
  | "application_answer"
  | "grant"
  | "grant_payment"
  | "grant_deliverable"
  | "grant_report"
  | "programme"
  | "outcome"
  | "indicator"
  | "indicator_measurement"
  | "evidence"
  | "impact_report"
  | "reporting_requirement"
  | "task"
  | "commitment"
  | "interaction"
  | "meeting"
  | "donation"
  | "campaign"
  | "partnership"
  | "event"
  // Finance. `finance-intelligence/types.ts` anticipated this collapse rather
  // than competing with it; these are the kinds its statements point at.
  | "transaction"
  | "allocation"
  | "fund"
  | "budget"
  | "budget_line"
  | "workstream"
  | "activity"
  | "output"
  | "strategic_priority"
  | "funding_need"
  | "assumption"
  | "statement"
  | "period";

/**
 * A pointer to any Mission Graph entity.
 *
 * `label` is a denormalised display convenience only. It is never the source of
 * truth and must not be used for matching.
 */
export interface EntityReference {
  type: EntityType;
  id: UUID;
  label?: string;
}

// --- The Relation primitive ---------------------------------------------

/**
 * The shipped edge vocabulary.
 *
 * Open, like `RelationshipRole`, and for the same reason: a tenant-specific
 * edge should not require a migration. Known kinds carry structural meaning
 * and are the only ones traversal follows, so an unrecognised kind is inert
 * rather than dangerous — it records a connection without asserting one.
 */
export type KnownRelationKind =
  /** The results chain: activity → output → outcome → outcome. */
  | "contributes_to"
  /** Evidence supports a measurement, an indicator, an outcome, a claim. */
  | "evidences"
  /** An indicator measures an outcome. */
  | "measures"
  /** A funder requirement points at what it asked for. */
  | "requires"
  /** A fund or grant funds a programme or activity. */
  | "funds"
  /** An allocation attributes money to delivery. */
  | "allocated_to"
  /** Money is held in a fund. */
  | "held_in"
  /** A strategic priority owns a programme or a funding need. */
  | "pursues"
  /** Generic derivation, where no more specific kind applies. */
  | "derived_from"
  /** A relationship's edge into the graph. Qualified by `role`. */
  | "party_to";

export type RelationKind = KnownRelationKind | (string & {});

/**
 * A cross-domain edge, recorded as a record rather than implied by a column.
 *
 * The rule for choosing between this and a foreign key: if an edge is
 * single-meaning, always present and read on every page load, it is a foreign
 * key (`indicator.outcomeId`, `grant.applicationId`). `Relation` is for edges
 * whose **existence is itself information** — this output contributes to that
 * outcome, this evidence supports that measurement, this funder requires that
 * indicator. Those are many-to-many, semantically varied, and would otherwise
 * become a sprawl of one-purpose join tables.
 *
 * Both endpoints must belong to `organisationId`. That is enforced on write
 * rather than assumed, because this is the first table in the model where a
 * row can point at anything: a tenant check on the row alone would let an edge
 * reach across the boundary while looking correctly scoped.
 */
export interface Relation {
  id: UUID;
  organisationId: UUID;
  from: EntityReference;
  to: EntityReference;
  kind: RelationKind;
  /**
   * A qualifier within the kind. For `party_to` it carries the
   * `RelationshipRole`; for `contributes_to` it is normally absent.
   */
  role?: string;
  /**
   * Weighting, 0..1, for attributions that are not whole. Deliberately
   * optional and deliberately not defaulted to 1: "we did not say" and "we
   * said all of it" are different statements, and defaulting would silently
   * convert the first into the second.
   */
  weight?: number;
  note?: string;
  /** The edge's own trust state. An asserted link is not a verified one. */
  attested?: Attested<null>;
  audit: AuditStamp;
}

// --- Knowledge: sources, claims, derivation -----------------------------

/**
 * How far a statement stands from a record.
 *
 *   FACT           we hold a record of this
 *   CALCULATION    we derived this from records, by a method we can show
 *   INFERENCE      we reasoned this from records; the reasoning is not arithmetic
 *   ASSUMPTION     we had to assume this to produce the above
 *   HYPOTHESIS     we are proposing this to be tested; it is not yet believed
 *   FORECAST       we projected this forward; it has not happened
 *   RECOMMENDATION we suggest you act
 *
 * Introduced by Finance Intelligence and promoted here, because the
 * distinction is not a finance concern: it applies to anything Pegasus asserts.
 * The kind is part of the model, not UI copy, so a recommendation cannot be
 * rendered without the chain it stands on.
 *
 * `inference` and `hypothesis` were added by MG-1. They are distinct from their
 * neighbours in a way that matters:
 *
 * - An **inference** differs from a calculation in what it can offer as proof.
 *   A calculation shows its arithmetic; an inference can only show what it
 *   reasoned from. "This funder favours youth work" inferred from six past
 *   awards is not a calculation, and labelling it one implies a check that
 *   cannot be performed.
 * - A **hypothesis** differs from an assumption in direction. An assumption is
 *   adopted so that work can proceed and is believed until contradicted; a
 *   hypothesis is advanced *in order to be tested* and is not yet believed at
 *   all. Collapsing the two lets a proposal be reported as a working premise.
 */
export type ClaimKind =
  | "fact"
  | "calculation"
  | "inference"
  | "assumption"
  | "hypothesis"
  | "forecast"
  | "recommendation";

/**
 * How authoritative a source is. Ordinal — a random webpage is never equivalent
 * to audited accounts, and reconciliation depends on being able to say so.
 */
export type SourceAuthority = "regulator" | "organisation" | "supporting" | "discovery";

/** Where a claim's grounding physically came from. */
export interface ClaimSource {
  ref: EntityReference;
  authority: SourceAuthority;
  /** Where *within* the source: "page 14", "json-ld:Organization.name", "row 402". */
  locator?: string;
  retrievedAt?: ISODate;
}

/**
 * How a claim came to exist.
 *
 * A discriminated union rather than a free string, because the producer
 * determines what evidence of correctness is even possible: a calculation can
 * show its workings, an extraction can show a locator, a model can show a
 * prompt version, and a human can be asked.
 */
export type ClaimProducer =
  | { method: "human"; actorId: UUID }
  | { method: "extraction"; extractionMethod: string; sourceId: UUID }
  | { method: "calculation"; function: string; version: string }
  | { method: "model"; provider: string; model: string; promptVersion: string };

export type ClaimValue =
  | { type: "text"; text: string }
  | { type: "number"; number: number; unit?: string }
  | { type: "money"; minorUnits: number; currency: string }
  | { type: "date"; date: ISODate }
  | { type: "boolean"; boolean: boolean }
  | { type: "list"; items: string[] };

/**
 * A first-class assertion.
 *
 * Claims are **immutable**. A correction creates a new claim carrying
 * `supersedes`; nothing is edited in place. That is what makes `ClaimUsage`
 * honest — a report published in March cites the claim as it stood in March,
 * and the drill-down can show both that claim and its successor.
 */
export interface Claim {
  id: UUID;
  organisationId: UUID;

  /** What the claim is about. */
  subject: EntityReference;
  /** Which aspect: "participants_supported", "mission_statement", "funding_gap". */
  predicate: string;
  value: ClaimValue;
  /** Human-readable rendering, for display and for AI grounding. */
  text: string;

  kind: ClaimKind;
  /** Organisational trust status. Orthogonal to `kind` and to `confidence`. */
  verification: VerificationState;
  /**
   * How sure the *producer* is that the source says this, 0..1.
   * Never promotes `verification` — see `lib/knowledge/verify.ts`.
   */
  confidence?: number;

  sources: ClaimSource[];
  /** Records this claim draws on. */
  derivedFrom: EntityReference[];
  /** Other claims this one stands on. Traversed by `traceClaim`. */
  supportedBy: UUID[];

  producedBy: ClaimProducer;
  /** For calculations: the arithmetic, written so a human can check it. */
  workings?: string;
  assumptions: string[];
  caveats: string[];

  validFrom?: ISODate;
  validUntil?: ISODate;
  periodLabel?: string;

  supersedes?: UUID;
  supersededBy?: UUID;
  conflictsWith: UUID[];

  verifiedBy?: UUID;
  verifiedAt?: ISODate;

  audit: AuditStamp;
}

/**
 * Where a claim has been used.
 *
 * The reverse index that makes "where did this £420,000 come from?" and "what
 * breaks if this number is wrong?" the same query in opposite directions.
 */
export interface ClaimUsage {
  id: UUID;
  organisationId: UUID;
  claimId: UUID;
  usedIn: EntityReference;
  /** "report section: executive_summary", "answer: ans-h2". */
  context?: string;
  usedAt: ISODate;
}

/** Two claims about the same subject and predicate that disagree. */
export interface ClaimConflict {
  id: UUID;
  organisationId: UUID;
  claimIds: UUID[];
  subject: EntityReference;
  predicate: string;
  reason: string;
  /** Recommended claim, by authority then recency. Never auto-applied. */
  recommendedClaimId?: UUID;
  recommendationReason?: string;
  resolvedClaimId?: UUID;
  resolvedBy?: UUID;
  resolvedAt?: ISODate;
  createdAt: ISODate;
}

// --- People, organisations, membership ----------------------------------

export type MemberRole =
  | "owner"
  | "administrator"
  | "funding_lead"
  | "programme_lead"
  | "finance_contributor"
  | "trustee_reviewer"
  | "contributor";

export interface User {
  id: UUID;
  name: string;
  email: string;
  jobTitle?: string;
  avatarInitials: string;
}

export interface OrganisationMember {
  id: UUID;
  organisationId: UUID;
  userId: UUID;
  role: MemberRole;
  status: "active" | "invited" | "suspended";
  invitedAt?: ISODate;
  joinedAt?: ISODate;
}

export type OrganisationType =
  | "charity"
  | "cic"
  | "foundation"
  | "social_enterprise"
  | "ngo"
  | "community_group";

export interface Organisation {
  id: UUID;
  name: string;
  legalName: string;
  type: OrganisationType;
  charityNumber?: string;
  companyNumber?: string;
  yearFounded?: number;
  website?: string;
  registeredAddress?: string;
  operatingRegions: string[];
  organisationSize?: string;
  annualIncomeBand?: string;
  isDemo: boolean;
  aiEnabled: boolean;
  audit: AuditStamp;
}

export interface OrganisationProfile {
  organisationId: UUID;
  // Mission
  missionStatement: Attested<string>;
  vision: Attested<string>;
  summary: Attested<string>;
  coreActivities: Attested<string[]>;
  strategicPriorities: Attested<string[]>;
  communitiesServed: Attested<string[]>;
  geographicReach: Attested<string>;
  // Governance
  trustees: Attested<string[]>;
  keyPolicies: Attested<string[]>;
  safeguardingStatus: Attested<string>;
  dataProtectionStatus: Attested<string>;
  insuranceStatus: Attested<string>;
  financialYearEnd: Attested<string>;
  auditors: Attested<string>;
  // Funding profile
  typicalFundingRequirement: Attested<string>;
  preferredFundingTypes: Attested<string[]>;
  restrictedNeeds: Attested<string>;
  unrestrictedNeeds: Attested<string>;
  pastFunders: Attested<string[]>;
  matchFundingAvailable: Attested<string>;
}

// --- Strategy -----------------------------------------------------------

/**
 * What the organisation is trying to achieve, as a node.
 *
 * Promoted from `OrganisationProfile.strategicPriorities: Attested<string[]>`,
 * which could describe a priority but could not connect one to anything. A
 * priority that cannot own a programme or a funding need cannot answer "which
 * programmes depend on funding ending this year?" or "what would happen if
 * this funder did not renew?" — both of which are traversals from strategy
 * down through delivery to money.
 *
 * The profile field remains as the `Attested<T>` projection, so the migration
 * is field-by-field rather than a single irreversible commit.
 */
export interface StrategicPriority {
  id: UUID;
  organisationId: UUID;
  title: string;
  description?: string;
  /** Where this sits in the strategy period, e.g. "2026-2029". */
  periodLabel?: string;
  order: number;
  status: "proposed" | "active" | "achieved" | "paused" | "retired";
  ownerId?: UUID;
  /** The claim that carries this priority's provenance, where one exists. */
  claimId?: UUID;
  audit: AuditStamp;
}

// --- Documents ----------------------------------------------------------

/**
 * Document ingestion.
 *
 * The rule that shapes all four types below: **an uploaded file is not
 * arbitrary AI context.** A charity's annual report is a governance record,
 * and handing it to a model as a blob of text loses the two things that make
 * its contents usable — where a statement sat in the document, and whether
 * anyone has stood behind it.
 *
 * So the path is parse → structure → review → approve, and it is the same path
 * a website takes. `ExtractedClaim` is the join: nothing reaches the
 * organisation's profile without passing through a human, whatever it was
 * extracted from.
 */

export type DocumentFormat = "pdf" | "docx" | "csv" | "xlsx" | "txt" | "html" | "unknown";

/**
 * What the document is, which decides how much authority its contents carry.
 *
 * Deliberately the same vocabulary as `SourceType` in Organisation
 * Intelligence: a set of accounts is a set of accounts whether it was found on
 * a website or uploaded by the finance officer.
 */
export type DocumentKind =
  | "annual_report"
  | "impact_report"
  | "accounts"
  | "strategy"
  | "evaluation"
  | "policy"
  | "governance"
  | "funding_agreement"
  | "data_export"
  | "other";

/** How the file reached Mission OS. */
export type DocumentOrigin = "upload" | "website_discovery" | "registry" | "integration";

/**
 * A canonical document, independent of any single file.
 *
 * The document is the *thing* — "our 2025 annual report". The bytes are a
 * `DocumentVersion`. Separating them is what lets a re-uploaded corrected
 * report supersede the old one without orphaning every claim extracted from
 * it, and what lets a re-crawl notice that a published PDF has changed.
 */
export interface Document {
  id: UUID;
  organisationId: UUID;
  title: string;
  kind: DocumentKind;
  description?: string;
  /** Period the document covers, where it states one. */
  reportingPeriod?: string;
  /** The version currently treated as authoritative. */
  currentVersionId?: UUID;
  /**
   * Sensitivity, declared rather than inferred. Documents are the most likely
   * route for beneficiary or personal data to enter the product, and the
   * default must not be "share with a model".
   */
  containsPersonalData: boolean;
  tags: string[];
  audit: AuditStamp;
}

export type DocumentParseStatus =
  | "pending"
  | "parsed"
  /** Read, but the text recovered was not good enough to extract from. */
  | "unreadable"
  | "unsupported_format"
  | "failed";

/**
 * One set of bytes, and what could be recovered from them.
 *
 * `parseStatus` is deliberately five-valued rather than a boolean.
 * "We have not read this yet", "we cannot read this format", "we read it and
 * the text was garbage" and "it failed" are four different statements to a
 * user deciding whether to re-upload, and collapsing them into `false` is how
 * a product ends up silently ignoring a document someone believes it has read.
 */
export interface DocumentVersion {
  id: UUID;
  organisationId: UUID;
  documentId: UUID;
  version: number;
  format: DocumentFormat;
  fileName: string;
  fileSizeBytes: number;
  /** Content hash. Re-uploading identical bytes is not a new version. */
  contentHash: string;
  /** Where the bytes live. Absent while storage is not configured. */
  storageKey?: string;
  parseStatus: DocumentParseStatus;
  /** Why parsing did not produce usable text. Always set when it did not. */
  parseNote?: string;
  /** Recovered plain text. Never the raw file, and never sent anywhere by default. */
  textContent?: string;
  pageCount?: number;
  wordCount?: number;
  uploadedBy?: UUID;
  createdAt: ISODate;
}

/**
 * Where a document came from, as a record rather than a field.
 *
 * A document can legitimately have more than one: found on the website *and*
 * later uploaded by a person, or published by a regulator *and* mirrored on
 * the organisation's own site. Each arrival carries its own authority and its
 * own retrieval time, and merging them into one column loses the distinction
 * that reconciliation depends on.
 */
export interface DocumentSource {
  id: UUID;
  organisationId: UUID;
  documentId: UUID;
  versionId?: UUID;
  origin: DocumentOrigin;
  authority: SourceAuthority;
  url?: string;
  publisher?: string;
  retrievedAt: ISODate;
  /** The research source this arrived through, where there was one. */
  researchSourceId?: UUID;
}

/**
 * A candidate fact recovered from a document, before anyone has seen it.
 *
 * Distinct from `Claim`, and the distinction is the whole point: a `Claim` is
 * something the organisation asserts, an `ExtractedClaim` is something a
 * machine thinks a document says. The transition between them is a human
 * decision, recorded in `reviewedBy`.
 */
export interface ExtractedClaim {
  id: UUID;
  organisationId: UUID;
  documentId: UUID;
  versionId: UUID;
  /** What aspect this speaks to, e.g. "missionStatement", "totalIncome". */
  predicate: string;
  value: ClaimValue;
  /** The sentence or cell as it appeared, so a reviewer can check it. */
  excerpt: string;
  /** Where in the document: "page 4", "sheet:Income!B12", "para 37". */
  locator: string;
  extractionMethod: string;
  /** 0..1 — extractor certainty. Never promotes verification. */
  confidence: number;
  /** Set when the excerpt contained instruction-shaped content. */
  injectionSuspected: boolean;
  status: "pending" | "approved" | "edited" | "rejected";
  /** The claim created when a human approved it. */
  claimId?: UUID;
  reviewedBy?: UUID;
  reviewedAt?: ISODate;
  createdAt: ISODate;
}

// --- Onboarding ---------------------------------------------------------

export type OnboardingStage =
  | "identity"
  | "website_research"
  | "registry_research"
  | "document_discovery"
  | "extraction"
  | "reconciliation"
  | "review"
  | "complete";

export type OnboardingRunStatus = "running" | "awaiting_review" | "complete" | "failed";

/**
 * One attempt to understand an organisation from public information.
 *
 * Persisted rather than held in a request, for a reason that is not
 * convenience: research reaches external sources, and a run that is lost on
 * refresh gets repeated. Repeating it means fetching someone's website again
 * for nothing, which is rude, and re-asking a registry, which costs money.
 */
export interface OnboardingRun {
  id: UUID;
  organisationId: UUID;
  /** What the organisation told us before any research happened. */
  input: {
    name: string;
    websiteUrl?: string;
    country?: string;
    registrationNumber?: string;
    organisationType?: OrganisationType;
  };
  stage: OnboardingStage;
  status: OnboardingRunStatus;
  startedAt: ISODate;
  completedAt?: ISODate;
  /** Real counts from the run. Never a fabricated progress percentage. */
  counts: {
    sourcesDiscovered: number;
    pagesRead: number;
    documentsFound: number;
    documentsParsed: number;
    candidatesFound: number;
    conflicts: number;
  };
  /**
   * Set when research could not proceed. The run still completes and the
   * organisation still gets a guided setup — a degraded run is not a failure
   * the user has to resolve before continuing.
   */
  degraded?: { reason: string; guidance: string };
  startedBy?: UUID;
  audit: AuditStamp;
}

// --- Evidence -----------------------------------------------------------

export type EvidenceType =
  | "document"
  | "statistic"
  | "testimonial"
  | "case_study"
  | "image"
  | "attendance"
  | "survey"
  | "evaluation"
  | "financial"
  | "policy"
  | "external_reference";

export interface EvidenceItem {
  id: UUID;
  organisationId: UUID;
  title: string;
  type: EvidenceType;
  description: string;
  verification: VerificationState;
  reportingPeriod?: string;
  location?: string;
  community?: string;
  /** For statistics. */
  statValue?: string;
  statLabel?: string;
  /** For testimonials/quotes. */
  quote?: string;
  attribution?: string;
  fileName?: string;
  fileSizeKb?: number;
  tags: string[];
  audit: AuditStamp;
}

/** Links an evidence item to programmes, grants, outcomes. */
export interface EvidenceLink {
  id: UUID;
  organisationId: UUID;
  evidenceId: UUID;
  targetType: "programme" | "grant" | "outcome" | "application_answer" | "report";
  targetId: UUID;
}

// --- Funding ------------------------------------------------------------

export interface Funder {
  id: UUID;
  organisationId: UUID;
  name: string;
  type: string;
  website?: string;
  /**
   * @deprecated Legacy flattened contact. Superseded by `Person` reached
   * through `externalOrganisationId`. Retained as a display fallback until the
   * Phase 2 backfill completes; see the migration table in
   * `docs/RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md` §3.
   */
  contactName?: string;
  /** @deprecated See `contactName`. */
  contactEmail?: string;
  notes?: string;
  /**
   * Bridge to the canonical external organisation. "Funder" is a *role* this
   * body plays; the relationship layer holds everything that is not
   * funding-specific.
   */
  externalOrganisationId?: UUID;
  isDemo: boolean;
}

export type PipelineStage =
  | "discovered"
  | "reviewing"
  | "qualified"
  | "applying"
  | "internal_review"
  | "ready_to_submit"
  | "submitted"
  | "decision_pending"
  | "successful"
  | "unsuccessful"
  | "archived";

export type FundingType = "restricted" | "unrestricted" | "core" | "project" | "capital";

export interface FundingOpportunity {
  id: UUID;
  organisationId: UUID;
  funderId: UUID;
  programmeName: string;
  description: string;
  minAward?: number;
  maxAward?: number;
  currency: string;
  deadline?: ISODate;
  fundingDurationMonths?: number;
  fundingType: FundingType;
  eligibleOrgTypes: OrganisationType[];
  eligibleLocations: string[];
  priorityThemes: string[];
  requiredDocuments: string[];
  reportingRequirements: string[];
  sourceReference?: string;
  lastVerifiedAt?: ISODate;
  ownerId?: UUID;
  stage: PipelineStage;
  probability: number; // 0..100
  nextAction?: string;
  saved: boolean;
  isDemo: boolean;
  notes?: string;
  audit: AuditStamp;
}

export interface OpportunityQuestion {
  id: UUID;
  opportunityId: UUID;
  organisationId: UUID;
  order: number;
  text: string;
  guidance?: string;
  wordLimit?: number;
  charLimit?: number;
}

// --- Fit assessment -----------------------------------------------------

export type FitCategory =
  | "strong_match"
  | "potential_match"
  | "review_required"
  | "not_eligible";

export type FactorStatus = "met" | "partial" | "uncertain" | "unmet";

export interface FitFactor {
  key: string;
  label: string;
  status: FactorStatus;
  score: number; // 0..100 contribution
  weight: number; // relative weight
  rationale: string;
  evidenceUsed: string[];
  assumptions: string[];
}

export interface FitAssessment {
  id: UUID;
  opportunityId: UUID;
  organisationId: UUID;
  overallScore: number; // 0..100
  category: FitCategory;
  eligibilityStatus: FactorStatus;
  factors: FitFactor[];
  keyRisks: string[];
  missingInformation: string[];
  recommendedNextAction: string;
  effortEstimate: "low" | "medium" | "high";
  strategicValue: "low" | "medium" | "high";
  generatedAt: ISODate;
  generatedBy: "mock" | "anthropic";
}

// --- Applications -------------------------------------------------------

export type ApplicationStatus =
  | "not_started"
  | "in_progress"
  | "internal_review"
  | "ready_to_submit"
  | "submitted"
  | "successful"
  | "unsuccessful";

export type AnswerStatus =
  | "not_started"
  | "drafting"
  | "needs_evidence"
  | "ready_for_review"
  | "changes_requested"
  | "approved";

export interface Application {
  id: UUID;
  organisationId: UUID;
  opportunityId: UUID;
  title: string;
  status: ApplicationStatus;
  ownerId?: UUID;
  contributorIds: UUID[];
  reviewerIds: UUID[];
  deadline?: ISODate;
  requiredDocuments: { name: string; provided: boolean }[];
  submissionChecklist: { label: string; done: boolean }[];
  notes?: string;
  audit: AuditStamp;
}

export interface ApplicationAnswer {
  id: UUID;
  applicationId: UUID;
  organisationId: UUID;
  order: number;
  questionText: string;
  guidance?: string;
  wordLimit?: number;
  draft: string;
  status: AnswerStatus;
  assignedTo?: UUID;
  evidenceIds: UUID[];
  /** Provenance for the most recent AI assist, if any. */
  provenance?: GroundingRecord;
  audit: AuditStamp;
}

export interface AnswerVersion {
  id: UUID;
  answerId: UUID;
  organisationId: UUID;
  content: string;
  wordCount: number;
  authorId?: UUID;
  source: "human" | "ai";
  createdAt: ISODate;
  note?: string;
}

export interface ApplicationReview {
  id: UUID;
  applicationId: UUID;
  organisationId: UUID;
  reviewerId: UUID;
  decision: "approved" | "changes_requested" | "pending";
  comment?: string;
  createdAt: ISODate;
}

// --- Grants -------------------------------------------------------------

export type GrantHealth = "on_track" | "attention" | "at_risk" | "completed";

export interface Grant {
  id: UUID;
  organisationId: UUID;
  applicationId?: UUID;
  funderId: UUID;
  title: string;
  awardValue: number;
  currency: string;
  restricted: boolean;
  startDate: ISODate;
  endDate: ISODate;
  grantManagerId?: UUID;
  funderContact?: string;
  spentToDate: number;
  conditions: string[];
  status: "active" | "completed" | "closed";
  audit: AuditStamp;
}

export interface GrantPayment {
  id: UUID;
  grantId: UUID;
  organisationId: UUID;
  label: string;
  amount: number;
  dueDate: ISODate;
  received: boolean;
}

export interface GrantDeliverable {
  id: UUID;
  grantId: UUID;
  organisationId: UUID;
  title: string;
  dueDate: ISODate;
  status: "not_started" | "in_progress" | "complete" | "overdue";
}

export interface GrantReport {
  id: UUID;
  grantId: UUID;
  organisationId: UUID;
  title: string;
  dueDate: ISODate;
  status: "not_started" | "drafting" | "submitted";
}

export type ReportingFrequency =
  | "one_off"
  | "monthly"
  | "quarterly"
  | "six_monthly"
  | "annual"
  | "on_completion";

/**
 * Something a funder asked for, as an edge rather than a sentence.
 *
 * Before this existed, "what did we promise this funder?" could only be
 * answered by reading `FundingOpportunity.reportingRequirements: string[]` and
 * `Grant.conditions: string[]` — free text that points at nothing. A
 * requirement that cannot name the outcome or indicator it wants cannot drive
 * report readiness, cannot tell you which evidence is missing, and cannot warn
 * you that the indicator it depends on has not been measured this period.
 *
 * What the requirement asks for is recorded as `Relation { kind: "requires" }`
 * edges into outcomes, indicators and outputs, not as a column here. That is
 * the point of the primitive: one funder may want two outcomes and an
 * indicator, and none of those is a foreign key.
 */
export interface ReportingRequirement {
  id: UUID;
  organisationId: UUID;
  /** Exactly one of these is set. */
  grantId?: UUID;
  opportunityId?: UUID;
  title: string;
  description?: string;
  frequency: ReportingFrequency;
  dueDate?: ISODate;
  /** Evidence types the funder specified, where they specified any. */
  evidenceTypes: EvidenceType[];
  /** Set when the requirement was taken from a funder document, not inferred. */
  sourceRef?: EntityReference;
  status: "open" | "met" | "waived" | "overdue";
  audit: AuditStamp;
}

// --- Money --------------------------------------------------------------

/**
 * The money model.
 *
 * `Money`, `FinancialTransaction` and `FinancialAllocation` were designed in
 * `lib/finance-intelligence/types.ts` and are **promoted here** by MG-1,
 * exactly as `ClaimKind` was promoted out of the same module: they are not a
 * finance concern, they are what the graph attributes. The finance library
 * re-exports them, so its nineteen calculation modules are untouched.
 *
 * Two rules govern everything below, and both come from that library:
 *
 * 1. **Money is never a float.** Integer minor units with an explicit
 *    currency. Cost-per-outcome arithmetic divides and apportions constantly,
 *    and accumulated float drift shows up as figures that do not reconcile.
 * 2. **Nothing is calculated straight from a transaction.** Money reaches
 *    delivery through a `FinancialAllocation` that records *how* it was
 *    attributed. A cost-per-participant figure is only as defensible as the
 *    allocation beneath it, so the allocation is a reviewable record and not a
 *    join.
 */

/** ISO 4217. Currency is data, not a constant. */
export type CurrencyCode = string;

export interface Money {
  /** Integer minor units (pence, cents). Never fractional. */
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
}

export type FundRestriction = "unrestricted" | "restricted" | "endowment" | "designated";

/**
 * A pot of money with a restriction attached.
 *
 * The entity the §9 acceptance chain needed and did not have. `Grant.restricted`
 * is a boolean on an award; it cannot hold a balance, cannot be spent from, and
 * cannot answer "how much unrestricted runway do we have?" — which is a
 * question about funds, not about grants.
 *
 * `designated` is distinct from `restricted` and the difference is legal rather
 * than cosmetic: a restriction is imposed by the funder and binds the charity,
 * a designation is chosen by the trustees and can be undesignated by them.
 */
export interface Fund {
  id: UUID;
  organisationId: UUID;
  name: string;
  description?: string;
  restriction: FundRestriction;
  currency: CurrencyCode;
  /** What the restriction actually says, where it is restricted. */
  restrictionPurpose?: string;
  /**
   * What the fund held before the recorded ledger begins.
   *
   * Added by MG-8, because the alternative is worse in a way that took a
   * working screen to notice: modelling an opening reserve as an income
   * transaction makes it part of the flow, and a burn rate computed over a
   * window containing it reports that income covers costs when it does not.
   * A balance brought forward is a property of the fund, not something that
   * happened during the period.
   */
  openingBalance?: Money;
  /** The grant or donation that established the fund, where there is one. */
  originRef?: EntityReference;
  openedAt?: ISODate;
  closedAt?: ISODate;
  status: "open" | "closed";
  audit: AuditStamp;
}

export type TransactionDirection = "income" | "expenditure";

export type TransactionSource = "bank_feed" | "accounting_system" | "manual" | "import";

export interface FinancialTransaction {
  id: UUID;
  organisationId: UUID;
  accountId?: UUID;
  date: ISODate;
  description: string;
  amount: Money;
  direction: TransactionDirection;
  /** Chart-of-accounts or expenditure category, as classified. */
  category?: string;
  counterparty?: string;
  /** Whether the money carries a funder restriction. */
  restricted: boolean;
  /** Set only where the transaction is unambiguously attributable. */
  grantId?: UUID;
  /** Which pot it moved into or out of. */
  fundId?: UUID;
  source: TransactionSource;
  verificationState: VerificationState;
}

/**
 * How the attribution was made. Distinct from `AllocationBasis`, which says
 * *what the apportionment was driven by*.
 */
export type AllocationMethod =
  | "direct"
  | "proportional"
  | "shared_cost"
  | "manual"
  | "suggested"
  | "unknown";

/** The driver behind a proportional or shared-cost apportionment. */
export type AllocationBasis =
  | "direct"
  | "headcount"
  | "programme_expenditure"
  | "staff_time"
  | "participant_volume"
  | "equal"
  | "custom_percentage"
  | "unallocated";

/**
 * The layer between money and delivery.
 *
 * An allocation always records its method, its basis and its confidence, so
 * that a figure built on eight estimated apportionments can never be presented
 * with the same authority as one built on eight invoices.
 */
export interface FinancialAllocation {
  id: UUID;
  organisationId: UUID;

  transactionId?: UUID;
  budgetLineId?: UUID;
  fundId?: UUID;
  programmeId?: UUID;
  grantId?: UUID;
  activityId?: UUID;
  workstreamId?: UUID;
  outcomeId?: UUID;
  strategicPriorityId?: UUID;

  amount: Money;

  allocationMethod: AllocationMethod;
  allocationBasis?: AllocationBasis;
  /** Shown next to the figure, e.g. "42% of programme expenditure". */
  allocationNote?: string;

  /** 0..1 — how well the method fits this cost. Never a truth claim. */
  confidence?: number;

  /** Whether the money was restricted at source. */
  restricted?: boolean;

  /** Date the allocation applies to; drives period roll-ups. */
  effectiveDate: ISODate;

  verificationState: VerificationState;

  createdBy?: UUID;
  verifiedBy?: UUID;
  verifiedAt?: ISODate;
}

export interface Budget {
  id: UUID;
  organisationId: UUID;
  name: string;
  /** Exactly one of these, or neither for an organisational budget. */
  programmeId?: UUID;
  grantId?: UUID;
  currency: CurrencyCode;
  periodStart: ISODate;
  /** Inclusive. */
  periodEnd: ISODate;
  status: "draft" | "approved" | "superseded";
  approvedBy?: UUID;
  approvedAt?: ISODate;
  audit: AuditStamp;
}

export interface BudgetLine {
  id: UUID;
  organisationId: UUID;
  budgetId: UUID;
  label: string;
  category?: string;
  plannedAmount: Money;
  /** What the line is for, in graph terms: an activity, an output, a workstream. */
  target?: EntityReference;
  note?: string;
}

// --- Programmes and outcomes -------------------------------------------

export interface Programme {
  id: UUID;
  organisationId: UUID;
  name: string;
  summary: string;
  status: "planning" | "active" | "paused" | "completed";
  ownerId?: UUID;
  startDate?: ISODate;
  endDate?: ISODate;
  location?: string;
  communitiesServed: string[];
  budget?: number;
  /**
   * @deprecated Free text. Superseded by the `Activity` entity, which has an
   * identity and can therefore be pointed at — by an allocation attributing
   * money to it, and by a `contributes_to` relation into an output. Retained
   * as a display fallback until the backfill completes, following the same
   * pattern as `Funder.contactName`.
   */
  activities: string[];
  /** @deprecated See `activities`. Superseded by the `Output` entity. */
  outputs: string[];
  /**
   * @deprecated Superseded by `RelationshipLink` / `Relation`, which name the
   * partner as a canonical external organisation rather than as a string.
   */
  deliveryPartners: string[];
  risks: string[];
  audit: AuditStamp;
}

export interface ProgrammeGrantLink {
  id: UUID;
  organisationId: UUID;
  programmeId: UUID;
  grantId: UUID;
}

/**
 * A unit of delivery.
 *
 * Promoted from `Programme.activities: string[]` by MG-1. The string array
 * could not participate in the graph at all: money cannot be attributed to a
 * string, and a string cannot contribute to an output. The `activities` table
 * has existed in Postgres since `0001` — this is the TypeScript model catching
 * up with the schema, not a new concept.
 */
export interface Activity {
  id: UUID;
  organisationId: UUID;
  programmeId: UUID;
  title: string;
  description?: string;
  startDate?: ISODate;
  endDate?: ISODate;
  status: "planned" | "active" | "paused" | "complete" | "cancelled";
  /** Who delivers it, where that is a named internal owner. */
  ownerId?: UUID;
  location?: string;
  audit: AuditStamp;
}

/**
 * What an activity produced, counted.
 *
 * Distinct from an `Outcome`: an output is what we did (240 sessions
 * delivered), an outcome is what changed as a result. Conflating them is the
 * most common failure in impact reporting, and it is why `Outcome.level`
 * exists as well — a programme may legitimately track both.
 */
export interface Output {
  id: UUID;
  organisationId: UUID;
  programmeId: UUID;
  title: string;
  description?: string;
  /** "sessions", "participants", "meals". */
  unit?: string;
  targetValue?: number;
  currentValue?: number;
  reportingPeriod?: string;
  audit: AuditStamp;
}

export interface Outcome {
  id: UUID;
  organisationId: UUID;
  programmeId: UUID;
  title: string;
  description: string;
  /** Impact framework level. */
  level: "output" | "outcome" | "impact";
  audit: AuditStamp;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Indicator {
  id: UUID;
  organisationId: UUID;
  outcomeId: UUID;
  name: string;
  definition: string;
  baseline: number;
  target: number;
  currentValue: number;
  unit: string;
  measurementFrequency: string;
  evidenceSource?: string;
  dataOwnerId?: UUID;
  lastUpdated?: ISODate;
  confidence: ConfidenceLevel;
  audit: AuditStamp;
}

export interface IndicatorMeasurement {
  id: UUID;
  organisationId: UUID;
  indicatorId: UUID;
  value: number;
  recordedAt: ISODate;
  note?: string;
  recordedBy?: UUID;
}

// --- Impact reports -----------------------------------------------------

export type LegacyReportSectionKey =
  | "executive_summary"
  | "organisation_overview"
  | "funding_overview"
  | "programme_summary"
  | "activities"
  | "outputs"
  | "outcomes"
  | "beneficiary_stories"
  | "financial_summary"
  | "challenges_learning"
  | "risks_mitigations"
  | "future_plans"
  | "supporting_evidence"
  | "appendix";

export type ReportType =
  | "impact"
  | "funder"
  | "grant"
  | "programme"
  | "trustee"
  | "board_pack"
  | "annual"
  | "finance"
  | "management"
  | "donor_update"
  | "partner"
  | "custom";

export type ReportStatus =
  | "draft"
  | "collecting_evidence"
  | "drafting"
  | "internal_review"
  | "changes_requested"
  | "ready_for_approval"
  | "approved"
  | "submitted"
  | "archived";

export type ReportSectionType =
  | "narrative"
  | "claims"
  | "metrics"
  | "table"
  | "chart"
  | "evidence"
  | "financial"
  | "appendix";

export interface ReportSectionDefinition {
  key: string;
  title: string;
  type: ReportSectionType;
  required: boolean;
}

export interface ReportDefinition {
  id: UUID;
  organisationId: UUID;
  name: string;
  type: ReportType;
  sections: ReportSectionDefinition[];
  /**
   * Where the template came from. A built-in is Pegasus's; an ingested one is
   * a funder's and carries the authority of the document it came from, which
   * is why readiness treats an unmet ingested requirement more seriously than
   * an unmet built-in section.
   */
  origin?: ReportTemplateOrigin;
  /** The funder this template belongs to, for an ingested one. */
  funderId?: UUID;
  /** The document it was extracted from. */
  sourceDocumentId?: UUID;
  audit: AuditStamp;
}

export interface ImpactReportSection {
  /** Stable within a report definition; no longer constrained to 14 keys. */
  key: string;
  title: string;
  type: ReportSectionType;
  content: string;
  /** Figures are references to immutable claims, never copied values. */
  claimIds: UUID[];
  provenance?: GroundingRecord;
}

export interface ImpactReport {
  id: UUID;
  organisationId: UUID;
  title: string;
  type: ReportType;
  definitionId?: UUID;
  programmeId?: UUID;
  grantId?: UUID;
  reportingPeriod: string;
  status: ReportStatus;
  ownerId?: UUID;
  contributorIds: UUID[];
  reviewerIds: UUID[];
  approverIds: UUID[];
  includedIndicatorIds: UUID[];
  includedEvidenceIds: UUID[];
  sections: ImpactReportSection[];
  audit: AuditStamp;
}

/** Generic name for new code; `ImpactReport` remains as the migration alias. */
export type Report = ImpactReport;

// --- Reporting engine (MG-5) --------------------------------------------

/**
 * The reporting engine's additions, and the rule that decided which of the
 * brief's ten entity names became tables.
 *
 * The brief lists `Report ReportVersion ReportTemplate ReportSection
 * ReportRequirement ReportContributor ReportApproval ReportClaim
 * ReportEvidenceLink ReportSnapshot`. Four of those already exist under other
 * names and adding them again would violate the architecture's own rule that
 * no module owns a concept:
 *
 * - **`ReportSection`** is `ImpactReportSection`, shipped and in use.
 * - **`ReportTemplate`** is `ReportDefinition`, extended below rather than
 *   duplicated.
 * - **`ReportClaim`** is `ImpactReportSection.claimIds` plus `ClaimUsage`,
 *   which is already the reverse index and already answers "what breaks if
 *   this figure is wrong?". A third representation of the same edge would
 *   have to be kept consistent with two others.
 * - **`ReportEvidenceLink`** is `Relation { kind: "evidences" }`, which MG-1
 *   built precisely so that evidence links would stop being a per-module enum.
 *
 * What genuinely could not be expressed, and is added here: versions,
 * snapshots, approvals, contributions and per-section data requirements.
 */

/**
 * Why a version was cut.
 *
 * `correction` is distinct from `revision` and the difference is what a reader
 * needs: a revision is the document moving forward, a correction is an
 * admission that a published figure was wrong. Collapsing them lets the second
 * hide inside the first.
 */
export type ReportVersionReason =
  | "draft_saved"
  | "submitted_for_review"
  | "approved"
  | "published"
  | "correction"
  | "revision";

/**
 * An immutable point in a report's life.
 *
 * The brief's rule is absolute: *a published report cannot silently change
 * when underlying live data changes*. A version is how that is kept. It holds
 * the section content as it stood and points at the snapshot that pins every
 * figure it cited, so a report published in March still resolves to March's
 * numbers however many times the underlying claims are superseded afterwards.
 */
export interface ReportVersion {
  id: UUID;
  organisationId: UUID;
  reportId: UUID;
  /** Monotonic within a report, starting at 1. */
  versionNumber: number;
  reason: ReportVersionReason;
  status: ReportStatus;
  /** The sections exactly as they stood. Never re-rendered from live data. */
  sections: ImpactReportSection[];
  snapshotId?: UUID;
  /** Free-text note on what changed, where a human gave one. */
  note?: string;
  createdBy?: UUID;
  createdAt: ISODate;
}

/** One pinned value inside a snapshot. */
export interface SnapshotFigure {
  /** What the figure is about. */
  subject: EntityReference;
  /** Which aspect: "current_value", "amount_remaining", "participants". */
  predicate: string;
  /** The claim that carried it, where the figure came from one. */
  claimId?: UUID;
  /** Rendered value as at the snapshot. Compared against live data to detect drift. */
  renderedValue: string;
  /** The claim's kind at the time. A forecast pinned in March is still a forecast. */
  kind?: ClaimKind;
  verification?: VerificationState;
}

/**
 * What a report version cited, frozen.
 *
 * This is the record that makes a published report defensible. Without it,
 * "the report says 58%" and "the indicator says 61%" are unreconcilable: there
 * is no way to know whether the report was wrong, the indicator moved, or
 * someone edited a number. With it, the difference is a computable drift and
 * is reported as a flagged change rather than by silently altering the
 * published document.
 */
export interface ReportSnapshot {
  id: UUID;
  organisationId: UUID;
  reportId: UUID;
  versionId?: UUID;
  takenAt: ISODate;
  figures: SnapshotFigure[];
  /** Evidence items included, by id, as at the snapshot. */
  evidenceIds: UUID[];
  /** Indicator readings pinned, keyed by indicator id. */
  indicatorValues: { indicatorId: UUID; value: number; measuredAt?: ISODate }[];
  /** Claims cited anywhere in the version. */
  claimIds: UUID[];
}

/**
 * A difference between what a published report says and what the records now
 * say.
 *
 * Surfaced, never applied. The published document does not change; the
 * organisation is told that it no longer matches, and decides whether that
 * warrants a correction, a note to the funder, or nothing at all.
 */
export interface ReportDrift {
  reportId: UUID;
  versionId: UUID;
  subject: EntityReference;
  predicate: string;
  /** What the report says. */
  publishedValue: string;
  /** What the records say now. */
  currentValue: string;
  /** Set when the pinned claim was explicitly superseded rather than merely differing. */
  supersededByClaimId?: UUID;
  severity: "material" | "minor";
}

export type ReportContributorRole = "author" | "reviewer" | "approver" | "data_owner";

/**
 * Who is doing what on a report.
 *
 * Replaces three parallel id arrays with a record that can carry a section
 * assignment and a completion state, so "who owes me the finance section?" is
 * a query rather than a conversation.
 */
export interface ReportContributor {
  id: UUID;
  organisationId: UUID;
  reportId: UUID;
  userId: UUID;
  role: ReportContributorRole;
  /** Absent means the whole report. */
  sectionKey?: string;
  invitedAt?: ISODate;
  completedAt?: ISODate;
}

export type ApprovalDecision = "approved" | "changes_requested";

/**
 * The act of approving, recorded against a version.
 *
 * `approverIds` on the report said who *may* approve. This says who *did*,
 * when, and to which version — which is the only form of the fact that
 * survives the report being edited afterwards.
 */
export interface ReportApproval {
  id: UUID;
  organisationId: UUID;
  reportId: UUID;
  versionId: UUID;
  userId: UUID;
  decision: ApprovalDecision;
  /** Required for `changes_requested`. An unexplained rejection is not actionable. */
  comment?: string;
  decidedAt: ISODate;
}

/**
 * What a section needs before it can be called complete.
 *
 * Distinct from `ReportingRequirement`, and the distinction matters: a
 * `ReportingRequirement` is something a **funder asked for** and is owned by a
 * grant. A `ReportRequirement` is something **this report needs** in order to
 * answer that, and is owned by a template. One funder requirement typically
 * produces several report requirements — a narrative, a figure and the
 * evidence behind it.
 */
export type ReportRequirementKind =
  | "narrative"
  | "indicator"
  | "financial"
  | "evidence"
  | "claim"
  | "attachment";

export interface ReportRequirement {
  id: UUID;
  organisationId: UUID;
  /** Owned by a template, so cloning a template clones its requirements. */
  definitionId: UUID;
  sectionKey: string;
  kind: ReportRequirementKind;
  /** The funder's question, verbatim where it was ingested from a document. */
  prompt: string;
  guidance?: string;
  wordLimit?: number;
  /** For `indicator` and `claim`: what specifically is wanted, once mapped. */
  target?: EntityReference;
  /** For `evidence`: which kinds the funder will accept. */
  evidenceTypes?: EvidenceType[];
  required: boolean;
  order: number;
  /** Set when the requirement came from an ingested funder template. */
  sourceRef?: EntityReference;
  /**
   * Extraction is a candidate until a human confirms it. A requirement lifted
   * from a PDF is a reading of that PDF, and reading a funder's template
   * wrongly is exactly the error that costs an organisation a grant.
   */
  verification: VerificationState;
}

export type ReportTemplateOrigin = "built_in" | "cloned" | "ingested";

/**
 * A funder's reporting template, ingested.
 *
 * The extraction path is the same one a website and an uploaded document take:
 * parse, structure, review, approve. Nothing reaches a report workspace
 * without passing through a person, whatever it was extracted from.
 */
export interface ReportTemplateIngestion {
  id: UUID;
  organisationId: UUID;
  definitionId?: UUID;
  documentId?: UUID;
  fileName?: string;
  funderId?: UUID;
  status: "parsing" | "awaiting_review" | "accepted" | "rejected" | "failed";
  /** What the parser found, before anyone confirmed it. */
  candidates: ReportRequirement[];
  /** Deadlines and periods found in the document, unconfirmed. */
  detectedDueDates: ISODate[];
  /** Why parsing failed or what it could not read. Never silently empty. */
  notes: string[];
  createdAt: ISODate;
  reviewedBy?: UUID;
  reviewedAt?: ISODate;
}


// --- Integrations (MG-11) -----------------------------------------------

/**
 * The integration hub.
 *
 * The strategic point, from the brief: *Mission OS should be capable of
 * becoming the intelligence layer around existing systems before becoming the
 * system of record for every capability.* An organisation with a CRM it likes
 * should be able to start using Pegasus for programme, funding, evidence and
 * impact work without a risky day-one migration.
 *
 * Two rules make that survivable, and both are enforced by types here rather
 * than by discipline.
 *
 * **No provider identifier ever enters a core entity.** `Person` has no
 * `beaconId`. The mapping lives in `ExternalIdentity`, keyed by
 * `(connectionId, externalId)`, which is also the idempotency key — re-running
 * a sync must not duplicate a record and must not need a full re-read to know
 * so. This is the rule `server/communications/provider.ts` established for
 * email; this generalises it.
 *
 * **Nothing silently overwrites a human.** *Never silently overwrite
 * conflicting human-approved information.* A sync that would change a value
 * somebody verified produces a `SyncConflict` and writes nothing. That is not
 * a setting; it is what the engine does.
 */

export type IntegrationCategory =
  | "crm"
  | "accounting"
  | "payments"
  | "email"
  | "calendar"
  | "fundraising"
  | "storage"
  | "forms"
  | "banking";

/**
 * Which way records move.
 *
 * `inbound` is the safe default and the one CONNECT mode uses: Pegasus reads,
 * and the other system stays the system of record. `outbound` and
 * `bidirectional` are the ones that can damage another system's data, and both
 * require the organisation to have said which side wins.
 */
export type SyncDirection = "inbound" | "outbound" | "bidirectional";

/** Which system is authoritative for a kind of record. */
export type SourceOfTruth = "external" | "pegasus" | "field_level";

/**
 * What happens when both sides changed.
 *
 * `refuse` is the default and the only one safe without configuration.
 * `newest_wins` is a real policy an organisation may choose and is dangerous
 * where clocks disagree, which is why it is named rather than implied.
 */
export type ConflictBehaviour = "refuse" | "external_wins" | "pegasus_wins" | "newest_wins";

/**
 * What a deletion on the other side means here.
 *
 * `ignore` is the default. A CRM record deleted by somebody tidying up should
 * not silently remove a person from a grant report, and a sync that propagated
 * deletions by default would do exactly that.
 */
export type DeletionBehaviour = "ignore" | "archive" | "flag";

/**
 * How an integration behaves, declared rather than assumed.
 *
 * The brief requires every integration to define source of truth, direction,
 * conflict behaviour, deletion behaviour, freshness and failure behaviour.
 * Making it a required field on the connection means an integration cannot
 * exist without somebody having answered all six.
 */
export interface SyncSemantics {
  direction: SyncDirection;
  sourceOfTruth: SourceOfTruth;
  conflictBehaviour: ConflictBehaviour;
  deletionBehaviour: DeletionBehaviour;
  /** How stale data may be before the UI says so, in minutes. */
  freshnessMinutes: number;
  /** Consecutive failures before the connection is marked as needing help. */
  failureThreshold: number;
}

/**
 * What a provider can actually do.
 *
 * Declared per provider and **verified against its documentation**, because
 * assuming a capability produces an integration that fails in production
 * rather than at design time. `verified` records whether anybody checked.
 */
export interface ProviderCapabilities {
  read: boolean;
  write: boolean;
  delete: boolean;
  /** Incremental reads from a cursor, rather than a full re-read each time. */
  incrementalSync: boolean;
  webhooks: boolean;
  bulkExport: boolean;
  fileAccess: boolean;
  /** Requests per minute, where the provider publishes one. */
  rateLimitPerMinute?: number;
  bulkRateLimitPerMinute?: number;
}

/**
 * A provider Pegasus knows how to talk to.
 *
 * A descriptor, not a connection. `implemented` is false for every provider
 * today, and saying so is the point: a registry that listed nine providers
 * without distinguishing the described from the built would be a roadmap
 * presented as a feature.
 */
export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  /** What Mission OS can consume from it, in graph terms. */
  supplies: EntityType[];
  /** What it deliberately cannot supply, and why. Never left implicit. */
  unavailable: { entityType: EntityType; reason: string }[];
  capabilities: ProviderCapabilities;
  /** Where the capabilities were read from. A claim needs a source. */
  documentation?: string;
  /** True only where an adapter exists and has been exercised. */
  implemented: boolean;
  /** Constraints an organisation needs to know before connecting. */
  notes: string[];
}

export type ConnectionStatus =
  | "pending"
  | "active"
  | "reauthorisation_required"
  | "rate_limited"
  | "failing"
  | "revoked";

/**
 * How the organisation is using an integration.
 *
 * `connect` keeps the other system as the system of record and reads from it.
 * `migrate` moves canonical ownership to Pegasus. The brief is explicit that
 * the first dramatically reduces adoption friction, and the mode is on the
 * connection because it changes what a sync is allowed to do.
 */
export type MigrationMode = "connect" | "migrate";

export interface IntegrationConnection {
  id: UUID;
  organisationId: UUID;
  integrationId: string;
  /** A label the organisation recognises: the account or mailbox connected. */
  accountLabel: string;
  mode: MigrationMode;
  semantics: SyncSemantics;
  status: ConnectionStatus;
  /**
   * Credentials are **never** stored here.
   *
   * This holds a reference to wherever the secret actually lives. A token in a
   * tenant-readable row is a token every member of the organisation can read,
   * and a schema that has somewhere to put one will eventually have one in it.
   */
  credentialRef?: string;
  connectedBy?: UUID;
  connectedAt: ISODate;
  lastSyncedAt?: ISODate;
  consecutiveFailures: number;
  lastError?: string;
  audit: AuditStamp;
}

/**
 * The bridge between a provider record and a Pegasus entity.
 *
 * The table that keeps provider identifiers out of core entities. `Person` has
 * no `beaconId`; this row says that Beacon record `abc123` on this connection
 * is Pegasus person `per-rowan`, and `(connectionId, externalId)` is the
 * idempotency key that makes a re-run safe.
 */
export interface ExternalIdentity {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  /** The provider's own id. Opaque; never parsed, never displayed as an id. */
  externalId: string;
  /** The provider's own type name, e.g. "person", "organisation". */
  externalType: string;
  entity: EntityReference;
  /** A hash of the last payload seen, so an unchanged record is skipped. */
  contentHash?: string;
  firstSeenAt: ISODate;
  lastSeenAt: ISODate;
  /** Set where the provider reports the record as deleted. */
  externallyDeletedAt?: ISODate;
}

/**
 * Where a sync got to.
 *
 * Opaque and provider-specific. Pegasus stores it and hands it back; it never
 * parses one, because a cursor's format is the provider's business and parsing
 * it is how an integration breaks on a vendor's internal change.
 */
export interface SyncCursor {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  resource: string;
  cursor: string;
  updatedAt: ISODate;
}

export type SyncRunOutcome = "completed" | "partial" | "failed" | "refused";

export interface SyncRun {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  resource: string;
  direction: SyncDirection;
  startedAt: ISODate;
  finishedAt?: ISODate;
  outcome: SyncRunOutcome;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  conflictsRaised: number;
  /** Always populated. A run that explains nothing cannot be diagnosed. */
  summary: string;
  error?: string;
}

/**
 * A change the sync refused to make.
 *
 * *Never silently overwrite conflicting human-approved information.* This is
 * that rule's record. It holds both values, so a person resolving it can see
 * what each side says rather than being asked to pick between two labels.
 */
export interface SyncConflict {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  entity: EntityReference;
  field: string;
  /** What Pegasus holds, and how much it is trusted. */
  pegasusValue: string;
  pegasusVerification: VerificationState;
  /** What the provider says. */
  externalValue: string;
  detectedAt: ISODate;
  resolution?: "kept_pegasus" | "took_external" | "manual";
  resolvedBy?: UUID;
  resolvedAt?: ISODate;
  resolutionNote?: string;
}

/**
 * An inbound event from a provider that supports them.
 *
 * Stored before it is processed, and deduplicated on the provider's own event
 * id. A webhook delivered twice is normal, and a handler that assumed
 * otherwise would double-count a donation.
 */
export interface WebhookEvent {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  providerEventId: string;
  eventType: string;
  receivedAt: ISODate;
  payloadHash: string;
  status: "received" | "processed" | "ignored" | "failed";
  processedAt?: ISODate;
  note?: string;
}

/**
 * How a provider's field becomes a Pegasus field.
 *
 * Per connection rather than per provider, because some providers generate
 * their schema from each customer's own configuration — Beacon does — so field
 * keys differ between two organisations using the same product. A mapping
 * hardcoded per provider would work for the first customer and fail for the
 * second.
 */
export interface IntegrationMapping {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  externalType: string;
  externalField: string;
  entityType: EntityType;
  field: string;
  /** Whether this field may be written back. Off unless somebody said so. */
  writable: boolean;
  /** Set where a human confirmed the mapping. Discovery produces candidates. */
  verification: VerificationState;
}

// --- Supporters, fundraising and stewardship (MG-10) --------------------

/**
 * Fundraising.
 *
 * Two instructions govern this phase and they pull in opposite directions.
 * The brief says *DO NOT create a second CRM; `Person` and
 * `ExternalOrganisation` remain canonical identities.* The expansion plan says
 * a donation *touches supporter, fund, finance, programme, campaign,
 * reporting, impact and stewardship, and if it lives in a fundraising table,
 * §11 has been violated.*
 *
 * Resolving them decided three things, and they are the phase.
 *
 * **A `Donation` is not money.** It holds a `transactionId` and no amount of
 * its own. The money is a `FinancialTransaction` in a `Fund`, attributed by a
 * `FinancialAllocation`, exactly as a grant payment is — so a donation reaches
 * the Finance Command Centre, the runway calculation and a funder report
 * without anybody entering it twice. What `Donation` carries is the
 * *fundraising* facts: which campaign, which appeal, which channel, whether it
 * was anonymous, whether Gift Aid applies.
 *
 * **There is no `DonationAllocation`.** The brief lists one; `FinancialAllocation`
 * already is one, and it already records the method and the basis that make an
 * attribution defensible. A second allocation table would need reconciling
 * with the first, and the copy that lost would be the one nobody was looking
 * at.
 *
 * **`SupporterProfile` holds no identity.** No name, no email, no address.
 * Those are `Person`, which is canonical. What it holds is what is genuinely
 * fundraising-specific and belongs nowhere else: a steward, a stewardship
 * stage, and how somebody wishes to be thanked.
 */

export type DonationChannel =
  | "bank_transfer"
  | "direct_debit"
  | "standing_order"
  | "card"
  | "cash"
  | "cheque"
  | "platform"
  | "payroll_giving"
  | "legacy"
  | "in_kind";

export type DonationKind = "one_off" | "recurring_payment" | "legacy" | "in_kind";

/**
 * A gift, as a fundraising record.
 *
 * The money lives in `transactionId`. This record exists to say what the money
 * *was*: whose gift, to which appeal, through which channel, and under what
 * conditions.
 */
export interface Donation {
  id: UUID;
  organisationId: UUID;

  /**
   * The money. Required, and the reason this phase is not a second ledger.
   *
   * A donation without a transaction would be a pledge, and a pledge is a
   * `RecurringCommitment` or nothing at all. Recording a gift the bank has not
   * seen as income is how a fundraising total stops matching the accounts.
   */
  transactionId: UUID;

  /** Who gave. Exactly one, or neither where the gift is genuinely anonymous. */
  personId?: UUID;
  externalOrganisationId?: UUID;

  kind: DonationKind;
  channel: DonationChannel;
  receivedOn: ISODate;

  campaignId?: UUID;
  appealId?: UUID;
  /** The recurring arrangement this payment belongs to, where it does. */
  recurringCommitmentId?: UUID;

  /**
   * Anonymous to the public, not to the organisation.
   *
   * A charity must be able to identify its donors for due diligence and for
   * Gift Aid, so `personId` may be set on an anonymous gift. What `anonymous`
   * means is that the name is withheld from anything a third party sees: a
   * report, a supporter wall, a portal. Conflating the two would either break
   * due diligence or publish a name somebody asked to keep private.
   */
  anonymous: boolean;

  /** Whether the donor placed a restriction on it. */
  restricted: boolean;
  /** What the restriction says, where there is one. */
  restrictionPurpose?: string;

  /** Gift Aid, where the donor has a declaration covering this gift. */
  giftAidDeclarationId?: UUID;
  giftAidClaimed: boolean;

  /**
   * A benefit the donor received, in minor units.
   *
   * HMRC's benefit rules disqualify a gift from Gift Aid above set limits, so
   * the value has to be recorded rather than assumed to be nil.
   */
  benefitValueMinorUnits?: number;

  note?: string;
  thankedAt?: ISODate;
  audit: AuditStamp;
}

export type RecurringFrequency = "monthly" | "quarterly" | "annual";

/**
 * A standing arrangement to give.
 *
 * Distinct from a `Donation`, and the distinction is what stops a fundraising
 * total counting money nobody has received: a commitment is an intention, and
 * each payment against it is a separate `Donation` with its own transaction.
 */
export interface RecurringCommitment {
  id: UUID;
  organisationId: UUID;
  personId?: UUID;
  externalOrganisationId?: UUID;
  amountMinorUnits: number;
  currency: CurrencyCode;
  frequency: RecurringFrequency;
  channel: DonationChannel;
  startedOn: ISODate;
  /** Set when the arrangement ends, whether by the donor or by the charity. */
  endedOn?: ISODate;
  endedReason?: string;
  campaignId?: UUID;
  status: "active" | "paused" | "ended";
  audit: AuditStamp;
}

/**
 * A fundraising campaign.
 *
 * The brief lists `FundraisingGoal` separately. It is folded in here as
 * `targetMinorUnits`, because a campaign with several simultaneous monetary
 * targets is not something charities of this size run, and a separate table
 * would be an empty join for every organisation that does not.
 *
 * `raised` is deliberately absent. A stored total is a second source of truth
 * that goes stale the moment a donation is corrected; the total is the sum of
 * the donations pointing at the campaign, which is one query and always right.
 */
export interface Campaign {
  id: UUID;
  organisationId: UUID;
  name: string;
  description?: string;
  targetMinorUnits?: number;
  currency: CurrencyCode;
  startsOn: ISODate;
  endsOn?: ISODate;
  /** Where restricted income from this campaign lands. */
  fundId?: UUID;
  /** What the campaign funds, where it funds one thing. */
  programmeId?: UUID;
  /** Direct cost of running it, so net income is computable rather than assumed. */
  costMinorUnits?: number;
  status: "planned" | "active" | "closed";
  audit: AuditStamp;
}

/** One ask within a campaign: a mailing, an event, an appeal week. */
export interface Appeal {
  id: UUID;
  organisationId: UUID;
  campaignId: UUID;
  name: string;
  channel: DonationChannel;
  sentOn?: ISODate;
  /** How many people were asked. Needed for a response rate that means anything. */
  audienceSize?: number;
  costMinorUnits?: number;
  audit: AuditStamp;
}

/**
 * A public page that collects donations for a campaign.
 *
 * Thin on purpose. The form behind it is a `Form` with purpose `donation`,
 * built in MG-7 and carrying its own consent, sensitivity and spam controls; a
 * second form engine here would be exactly the module-specific duplication the
 * architecture keeps refusing.
 */
export interface FundraisingPage {
  id: UUID;
  organisationId: UUID;
  campaignId: UUID;
  slug: string;
  headline: string;
  body?: string;
  /** The donation form served on it. */
  formId?: UUID;
  /** Whether the running total is shown publicly. */
  showTotal: boolean;
  status: "draft" | "live" | "closed";
  audit: AuditStamp;
}

/**
 * A UK Gift Aid declaration.
 *
 * Modelled against what HMRC actually requires rather than against what is
 * convenient. Four things make a declaration valid, and all four are here
 * because a claim missing any of them is one the charity has to repay:
 *
 * - the donor's **full name and home address**, because HMRC matches on them;
 * - a statement that they are a **UK taxpayer** who has paid at least as much
 *   income or capital gains tax as every charity will reclaim;
 * - the **date** it was given;
 * - whether it is **enduring** — covering past four years and all future gifts
 *   — or applies to a single donation.
 *
 * The address is the one field on this record that is personal data the
 * relationship layer deliberately does not hold. It lives here because Gift
 * Aid is the lawful basis for holding it, which is the rule §8 states: a
 * lawful basis first, not an available column.
 */
export interface GiftAidDeclaration {
  id: UUID;
  organisationId: UUID;
  /** Gift Aid applies to individuals only. A company cannot make one. */
  personId: UUID;
  fullName: string;
  /** Required by HMRC. House number or name plus postcode is the minimum. */
  addressLine: string;
  postcode: string;
  /** The donor's confirmation that they pay enough UK tax. */
  taxpayerConfirmed: boolean;
  declaredOn: ISODate;
  /** Enduring declarations cover the previous four years and all future gifts. */
  scope: "enduring" | "single_donation";
  /** For a single-donation declaration. */
  donationId?: UUID;
  cancelledOn?: ISODate;
  cancelledReason?: string;
  audit: AuditStamp;
}

/**
 * A claim to HMRC.
 *
 * *Do not fake live HMRC submission*, from the brief. Nothing here submits
 * anything: a claim is assembled, validated against the declaration rules, and
 * left in `ready` for somebody to file through HMRC's own service. `submit` is
 * a port with no implementation, and `reference` is filled in by a human who
 * filed it.
 */
export interface GiftAidClaim {
  id: UUID;
  organisationId: UUID;
  periodStart: ISODate;
  periodEnd: ISODate;
  donationIds: UUID[];
  /** 25% of qualifying gifts, in minor units. Computed, never entered. */
  claimableMinorUnits: number;
  currency: CurrencyCode;
  status: "draft" | "ready" | "filed" | "settled";
  /** Filled in by whoever filed it with HMRC. Pegasus never files. */
  hmrcReference?: string;
  filedBy?: UUID;
  filedOn?: ISODate;
  audit: AuditStamp;
}

/**
 * Where a supporter is in their relationship with the organisation.
 *
 * A named stage, not a score. *Do not create manipulative engagement scoring*,
 * from the brief, and the reason is not squeamishness: a score compresses
 * several different situations into one number and then invites somebody to
 * act on the number. A supporter who gave once and has not been thanked, and a
 * supporter who gave for six years and stopped, are different problems, and
 * "engagement 34" says neither.
 */
export type StewardshipStageKey =
  | "new"
  | "thanked"
  | "regular"
  | "major"
  | "lapsing"
  | "lapsed"
  | "corporate"
  | "trust_or_foundation"
  | "potential_major";

export interface StewardshipStage {
  key: StewardshipStageKey;
  label: string;
  /** What this stage means, in the words a fundraiser would use. */
  description: string;
  /** The next thing to do. A stage with no action is a label. */
  suggestedAction: string;
}

/**
 * The fundraising-specific record for a supporter.
 *
 * Holds **no identity**: no name, no email, no address. Those are `Person`,
 * which is canonical and which this points at. What is here is what belongs
 * nowhere else — who stewards them, where they are in the relationship, and
 * how they wish to be recognised.
 */
export interface SupporterProfile {
  id: UUID;
  organisationId: UUID;
  /** Exactly one. Identity stays canonical. */
  personId?: UUID;
  externalOrganisationId?: UUID;
  /** The internal person accountable for the relationship. */
  stewardId?: UUID;
  stage: StewardshipStageKey;
  /** Set by a human, overriding the derived stage. Requires a reason. */
  stageOverride?: { stage: StewardshipStageKey; reason: string; setBy?: UUID; setAt: ISODate };
  /** How they wish to be thanked and listed. Never inferred. */
  recognitionPreference?: "named" | "anonymous" | "ask_each_time";
  /** Whether they have asked not to be approached for money. */
  doNotSolicit: boolean;
  doNotSolicitReason?: string;
  notes?: string;
  audit: AuditStamp;
}

/** A planned sequence of stewardship actions for one supporter. */
export interface StewardshipPlan {
  id: UUID;
  organisationId: UUID;
  supporterProfileId: UUID;
  name: string;
  steps: {
    key: string;
    title: string;
    dueAt?: ISODate;
    completedAt?: ISODate;
    /** The task created for it, so the plan does not become a second to-do list. */
    taskId?: UUID;
  }[];
  status: "active" | "complete" | "abandoned";
  audit: AuditStamp;
}

// --- Portals (MG-9) ------------------------------------------------------

/**
 * Mission Portals.
 *
 * The expansion plan's note on this phase is the shortest and the sharpest:
 * *external parties reading tenant data is the highest-risk surface in the
 * product.* Everything below is shaped by three rules that follow from it.
 *
 * **1. A portal identity is not a `User`.** It is a separate model, on the
 * same reasoning that gives the Control Plane one: an external funder contact
 * and an internal programme lead should not be the same kind of thing with a
 * different role, because the day somebody writes `if (role === ...)` against
 * a union of the two, an outsider inherits a capability. `PortalIdentity`
 * shares no table, no id space and no authentication path with `User`.
 *
 * **2. Access is granted, never inherited.** The brief states it directly:
 * *never expose internal organisation data simply because the underlying
 * record is related.* A funder who can see a grant does not thereby see the
 * evidence linked to it, the programme it funds, or the interactions about it.
 * Each is a `PortalGrant` somebody made deliberately.
 *
 * **3. A record is projected, never returned.** Even a granted record passes
 * through a `PortalView` that names the fields an audience may see. A `Grant`
 * carries internal conditions and a manager's id; a funder sees a title, a
 * value and a period. The projection is what makes the difference structural
 * rather than a matter of which serialiser somebody used.
 */

export type PortalAudience =
  | "funder"
  | "beneficiary"
  | "volunteer"
  | "partner"
  | "trustee"
  | "applicant";

/**
 * One portal, serving one audience.
 *
 * *Do not build five independent portal products*, from the brief. There is
 * one architecture; the audience decides which views are available and what
 * each projects, and nothing else differs.
 */
export interface Portal {
  id: UUID;
  organisationId: UUID;
  audience: PortalAudience;
  name: string;
  description?: string;
  status: "draft" | "open" | "closed";
  /** Where it is served. Unique within a tenant. */
  slug: string;
  welcomeMessage?: string;
  /** Contact for a portal user who needs a person. Never a shared inbox alias. */
  contactUserId?: UUID;
  audit: AuditStamp;
}

/**
 * An external person who can sign in to a portal.
 *
 * Deliberately thin. It carries an email, a display name and nothing else: a
 * portal identity is a way of authenticating somebody, not a place to keep a
 * profile. Where the same human is also a `Person` in the relationship layer,
 * `personId` links them, and the link is one-directional — a portal identity
 * can find its person, and nothing about the person changes because a portal
 * identity exists.
 */
export interface PortalIdentity {
  id: UUID;
  organisationId: UUID;
  email: string;
  displayName: string;
  /** The canonical relationship record, where there is one. */
  personId?: UUID;
  /** The body they represent, for a funder or partner contact. */
  externalOrganisationId?: UUID;
  status: "invited" | "active" | "suspended";
  invitedAt: ISODate;
  lastSeenAt?: ISODate;
  audit: AuditStamp;
}

/**
 * What a portal identity may do inside one portal.
 *
 * Capabilities are a closed list per audience, not a free set: the point of
 * one portal architecture is that a funder portal cannot be configured into a
 * beneficiary portal by ticking boxes.
 */
export type PortalCapability =
  | "portal:view"
  | "portal:download"
  | "portal:message"
  | "portal:submit"
  | "portal:approve";

export interface PortalMembership {
  id: UUID;
  organisationId: UUID;
  portalId: UUID;
  identityId: UUID;
  capabilities: PortalCapability[];
  /** Absent means indefinite. A dated grant is the safer default. */
  expiresAt?: ISODate;
  invitedBy?: UUID;
  revokedAt?: ISODate;
  revokedReason?: string;
  audit: AuditStamp;
}

/**
 * One record, shared deliberately with one membership.
 *
 * The table that makes rule 2 structural. There is no traversal from a granted
 * record to another record: reaching a second thing requires a second grant,
 * and somebody had to make it.
 */
export interface PortalGrantRecord {
  id: UUID;
  organisationId: UUID;
  membershipId: UUID;
  /** What was shared. */
  entity: EntityReference;
  /** Which view projects it. Decides the fields, not merely the access. */
  viewKey: string;
  grantedBy: UUID;
  grantedAt: ISODate;
  /** Why, for the audit trail and for the person reviewing access later. */
  reason?: string;
  expiresAt?: ISODate;
  revokedAt?: ISODate;
}

/**
 * The fields an audience may see of one entity type.
 *
 * An allowlist. A denylist would mean every field added to `Grant` after this
 * was written is exposed to funders by default, which is precisely how a
 * portal leaks: not by a decision, but by a schema change nobody connected to
 * a portal.
 */
export interface PortalView {
  key: string;
  audience: PortalAudience;
  entityType: EntityType;
  label: string;
  /** Field names on the entity that may be projected. Nothing else is. */
  fields: string[];
  /** What a reader is told about what they are not seeing. */
  withheldNote?: string;
}

export type PortalSubmissionKind =
  | "report_response"
  | "evidence"
  | "availability"
  | "expression_of_interest"
  | "approval";

export interface PortalSubmission {
  id: UUID;
  organisationId: UUID;
  portalId: UUID;
  membershipId: UUID;
  kind: PortalSubmissionKind;
  /** What it is about. */
  subject?: EntityReference;
  /** A form submission, where the portal collected it through a form. */
  formSubmissionId?: UUID;
  body?: string;
  status: "received" | "accepted" | "rejected";
  submittedAt: ISODate;
  reviewedBy?: UUID;
  reviewedAt?: ISODate;
  reviewNote?: string;
}

/**
 * A message between the organisation and a portal user.
 *
 * Kept here rather than in `Interaction` because the two are different facts:
 * an interaction is the organisation's record of a conversation, and this is
 * the conversation. A portal message becomes an interaction when somebody
 * decides it is worth recording, which is a decision rather than a side
 * effect.
 */
export interface PortalMessage {
  id: UUID;
  organisationId: UUID;
  portalId: UUID;
  membershipId: UUID;
  direction: "inbound" | "outbound";
  body: string;
  /** What it is about, where it is about a shared record. */
  subject?: EntityReference;
  sentAt: ISODate;
  /** The internal user who sent an outbound message. */
  sentBy?: UUID;
  readAt?: ISODate;
}

/**
 * What a portal user actually receives.
 *
 * `withheld` is not decoration. A funder shown four fields of a grant, with no
 * indication that six exist, will reason as though they have seen the record.
 * Saying what is not shown is both more honest and less likely to produce a
 * follow-up email.
 */
export interface ProjectedRecord {
  entity: EntityReference;
  viewKey: string;
  fields: { name: string; label: string; value: string }[];
  withheld: string[];
  withheldNote?: string;
}

// --- Forms and data collection (MG-7) -----------------------------------

/**
 * Forms.
 *
 * The rule that decides whether this phase succeeded is one sentence from the
 * expansion plan: *a submission is not a form record. It is evidence, a claim
 * about a cohort, an indicator measurement and a relationship interaction. If
 * a submission does not become a claim, the phase has built a form builder.*
 *
 * So a `FormSubmission` is deliberately not the interesting type here.
 * `FormMapping` is: it says what an answer becomes, and `SubmissionProjection`
 * is the candidate set that a human reviews before anything reaches the graph.
 *
 * **On beneficiaries, and why this phase does not introduce them.**
 * `MISSION_GRAPH_ARCHITECTURE.md` §8 records the absence of a beneficiary
 * entity as a decision, and `MISSION_OS_EXPANSION_PLAN.md` §MG-12 names this
 * exact phase as the one most likely to reverse it by accident. A beneficiary
 * intake form is in the brief's own list of purposes, and building one is not
 * the same as building a beneficiary record.
 *
 * What ships: a form can collect intake answers, they are classified
 * `special_category` where they are, they carry a lawful basis, a retention
 * period and an AI exclusion, and they stay in `submission_answers`. What does
 * not ship: any projection from those answers into a `Person`, or a new
 * `Beneficiary` table. Impact continues to be measured through indicators and
 * evidence, which §8 records as both safer and sufficient.
 */

export type FormPurpose =
  | "donation"
  | "volunteer_application"
  | "beneficiary_intake"
  | "programme_registration"
  | "survey"
  | "outcome_measurement"
  | "feedback"
  | "grant_application"
  | "partner_submission"
  | "evidence_submission"
  | "event_registration"
  | "custom";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "email"
  | "phone"
  | "address"
  | "file"
  | "rating"
  | "scale"
  | "consent"
  | "signature";

/**
 * How sensitive an answer is.
 *
 * A property of the **field**, decided when the form is designed, not of the
 * answer, and not something a reviewer classifies afterwards. That ordering is
 * the whole point: by the time an answer exists it is too late to decide
 * whether it should have been collected, and a classification applied after
 * the fact has already been wrong for however long the data sat unclassified.
 *
 * The four levels decide three things, listed in the order they bite:
 *
 * - **AI context.** `personal` and `special_category` never reach a model.
 *   Not redacted on the way — never assembled. See `lib/forms/sensitivity.ts`.
 * - **Retention.** `special_category` requires an explicit retention period;
 *   a form that collects it and cannot say for how long cannot be published.
 * - **Permission.** Reading `special_category` answers requires a capability
 *   that most roles do not hold.
 *
 * `special_category` means UK GDPR Article 9 data — health, ethnicity,
 * religion, sexual life, biometrics, and criminal offence data alongside it.
 * It is named for the legal category rather than for a feeling about
 * sensitivity, because the legal category is what carries the obligations.
 */
export type FieldSensitivity = "public" | "internal" | "personal" | "special_category";

export interface FormFieldOption {
  value: string;
  label: string;
}

/**
 * Validation a form applies before it accepts an answer.
 *
 * Deterministic and declarative. A regex is permitted and is bounded in
 * length, because an unbounded tenant-supplied pattern is a denial-of-service
 * against the server that evaluates it.
 */
export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Anchored and length-bounded when applied. */
  pattern?: string;
  /** Shown when the pattern fails. A regex is not an error message. */
  patternMessage?: string;
}

export interface FormField {
  id: UUID;
  organisationId: UUID;
  versionId: UUID;
  sectionKey: string;
  key: string;
  label: string;
  help?: string;
  type: FormFieldType;
  required: boolean;
  order: number;
  options?: FormFieldOption[];
  validation?: FieldValidation;
  /** Required on every field. There is no default and no unclassified state. */
  sensitivity: FieldSensitivity;
  /**
   * Show this field only when the condition holds.
   *
   * The same typed condition tree the automation engine uses, evaluated by the
   * same three-valued function over a bag of answers. The brief's instruction
   * not to build module-specific automation systems applies here: a second
   * condition language would be a second thing to get wrong, and would drift.
   */
  visibleWhen?: unknown;
  /** Required only when this holds. Separate from `required` on purpose. */
  requiredWhen?: unknown;
  /** For `consent` fields: what is being consented to. */
  consentPurpose?: string;
}

export interface FormSection {
  key: string;
  title: string;
  description?: string;
  order: number;
  visibleWhen?: unknown;
}

export type FormVersionStatus = "draft" | "published" | "retired";

/**
 * An immutable published form.
 *
 * *Published versions are immutable*, from the brief. The reason is the same
 * one that governs report versions: a submission answers the form **as it
 * stood**, and a form that can be edited after somebody answered it makes
 * every prior submission unreadable — the answers point at fields whose labels,
 * options and requiredness have all moved.
 */
export interface FormVersion {
  id: UUID;
  organisationId: UUID;
  formId: UUID;
  versionNumber: number;
  status: FormVersionStatus;
  sections: FormSection[];
  publishedAt?: ISODate;
  publishedBy?: UUID;
  retiredAt?: ISODate;
  audit: AuditStamp;
}

export type FormAccess = "internal" | "link" | "public";

export interface Form {
  id: UUID;
  organisationId: UUID;
  name: string;
  purpose: FormPurpose;
  description?: string;
  /** What this form is about, where it is about one record. */
  subject?: EntityReference;
  /** The version being served. Absent means nothing is published. */
  currentVersionId?: UUID;
  access: FormAccess;
  /** The slug a public form is served at. */
  slug?: string;
  status: "draft" | "open" | "closed";
  /** Shown after submission. Never generated. */
  confirmationMessage?: string;
  /**
   * The lawful basis for everything this form collects.
   *
   * Required before a form carrying `special_category` fields may be
   * published. A form that cannot say why it is entitled to ask is a form that
   * should not be asking.
   */
  lawfulBasis?: ConsentState;
  /**
   * How long answers are kept, in days.
   *
   * Required where any field is `special_category`. "Indefinitely" is not a
   * retention policy, and the absence of one is the most common way personal
   * data outlives its purpose.
   */
  retentionDays?: number;
  /** Requests per hour per source. Public forms are rate limited by default. */
  rateLimitPerHour?: number;
  audit: AuditStamp;
}

export type SubmissionStatus =
  | "received"
  | "awaiting_review"
  | "accepted"
  | "rejected"
  | "spam";

/**
 * Where a submission came from.
 *
 * `public` is the untrusted one and is treated as such throughout: rate
 * limited, spam checked, sanitised before any answer reaches a model, and
 * never projected into the graph without review.
 */
export type SubmissionSource = "public" | "link" | "internal" | "import";

export interface FormSubmission {
  id: UUID;
  organisationId: UUID;
  formId: UUID;
  /** The exact version answered. Never the current one. */
  versionId: UUID;
  status: SubmissionStatus;
  source: SubmissionSource;
  submittedAt: ISODate;
  /** Set only where an internal user submitted on someone's behalf. */
  submittedBy?: UUID;
  /**
   * A coarse, non-identifying token for rate limiting and duplicate
   * detection. Deliberately not an IP address: an IP is personal data under
   * UK GDPR and keeping one for spam control needs its own lawful basis.
   */
  sourceToken?: string;
  reviewedBy?: UUID;
  reviewedAt?: ISODate;
  /** Why it was rejected. An unexplained rejection is not auditable. */
  reviewNote?: string;
  /** When the answers become due for deletion, from the form's retention. */
  retainUntil?: ISODate;
}

export interface SubmissionAnswer {
  id: UUID;
  organisationId: UUID;
  submissionId: UUID;
  fieldKey: string;
  /** Denormalised so an answer stays readable when the field is retired. */
  fieldLabel: string;
  fieldType: FormFieldType;
  /** Carried onto the answer, so a reader never has to resolve the field. */
  sensitivity: FieldSensitivity;
  value: ClaimValue;
  /** True once the answer has been erased under retention. */
  redacted?: boolean;
  redactedAt?: ISODate;
}

export interface SubmissionAttachment {
  id: UUID;
  organisationId: UUID;
  submissionId: UUID;
  fieldKey: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  storageKey?: string;
  sensitivity: FieldSensitivity;
  uploadedAt: ISODate;
}

/**
 * What an answer becomes in the Mission Graph.
 *
 * The type that decides whether this phase built a form builder or a data
 * collection system. Without it a submission is a row nobody reads twice.
 */
export type MappingTargetKind =
  | "person"
  | "external_organisation"
  | "relationship"
  | "interaction"
  | "indicator_measurement"
  | "evidence"
  | "claim"
  | "consent";

export interface FormMapping {
  id: UUID;
  organisationId: UUID;
  formId: UUID;
  fieldKey: string;
  target: MappingTargetKind;
  /** Which aspect, for claims and measurements: "participants_supported". */
  predicate?: string;
  /** The specific record, where the mapping names one. */
  targetRef?: EntityReference;
  /**
   * Whether a person must approve before the graph changes.
   *
   * Defaults to true and is forced true for anything that touches an existing
   * record. *Never mutate trusted data silently*, from the brief: a form
   * answer is an assertion by whoever filled it in, and an assertion is not
   * the same as a correction.
   */
  requiresReview: boolean;
  audit: AuditStamp;
}

/**
 * A recorded lawful basis for one submission.
 *
 * Separate from `ConsentState`, which is the *organisation's* basis for
 * holding a relationship. This is the basis a specific person gave at a
 * specific moment, on a specific version of a form, and it has to survive the
 * form being edited afterwards.
 */
export interface ConsentRecord {
  id: UUID;
  organisationId: UUID;
  submissionId: UUID;
  fieldKey: string;
  /** What they were told they were agreeing to, verbatim from the version. */
  purpose: string;
  granted: boolean;
  recordedAt: ISODate;
  /** The form version, so the wording can always be recovered. */
  versionId: UUID;
  /** Set where consent was later withdrawn. Never deleted. */
  withdrawnAt?: ISODate;
}

/**
 * A candidate change, before it reaches the graph.
 *
 * *Submission → candidate update → review where required → Mission Graph.*
 * Nothing here is applied. A projection is a proposal with its provenance
 * attached, and applying one is a separate, authorised act.
 */
export interface ProjectedChange {
  /** Which mapping produced it. */
  mappingId: UUID;
  fieldKey: string;
  target: MappingTargetKind;
  targetRef?: EntityReference;
  predicate?: string;
  value: ClaimValue;
  /** Rendered for a reviewer. */
  summary: string;
  requiresReview: boolean;
  /** Set where the change would overwrite something that already exists. */
  existingValue?: string;
  /** Why this cannot be applied, where it cannot. */
  blockedReason?: string;
}

export interface SubmissionProjection {
  submissionId: UUID;
  changes: ProjectedChange[];
  /** Answers with no mapping. Reported rather than silently discarded. */
  unmapped: { fieldKey: string; label: string }[];
  /** Answers deliberately not projected because of their sensitivity. */
  withheld: { fieldKey: string; reason: string }[];
}

// --- Domain events, automation and scheduling (MG-6) --------------------

/**
 * What happened, as a record.
 *
 * Before this, "a grant became at risk" was something the product could
 * *observe* by recomputing grant health on every page render, and could not
 * *react* to. An event is the difference: it has a time, a subject, a before
 * and an after, and it can be consumed by something that is not a page.
 *
 * Deliberately not an audit event. `AuditEvent` records **what a person did**
 * and is append-only evidence for a human reader. A `DomainEvent` records
 * **what became true** and is machinery. Conflating them makes the audit trail
 * unreadable and makes the automation feed unfilterable.
 */
export type DomainEventKind =
  // Structural, emitted by the data layer on any tenant record.
  | "record.created"
  | "record.changed"
  | "record.archived"
  // Meaningful transitions, emitted where a state change carries consequence.
  | "grant.state_changed"
  | "grant.health_changed"
  | "deliverable.overdue"
  | "report.state_changed"
  | "report.due_soon"
  | "requirement.due_soon"
  | "indicator.updated"
  | "evidence.linked"
  | "evidence.outdated"
  | "payment.received"
  | "transaction.imported"
  | "runway.changed"
  | "relationship.health_changed"
  | "opportunity.discovered"
  | "form.submitted"
  // Time itself. Emitted by the scheduler, never by a mutation.
  | "date.approaching"
  | "deadline.passed";

export interface DomainEvent {
  id: UUID;
  organisationId: UUID;
  kind: DomainEventKind;
  subject: EntityReference;
  occurredAt: ISODate;
  /**
   * The record's addressable fields after the change, flattened.
   *
   * Flat and typed so a condition can read `grant.health` without the engine
   * having to walk an arbitrary object. This is the event's payload and the
   * only thing conditions ever see.
   */
  facts: Record<string, string | number | boolean | null>;
  /** The same fields before the change, for `changed` conditions. */
  previous?: Record<string, string | number | boolean | null>;
  /** The user whose action produced it, where a user was involved. */
  actorId?: UUID;
  /** Set once the dispatcher has run automations against it. */
  processedAt?: ISODate;
}

export type AutomationTriggerKind = DomainEventKind;

export interface AutomationTrigger {
  kind: AutomationTriggerKind;
  /** Narrow to one entity type, e.g. only grants. */
  entityType?: EntityType;
  /**
   * For `date.approaching`: which dated field, and how far ahead.
   * The pair that closes the reminder requirement.
   */
  dateField?: string;
  daysBefore?: number;
}

/**
 * What an automation may do.
 *
 * The list is closed, and that is the phase's central safety property. The
 * brief's instruction is "do NOT allow arbitrary AI database mutation", and
 * the way to honour it is not to police what a model asks for — it is to make
 * the set of possible effects finite, enumerable and individually reviewed.
 * An automation cannot write a field; it can create a task, and creating a
 * task is a thing whose consequences are known.
 */
export type AutomationActionKind =
  | "create_task"
  | "notify_user"
  | "request_review"
  | "request_evidence"
  | "prepare_report"
  | "assign_owner"
  | "set_workflow_state"
  | "generate_brief"
  | "draft_communication";

export interface AutomationAction {
  kind: AutomationActionKind;
  /** Free-form per kind, validated by the action's own descriptor. */
  params: Record<string, string | number | boolean | null>;
}

export type AutomationStatus = "draft" | "active" | "paused";

export interface Automation {
  id: UUID;
  organisationId: UUID;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  /** Deterministic, three-valued. An undecidable condition never fires. */
  condition?: unknown;
  actions: AutomationAction[];
  status: AutomationStatus;
  /**
   * Whether a person must approve each run before its actions take effect.
   *
   * Set by the rule author, but **forced true** where any action is externally
   * visible. See `requiresApproval` in `lib/automation/actions.ts`: this field
   * records the author's intent and the engine independently refuses to run an
   * external action unapproved, so a mistake here cannot send anything.
   */
  requiresApproval: boolean;
  ownerId?: UUID;
  lastRunAt?: ISODate;
  audit: AuditStamp;
}

export type AutomationRunOutcome =
  | "matched"
  | "not_matched"
  | "undecidable"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "skipped";

/**
 * One evaluation of one automation against one event.
 *
 * A run is recorded **whether or not it matched**. That is deliberate and it
 * is what makes an automation debuggable: "why did nothing happen?" is a more
 * common question than "why did this happen?", and a system that only records
 * its successes cannot answer it.
 */
export interface AutomationRun {
  id: UUID;
  organisationId: UUID;
  automationId: UUID;
  eventId?: UUID;
  trigger: AutomationTriggerKind;
  subject: EntityReference;
  outcome: AutomationRunOutcome;
  /** The condition trace, stored so a run can be audited without re-deriving. */
  conditionTrace?: unknown;
  /** A one-line explanation, always present. */
  explanation: string;
  startedAt: ISODate;
  finishedAt?: ISODate;
  /** Who approved the run, where approval was required. */
  approvedBy?: UUID;
  approvedAt?: ISODate;
  /** True where the run was a simulation and nothing was written. */
  simulated: boolean;
}

export interface AutomationStep {
  id: UUID;
  organisationId: UUID;
  runId: UUID;
  order: number;
  action: AutomationActionKind;
  params: Record<string, string | number | boolean | null>;
  status: "planned" | "awaiting_approval" | "executed" | "skipped" | "failed";
  /** What the step actually created or changed. */
  result?: EntityReference;
  detail?: string;
  /** Set where a model assisted inside the bounded action. */
  provenance?: GroundingRecord;
  executedAt?: ISODate;
}

export interface AutomationFailure {
  id: UUID;
  organisationId: UUID;
  runId: UUID;
  stepId?: UUID;
  /** Machine-readable, so repeated failures can be grouped. */
  code: string;
  message: string;
  occurredAt: ISODate;
  /** Whether re-running could succeed. A permission refusal cannot. */
  retryable: boolean;
}

/**
 * The scheduler's unit of work.
 *
 * A Postgres table and an in-process runner, deliberately: the expansion plan
 * is explicit that this phase introduces **no queue infrastructure**. A
 * charity operating system reminding somebody about a report in thirty days
 * does not need Redis, and adding it would be the largest operational cost in
 * the product for the smallest capability.
 */
export type ScheduledJobKind =
  | "scan_dates"
  | "recompute_signals"
  | "run_automation"
  | "send_reminder";

export interface ScheduledJob {
  id: UUID;
  organisationId: UUID;
  kind: ScheduledJobKind;
  /** What the job is about, where it is about one record. */
  subject?: EntityReference;
  runAfter: ISODate;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  payload: Record<string, string | number | boolean | null>;
  attempts: number;
  lastError?: string;
  /**
   * Idempotency key. A reminder for the same requirement at the same horizon
   * must not be created twice because the scanner ran twice, and deduplicating
   * on insert is the only place that can be guaranteed.
   */
  dedupeKey: string;
  createdAt: ISODate;
  startedAt?: ISODate;
  finishedAt?: ISODate;
}

// --- Tasks, comments, notifications, activity --------------------------

export interface Task {
  id: UUID;
  organisationId: UUID;
  title: string;
  status: "todo" | "in_progress" | "done";
  dueDate?: ISODate;
  assigneeId?: UUID;
  relatedType?: string;
  relatedId?: UUID;
  audit: AuditStamp;
}

export interface Comment {
  id: UUID;
  organisationId: UUID;
  authorId: UUID;
  body: string;
  targetType: string;
  targetId: UUID;
  createdAt: ISODate;
}

export interface Notification {
  id: UUID;
  organisationId: UUID;
  title: string;
  body: string;
  kind: "deadline" | "review" | "system" | "mention" | "grant";
  read: boolean;
  createdAt: ISODate;
  href?: string;
}

export interface ActivityEvent {
  id: UUID;
  organisationId: UUID;
  actorId?: UUID;
  actorName: string;
  verb: string;
  target: string;
  createdAt: ISODate;
}

// --- Relationships ------------------------------------------------------

/**
 * The relationship layer.
 *
 * One canonical `Person` and one canonical `ExternalOrganisation`, joined to
 * the tenant by a `Relationship` that carries *contextual roles* rather than a
 * type. A university may be a funder, a delivery partner and an evaluator at
 * the same time; that is three roles on one relationship, not three records in
 * three module-local contact tables.
 *
 * The tenant key is `organisationId`, as everywhere else in this model. The
 * external party is `ExternalOrganisation` so the two are never confused.
 */

export type ContactPointKind = "email" | "phone";

/**
 * One reachable address for a person. People routinely have a work and a
 * personal email, or a desk and a mobile number, and the wrong one is worse
 * than none. Each carries its own verification state.
 */
export interface ContactPoint {
  id: UUID;
  kind: ContactPointKind;
  value: string;
  /** "Work", "Mobile", "Direct line". */
  label?: string;
  isPrimary: boolean;
  verification: VerificationState;
}

export interface Location {
  city?: string;
  region?: string;
  country?: string;
}

export type CommunicationChannel =
  | "internal"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "teams"
  | "slack"
  | "post"
  | "other";

/**
 * Communication preferences.
 *
 * Operational contact, marketing and fundraising rest on different lawful
 * bases in most jurisdictions, so they are independent flags rather than one
 * global "opted in" boolean. `doNotContact` is a hard stop that overrides the
 * rest.
 */
export interface CommunicationPreferences {
  preferredChannel?: CommunicationChannel;
  emailAllowed: boolean;
  phoneAllowed: boolean;
  smsAllowed: boolean;
  marketingAllowed: boolean;
  fundraisingAllowed: boolean;
  doNotContact: boolean;
  notes?: string;
}

/**
 * `not_recorded` is the honest default. It is deliberately not a synonym for
 * consent, and the UI must not present it as one.
 */
export type ConsentBasis =
  | "consent"
  | "legitimate_interest"
  | "contract"
  | "legal_obligation"
  | "not_recorded";

export interface ConsentState {
  basis: ConsentBasis;
  /** Where the basis came from: "Signed partnership agreement", "Web form". */
  source?: string;
  recordedAt?: ISODate;
  reviewDueAt?: ISODate;
  /** Consent rules are not global. "UK-GDPR", "EU-GDPR", "PIPEDA". */
  jurisdiction?: string;
  /** Pointer to the document or evidence item that records the basis. */
  evidenceRef?: EntityReference;
}

/**
 * An external person: a funder contact, partner lead, trustee contact,
 * volunteer coordinator, researcher.
 *
 * Distinct from `User`, who is an internal team member with an account. No
 * date of birth, address, household or wealth field exists here by design —
 * adding personal data requires a lawful basis first, not an available column.
 */
export interface Person {
  id: UUID;
  organisationId: UUID;
  firstName: string;
  lastName: string;
  preferredName?: string;
  emails: ContactPoint[];
  phones: ContactPoint[];
  jobTitle?: string;
  primaryExternalOrganisationId?: UUID;
  location?: Location;
  communicationPreferences?: CommunicationPreferences;
  consent?: ConsentState;
  tags: string[];
  notes?: string;
  isDemo: boolean;
  audit: AuditStamp;
}

/**
 * Descriptive classification only. It never gates behaviour — roles on the
 * relationship do that — so an organisation is not forced to pick one label
 * for a many-sided relationship.
 */
export type ExternalOrganisationType =
  | "funder"
  | "foundation"
  | "charity"
  | "ngo"
  | "social_enterprise"
  | "corporate"
  | "government"
  | "local_authority"
  | "university"
  | "research_institution"
  | "delivery_partner"
  | "supplier"
  | "consultancy"
  | "community_organisation"
  | "network"
  | "other";

export interface ExternalOrganisation {
  id: UUID;
  organisationId: UUID;
  name: string;
  legalName?: string;
  type: ExternalOrganisationType;
  website?: string;
  charityNumber?: string;
  companyNumber?: string;
  location?: Location;
  description?: string;
  tags: string[];
  /** Provenance for enriched fields (§66): where the public data came from. */
  enrichmentSource?: string;
  isDemo: boolean;
  audit: AuditStamp;
}

/** The shipped taxonomy. Extensible: see `RelationshipRole`. */
export type KnownRelationshipRole =
  | "funder"
  | "prospective_funder"
  | "donor"
  | "major_donor"
  | "corporate_partner"
  | "programme_partner"
  | "delivery_partner"
  | "research_partner"
  | "government_stakeholder"
  | "trustee_contact"
  | "supplier"
  | "volunteer"
  | "supporter"
  | "referral_partner"
  | "evaluator"
  | "community_representative"
  | "beneficiary_representative";

/**
 * An open taxonomy. Known roles get labels, grouping and autocomplete; a
 * tenant-specific role is just a string, not a schema migration. No role is
 * ever a boolean column.
 */
export type RelationshipRole = KnownRelationshipRole | (string & {});

export type RelationshipStatus =
  | "prospect"
  | "active"
  | "dormant"
  | "former"
  | "archived";

/**
 * Explainable states, not a score. Every state is produced by a named rule and
 * accompanied by the signals that fired; see `lib/logic/relationship-health`.
 */
export type RelationshipHealthState =
  | "active"
  | "established"
  | "developing"
  | "dormant"
  | "needs_attention";

/** A human's judgement, which always beats the computed state. */
export interface RelationshipHealthOverride {
  state: RelationshipHealthState;
  /** Required. An override without a reason is not auditable. */
  reason: string;
  setBy?: UUID;
  setAt: ISODate;
}

/**
 * How the tenant relates to one person or one external organisation.
 *
 * `lastInteractionAt` is deliberately absent: it is derived from `Interaction`
 * rows. A stored copy is a second source of truth that goes stale the moment
 * an interaction is edited or imported out of order.
 */
export interface Relationship {
  id: UUID;
  organisationId: UUID;
  /** Exactly one of these is set. */
  personId?: UUID;
  externalOrganisationId?: UUID;
  /** The internal user who owns the relationship. */
  ownerId?: UUID;
  status: RelationshipStatus;
  roles: RelationshipRole[];
  startedAt?: ISODate;
  nextAction?: string;
  nextActionAt?: ISODate;
  healthOverride?: RelationshipHealthOverride;
  tags: string[];
  notes?: string;
  audit: AuditStamp;
}

/**
 * A relationship's edge into the Mission Graph.
 *
 * Strong, high-traffic edges stay as typed foreign keys (grant → funder).
 * This carries the many-to-many, semantically varied ones — relationship →
 * programme as a delivery partner, relationship → evidence as its evaluator —
 * which would otherwise become a sprawl of join tables. It is the first
 * concrete instance of the `Relation` primitive in the target architecture.
 */
export interface RelationshipLink {
  id: UUID;
  organisationId: UUID;
  relationshipId: UUID;
  entity: EntityReference;
  /** How they relate to that entity: "delivery_partner", "evaluator". */
  role?: RelationshipRole;
  note?: string;
  createdAt: ISODate;
}

export type InteractionType =
  | "email"
  | "meeting"
  | "call"
  | "message"
  | "event"
  | "introduction"
  | "note"
  | "proposal"
  | "visit"
  | "other";

export type InteractionDirection = "inbound" | "outbound" | "internal";

/**
 * One contact event, of any type, with anyone.
 *
 * Deliberately generic. Separate `FunderEmail` / `DonorCall` / `PartnerMeeting`
 * entities would fragment the timeline and force every consumer to union them
 * back together.
 */
export interface Interaction {
  id: UUID;
  organisationId: UUID;
  type: InteractionType;
  direction: InteractionDirection;
  channel?: CommunicationChannel;
  occurredAt: ISODate;
  subject: string;
  summary?: string;
  /** External participants. */
  personIds: UUID[];
  externalOrganisationIds: UUID[];
  /** Internal participants. */
  participantUserIds: UUID[];
  /** What this interaction was about, in Mission Graph terms. */
  links: EntityReference[];
  /**
   * How the record arrived. `provider_sync` is what makes idempotent email
   * import possible later without a schema change.
   */
  source: "manual" | "imported" | "provider_sync";
  recordedBy?: UUID;
  audit: AuditStamp;
}

export type CommitmentDirection = "we_owe" | "they_owe" | "mutual";

/**
 * Stored status only. `overdue` is derived from `dueAt` — see
 * `commitmentState()`. A stored overdue flag needs a scheduled job to stay
 * true and is wrong in between runs.
 */
export type CommitmentStatus = "open" | "completed" | "cancelled";

/**
 * A promise made or received.
 *
 * Organisations make commitments constantly — in meetings, in email, in grant
 * agreements — and then lose them. This is the entity that stops that, and it
 * feeds Mission Control.
 */
export interface Commitment {
  id: UUID;
  organisationId: UUID;
  title: string;
  description?: string;
  direction: CommitmentDirection;
  personId?: UUID;
  externalOrganisationId?: UUID;
  /** What it relates to: a grant, a report, a programme. */
  relatedEntity?: EntityReference;
  ownerId?: UUID;
  dueAt?: ISODate;
  status: CommitmentStatus;
  /** Where it came from: the interaction, meeting or agreement. */
  source?: EntityReference;
  /**
   * Set when a human confirmed an AI-extracted candidate. An unconfirmed
   * suggestion is never an organisational commitment.
   */
  confirmedBy?: UUID;
  completedAt?: ISODate;
  audit: AuditStamp;
}

// --- AI -----------------------------------------------------------------

/**
 * What a generation actually drew on.
 *
 * This replaces `AIProvenance`, which held five arrays of bare strings listing
 * everything *offered* to a model as though it had been *used* (audit S2). The
 * defect was in the type: a label like "Mission statement" references nothing,
 * so no check was possible and the record could never be wrong.
 *
 * Here `used` holds resolvable references, validated against what was offered
 * before persistence. `unused` is retained deliberately — "we had this and did
 * not draw on it" is a different and more useful statement than silence.
 *
 * Execution metadata travels with the record rather than beside it, so a
 * section can always answer which model and prompt version produced it, and
 * whether it was live generation or the deterministic fallback (audit S7).
 */
export interface GroundingRecord {
  used: EntityReference[];
  unused: EntityReference[];
  assumptions: string[];
  couldNotVerify: string[];
  model: string;
  promptVersion: string;
  usedFallback: boolean;
  fallbackReason?: string;
  generatedAt: ISODate;
}

export interface AIGeneration {
  id: UUID;
  organisationId: UUID;
  feature: string;
  model: string;
  promptVersion: string;
  userId?: UUID;
  inputRefs: string[];
  outputPreview: string;
  approvalStatus: "pending" | "approved" | "discarded";
  createdAt: ISODate;
}

export interface AuditEvent {
  id: UUID;
  organisationId: UUID;
  actorId?: UUID;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: ISODate;
}
