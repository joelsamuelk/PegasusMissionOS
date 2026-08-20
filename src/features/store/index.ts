/**
 * Seeded in-memory state for mock mode.
 *
 * This module holds **state only**. It has no query or mutation surface: all
 * access goes through `MissionRepository` (`src/server/data`), which is async,
 * tenant-scoped and context-first. Nothing outside `src/server/data/` may
 * import this file.
 *
 * It previously also exported a `q` / `mutate` accessor pair. Those were
 * single-tenant by construction — they resolved a module-constant organisation
 * and user — and were deleted once every call site moved onto the repository.
 */

import type {
  Activity,
  ActivityEvent,
  AIGeneration,
  Application,
  ApplicationAnswer,
  AuditEvent,
  Budget,
  BudgetLine,
  Claim,
  ClaimConflict,
  ClaimUsage,
  Commitment,
  Document,
  DocumentSource,
  DocumentVersion,
  EvidenceItem,
  EvidenceLink,
  ExternalOrganisation,
  ExtractedClaim,
  FinancialAllocation,
  FinancialTransaction,
  FitAssessment,
  Fund,
  Funder,
  FundingOpportunity,
  Grant,
  GrantDeliverable,
  GrantPayment,
  GrantReport,
  ImpactReport,
  Indicator,
  IndicatorMeasurement,
  Interaction,
  Notification,
  OnboardingRun,
  OpportunityQuestion,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  Outcome,
  Output,
  Person,
  Programme,
  ProgrammeGrantLink,
  Relation,
  Relationship,
  RelationshipLink,
  ReportApproval,
  ReportContributor,
  ReportDefinition,
  ReportRequirement,
  ReportSnapshot,
  ReportTemplateIngestion,
  ReportVersion,
  ReportingRequirement,
  StrategicPriority,
  Task,
  User,
} from "@/types/domain";
import type {
  ProfileCandidate,
  ResearchSource,
} from "@/lib/organisation-intelligence/types";
import * as seed from "./seed";

/** A reviewer's decision on one candidate, recorded rather than inferred. */
export interface CandidateDecisionRecord {
  runId: string;
  candidateId: string;
  organisationId: string;
  decision: "confirm" | "edit" | "reject";
  editedValue?: string;
  at: string;
  by?: string;
}

