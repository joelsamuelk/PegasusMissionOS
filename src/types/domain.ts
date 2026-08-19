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
  | "evidence"
  | "impact_report"
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

// --- Knowledge: sources, claims, derivation -----------------------------

/**
 * How far a statement stands from a record.
 *
 *   FACT           we hold a record of this
 *   CALCULATION    we derived this from records, by a method we can show
 *   FORECAST       we projected this forward; it has not happened
 *   ASSUMPTION     we had to assume this to produce the above
 *   RECOMMENDATION we suggest you act
 *
 * Introduced by Finance Intelligence and promoted here, because the
 * distinction is not a finance concern: it applies to anything Pegasus asserts.
 * The kind is part of the model, not UI copy, so a recommendation cannot be
 * rendered without the chain it stands on.
 */
export type ClaimKind =
  | "fact"
  | "calculation"
  | "forecast"
  | "assumption"
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
  activities: string[];
  outputs: string[];
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
