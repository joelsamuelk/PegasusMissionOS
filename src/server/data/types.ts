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
  EntityReference,
  EvidenceItem,
  EvidenceType,
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
  Relationship,
  RelationshipLink,
  Task,
  User,
} from "@/types/domain";
import type { ClaimInit } from "@/lib/knowledge";
import type { RequestContext } from "@/server/context/request-context";

/**
 * The data boundary for Mission OS.
 *
 * Two rules make this interface what it is:
 *
 * 1. **Every method is async.** The in-memory adapter resolves immediately, but
 *    the signature is the one a network-backed adapter needs. Inverting this
 *    after call sites were written against synchronous access was the single
 *    largest migration risk identified in the architecture audit.
 *
 * 2. **Every method takes a `RequestContext` first.** Tenant scoping is not
 *    optional and not inferred from module state. An adapter that ignores
 *    `ctx.organisationId` fails the shared contract tests.
 *
 * Nothing outside `src/server/data/` may import a storage implementation.
 * Callers depend on this interface only.
 */

export interface OrganisationRepository {
  get(ctx: RequestContext): Promise<Organisation | null>;
  profile(ctx: RequestContext): Promise<OrganisationProfile | null>;
  members(ctx: RequestContext): Promise<OrganisationMember[]>;
  /** Users who hold an active membership of the context organisation. */
  users(ctx: RequestContext): Promise<User[]>;
  user(ctx: RequestContext, userId: string): Promise<User | null>;
  currentUser(ctx: RequestContext): Promise<User | null>;
  currentMember(ctx: RequestContext): Promise<OrganisationMember | null>;
  setAiEnabled(ctx: RequestContext, enabled: boolean): Promise<void>;
}

export interface FundingRepository {
  listOpportunities(ctx: RequestContext): Promise<FundingOpportunity[]>;
  getOpportunity(ctx: RequestContext, id: string): Promise<FundingOpportunity | null>;
  /** The published application questions for an opportunity, in order. */
  opportunityQuestions(
    ctx: RequestContext,
    opportunityId: string,
  ): Promise<OpportunityQuestion[]>;
  listFunders(ctx: RequestContext): Promise<Funder[]>;
  getFunder(ctx: RequestContext, id: string): Promise<Funder | null>;
  moveStage(
    ctx: RequestContext,
    id: string,
    stage: FundingOpportunity["stage"],
  ): Promise<void>;
  toggleSaved(ctx: RequestContext, id: string): Promise<void>;
  getFitAssessment(ctx: RequestContext, opportunityId: string): Promise<FitAssessment | null>;
  saveFitAssessment(ctx: RequestContext, assessment: FitAssessment): Promise<void>;
}

export interface ApplicationRepository {
  list(ctx: RequestContext): Promise<Application[]>;
  get(ctx: RequestContext, id: string): Promise<Application | null>;
  answers(ctx: RequestContext, applicationId: string): Promise<ApplicationAnswer[]>;
  getAnswer(ctx: RequestContext, answerId: string): Promise<ApplicationAnswer | null>;
  saveAnswer(
    ctx: RequestContext,
    answerId: string,
    draft: string,
    provenance?: ApplicationAnswer["provenance"],
  ): Promise<void>;
  setAnswerStatus(
    ctx: RequestContext,
    answerId: string,
    status: ApplicationAnswer["status"],
  ): Promise<void>;
  /** Returns the new grant id, or null when the application cannot convert. */
  convertToGrant(ctx: RequestContext, applicationId: string): Promise<string | null>;
}

export interface GrantRepository {
  list(ctx: RequestContext): Promise<Grant[]>;
  get(ctx: RequestContext, id: string): Promise<Grant | null>;
  payments(ctx: RequestContext, grantId: string): Promise<GrantPayment[]>;
  deliverables(ctx: RequestContext, grantId: string): Promise<GrantDeliverable[]>;
  reports(ctx: RequestContext, grantId: string): Promise<GrantReport[]>;
  allReports(ctx: RequestContext): Promise<GrantReport[]>;
}