export interface StoreState {
  users: User[];
  members: OrganisationMember[];
  /** Multiple organisations, so tenant isolation is expressible and testable. */
  organisations: Organisation[];
  profiles: OrganisationProfile[];
  funders: Funder[];
  opportunities: FundingOpportunity[];
  opportunityQuestions: OpportunityQuestion[];
  applications: Application[];
  applicationAnswers: ApplicationAnswer[];
  grants: Grant[];
  grantPayments: GrantPayment[];
  grantDeliverables: GrantDeliverable[];
  grantReports: GrantReport[];
  programmes: Programme[];
  programmeGrantLinks: ProgrammeGrantLink[];
  outcomes: Outcome[];
  indicators: Indicator[];
  indicatorMeasurements: IndicatorMeasurement[];
  evidenceItems: EvidenceItem[];
  evidenceLinks: EvidenceLink[];
  /**
   * Mission Graph (MG-1): delivery entities, money, strategy and the edges
   * between them. `relations` is the general edge table; it is what stops each
   * of these needing a join table of its own.
   */
  activities: Activity[];
  outputs: Output[];
  strategicPriorities: StrategicPriority[];
  reportingRequirements: ReportingRequirement[];
  funds: Fund[];
  transactions: FinancialTransaction[];
  allocations: FinancialAllocation[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  relations: Relation[];
  /**
   * Onboarding (MG-3): documents, and the research runs that produced
   * candidate organisational context awaiting review.
   */
  documents: Document[];
  documentVersions: DocumentVersion[];
  documentSources: DocumentSource[];
  extractedClaims: ExtractedClaim[];
  onboardingRuns: OnboardingRun[];
  researchSources: (ResearchSource & { runId: string })[];
  profileCandidates: (ProfileCandidate & { runId: string })[];
  candidateDecisions: CandidateDecisionRecord[];
  /** Relationship layer: canonical external parties and how we relate to them. */
  externalOrganisations: ExternalOrganisation[];
  people: Person[];
  relationships: Relationship[];
  relationshipLinks: RelationshipLink[];
  interactions: Interaction[];
  commitments: Commitment[];
  tasks: Task[];
  notifications: Notification[];
  activity: ActivityEvent[];
  impactReports: ImpactReport[];
  // MG-5. Definitions carry a template's structure and provenance; versions
  // and snapshots are what stop a published report moving when its data does.
  reportDefinitions: ReportDefinition[];
  reportVersions: ReportVersion[];
  reportSnapshots: ReportSnapshot[];
  reportContributors: ReportContributor[];
  reportApprovals: ReportApproval[];
  reportRequirements: ReportRequirement[];
  reportTemplateIngestions: ReportTemplateIngestion[];
  auditEvents: AuditEvent[];
  fitAssessments: FitAssessment[];
  aiGenerations: AIGeneration[];
  /** Knowledge layer: claims and their derivation, usage and conflicts. */
  claims: Claim[];
  claimUsages: ClaimUsage[];
  claimConflicts: ClaimConflict[];
}

// Deep-ish clone so mutations do not mutate the frozen seed module.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Persist a single instance across hot reloads in development.
const globalRef = globalThis as unknown as { __pegasusStore?: StoreState };

export function createStoreState(): StoreState {
  return {
    users: clone(seed.users),
    members: clone(seed.members),
    organisations: [clone(seed.organisation)],
    profiles: [clone(seed.profile)],
    funders: clone(seed.funders),
    opportunities: clone(seed.opportunities),
    opportunityQuestions: clone(seed.opportunityQuestions),
    applications: clone(seed.applications),
    applicationAnswers: clone(seed.applicationAnswers),
    grants: clone(seed.grants),
    grantPayments: clone(seed.grantPayments),
    grantDeliverables: clone(seed.grantDeliverables),
    grantReports: clone(seed.grantReports),
    programmes: clone(seed.programmes),
    programmeGrantLinks: clone(seed.programmeGrantLinks),
    outcomes: clone(seed.outcomes),
    indicators: clone(seed.indicators),
    indicatorMeasurements: clone(seed.indicatorMeasurements),
    evidenceItems: clone(seed.evidenceItems),
    evidenceLinks: clone(seed.evidenceLinks),
    activities: clone(seed.activities),
    outputs: clone(seed.outputs),
    strategicPriorities: clone(seed.strategicPriorities),
    reportingRequirements: clone(seed.reportingRequirements),
    funds: clone(seed.funds),
    transactions: clone(seed.transactions),
    allocations: clone(seed.allocations),
    budgets: clone(seed.budgets),
    budgetLines: clone(seed.budgetLines),
    relations: clone(seed.relations),
    documents: [],
    documentVersions: [],
    documentSources: [],
    extractedClaims: [],
    onboardingRuns: [],
    researchSources: [],
    profileCandidates: [],
    candidateDecisions: [],
    externalOrganisations: clone(seed.externalOrganisations),
    people: clone(seed.people),
    relationships: clone(seed.relationships),
    relationshipLinks: clone(seed.relationshipLinks),
    interactions: clone(seed.interactions),
    commitments: clone(seed.commitments),
    tasks: clone(seed.tasks),
    notifications: clone(seed.notifications),
    activity: clone(seed.activity),
    impactReports: clone(seed.impactReports),
    reportDefinitions: clone(seed.reportDefinitions ?? []),
    reportVersions: [],
    reportSnapshots: [],
    reportContributors: [],
    reportApprovals: [],
    reportRequirements: clone(seed.reportRequirements ?? []),
    reportTemplateIngestions: [],
    auditEvents: clone(seed.auditEvents),
    fitAssessments: [],
    aiGenerations: [],
    claims: clone(seed.claims),
    claimUsages: [],
    claimConflicts: [],
  };
}

export const store: StoreState = (globalRef.__pegasusStore ??= createStoreState());
