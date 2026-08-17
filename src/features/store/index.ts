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
  ActivityEvent,
  AIGeneration,
  Application,
  ApplicationAnswer,
  AuditEvent,
  Claim,
  ClaimConflict,
  ClaimUsage,
  Commitment,
  EvidenceItem,
  EvidenceLink,
  ExternalOrganisation,
  FitAssessment,
  Funder,
  FundingOpportunity,
  Grant,
  GrantDeliverable,
  GrantPayment,
  GrantReport,
  ImpactReport,
  Indicator,
  Interaction,
  Notification,
  OpportunityQuestion,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  Outcome,
  Person,
  Programme,
  ProgrammeGrantLink,
  Relationship,
  RelationshipLink,
  Task,
  User,
} from "@/types/domain";
import * as seed from "./seed";

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
  evidenceItems: EvidenceItem[];
  evidenceLinks: EvidenceLink[];
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
    evidenceItems: clone(seed.evidenceItems),
    evidenceLinks: clone(seed.evidenceLinks),
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
    auditEvents: clone(seed.auditEvents),
    fitAssessments: [],
    aiGenerations: [],
    claims: clone(seed.claims),
    claimUsages: [],
    claimConflicts: [],
  };
}

export const store: StoreState = (globalRef.__pegasusStore ??= createStoreState());