export interface ProgrammeRepository {
  list(ctx: RequestContext): Promise<Programme[]>;
  get(ctx: RequestContext, id: string): Promise<Programme | null>;
  outcomes(ctx: RequestContext, programmeId: string): Promise<Outcome[]>;
  indicatorsForOutcome(ctx: RequestContext, outcomeId: string): Promise<Indicator[]>;
  indicatorsForProgramme(ctx: RequestContext, programmeId: string): Promise<Indicator[]>;
  allIndicators(ctx: RequestContext): Promise<Indicator[]>;
  getIndicator(ctx: RequestContext, id: string): Promise<Indicator | null>;
  updateIndicator(
    ctx: RequestContext,
    indicatorId: string,
    value: number,
    note?: string,
  ): Promise<void>;
  grantsFor(ctx: RequestContext, programmeId: string): Promise<Grant[]>;
}

export interface EvidenceRepository {
  list(ctx: RequestContext): Promise<EvidenceItem[]>;
  get(ctx: RequestContext, id: string): Promise<EvidenceItem | null>;
  forTarget(
    ctx: RequestContext,
    targetType: string,
    targetId: string,
  ): Promise<EvidenceItem[]>;
  add(
    ctx: RequestContext,
    item: {
      title: string;
      type: EvidenceType;
      description: string;
      tags: string[];
      verification?: EvidenceItem["verification"];
    },
  ): Promise<string>;
}

export interface ReportRepository {
  list(ctx: RequestContext): Promise<ImpactReport[]>;
  get(ctx: RequestContext, id: string): Promise<ImpactReport | null>;
  saveSection(
    ctx: RequestContext,
    reportId: string,
    sectionKey: string,
    content: string,
    provenance?: ImpactReport["sections"][number]["provenance"],
  ): Promise<void>;
  setStatus(
    ctx: RequestContext,
    reportId: string,
    status: ImpactReport["status"],
  ): Promise<void>;
}

export interface WorkspaceRepository {
  tasks(ctx: RequestContext): Promise<Task[]>;
  openTasks(ctx: RequestContext): Promise<Task[]>;
  notifications(ctx: RequestContext): Promise<Notification[]>;
  activity(ctx: RequestContext): Promise<ActivityEvent[]>;
  toggleTask(ctx: RequestContext, taskId: string): Promise<void>;
}

export interface AuditRepository {
  list(ctx: RequestContext): Promise<AuditEvent[]>;
  record(
    ctx: RequestContext,
    event: Omit<AuditEvent, "id" | "createdAt" | "organisationId" | "actorId" | "actorName">,
  ): Promise<void>;
  recordAiGeneration(
    ctx: RequestContext,
    generation: Omit<AIGeneration, "id" | "createdAt" | "organisationId" | "userId">,
  ): Promise<AIGeneration>;
  aiGenerations(ctx: RequestContext): Promise<AIGeneration[]>;
}

/**
 * Which party a relationship-scoped query is about.
 *
 * Interactions and commitments attach to people *and* organisations, and a
 * relationship page needs both: an email from a named funder contact belongs on
 * the funder's timeline as well as the person's. Passing the pair explicitly
 * keeps that fan-out in the data layer rather than in every caller.
 */
export interface RelationshipParty {
  externalOrganisationId?: string;
  personIds?: string[];
}

export interface RelationshipRepository {
  // External organisations
  listOrganisations(ctx: RequestContext): Promise<ExternalOrganisation[]>;
  getOrganisation(ctx: RequestContext, id: string): Promise<ExternalOrganisation | null>;

  // People
  listPeople(ctx: RequestContext): Promise<Person[]>;
  getPerson(ctx: RequestContext, id: string): Promise<Person | null>;
  peopleForOrganisation(
    ctx: RequestContext,
    externalOrganisationId: string,
  ): Promise<Person[]>;

  // Relationships
  list(ctx: RequestContext): Promise<Relationship[]>;
  get(ctx: RequestContext, id: string): Promise<Relationship | null>;
  forOrganisation(
    ctx: RequestContext,
    externalOrganisationId: string,
  ): Promise<Relationship | null>;
  forPerson(ctx: RequestContext, personId: string): Promise<Relationship | null>;

