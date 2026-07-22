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

/** A value with an attached trust state and optional source note. */
export interface Attested<T> {
  value: T;
  verification: VerificationState;
  source?: string;
  lastVerifiedAt?: ISODate;
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
  contactName?: string;
  contactEmail?: string;
  notes?: string;
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
  provenance?: AIProvenance;
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

export type ReportSectionKey =
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

export interface ImpactReportSection {
  key: ReportSectionKey;
  title: string;
  content: string;
  provenance?: AIProvenance;
}

export interface ImpactReport {
  id: UUID;
  organisationId: UUID;
  title: string;
  programmeId?: UUID;
  grantId?: UUID;
  reportingPeriod: string;
  status: "draft" | "in_review" | "approved";
  includedIndicatorIds: UUID[];
  includedEvidenceIds: UUID[];
  sections: ImpactReportSection[];
  audit: AuditStamp;
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

// --- AI -----------------------------------------------------------------

export interface AIProvenance {
  profileFieldsUsed: string[];
  documentsUsed: string[];
  programmeDataUsed: string[];
  assumptions: string[];
  couldNotVerify: string[];
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