  // Mission Graph edges
  links(ctx: RequestContext, relationshipId: string): Promise<RelationshipLink[]>;
  /** Relationships linked to a Mission Graph entity, e.g. a programme's partners. */
  linksForEntity(ctx: RequestContext, entity: EntityReference): Promise<RelationshipLink[]>;

  // Interactions
  listInteractions(ctx: RequestContext): Promise<Interaction[]>;
  interactionsFor(ctx: RequestContext, party: RelationshipParty): Promise<Interaction[]>;
  logInteraction(
    ctx: RequestContext,
    input: Omit<Interaction, "id" | "organisationId" | "audit" | "recordedBy">,
  ): Promise<string>;

  // Commitments
  listCommitments(ctx: RequestContext): Promise<Commitment[]>;
  commitmentsFor(ctx: RequestContext, party: RelationshipParty): Promise<Commitment[]>;
  createCommitment(
    ctx: RequestContext,
    input: Omit<Commitment, "id" | "organisationId" | "audit" | "completedAt">,
  ): Promise<string>;
  setCommitmentStatus(
    ctx: RequestContext,
    commitmentId: string,
    status: Commitment["status"],
  ): Promise<void>;

  /**
   * The funder ↔ external organisation bridge.
   *
   * "Funder" is a role an external organisation plays. These two methods are
   * how the funding module reaches the relationship layer without the funding
   * module being rewritten.
   */
  organisationForFunder(
    ctx: RequestContext,
    funderId: string,
  ): Promise<ExternalOrganisation | null>;
  funderForOrganisation(
    ctx: RequestContext,
    externalOrganisationId: string,
  ): Promise<Funder | null>;
}

/**
 * The Knowledge layer's persistence.
 *
 * Claims are immutable: there is deliberately no `update`. Correction goes
 * through `supersede`, which writes a new claim and links the old one, so a
 * report that cited the previous value still resolves to what it cited.
 */
export interface ClaimRepository {
  list(ctx: RequestContext): Promise<Claim[]>;
  get(ctx: RequestContext, id: string): Promise<Claim | null>;
  /** Every claim about an entity, newest first. Includes superseded ones. */
  forSubject(ctx: RequestContext, subject: EntityReference): Promise<Claim[]>;
  /** The current claim for a subject/predicate pair, if there is one. */
  current(
    ctx: RequestContext,
    subject: EntityReference,
    predicate: string,
  ): Promise<Claim | null>;
  create(ctx: RequestContext, init: Omit<ClaimInit, "id" | "organisationId" | "now">): Promise<Claim>;
  /** Write a corrected or confirmed claim and link it to its predecessor. */
  supersede(ctx: RequestContext, previousId: string, next: Claim): Promise<Claim | null>;

  /** Claims a claim stands on, resolved for tracing. */
  supportChain(ctx: RequestContext, id: string): Promise<Claim[]>;

  recordUsage(
    ctx: RequestContext,
    usage: { claimId: string; usedIn: EntityReference; context?: string },
  ): Promise<void>;
  /** Where a claim has been used — the reverse index. */
  usages(ctx: RequestContext, claimId: string): Promise<ClaimUsage[]>;
  /** Claims used in a given entity, e.g. every figure in a report. */
  usedIn(ctx: RequestContext, entity: EntityReference): Promise<Claim[]>;

  conflicts(ctx: RequestContext): Promise<ClaimConflict[]>;
  recordConflict(
    ctx: RequestContext,
    conflict: Omit<ClaimConflict, "id" | "organisationId" | "createdAt">,
  ): Promise<void>;
}

export interface MissionRepository {
  readonly name: string;
  organisations: OrganisationRepository;
  claims: ClaimRepository;
  funding: FundingRepository;
  applications: ApplicationRepository;
  grants: GrantRepository;
  programmes: ProgrammeRepository;
  evidence: EvidenceRepository;
  reports: ReportRepository;
  relationships: RelationshipRepository;
  workspace: WorkspaceRepository;
  audit: AuditRepository;
}
