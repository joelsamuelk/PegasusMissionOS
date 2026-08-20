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
  Document,
  DocumentSource,
  DocumentVersion,
  ExtractedClaim,
  ClaimConflict,
  ClaimUsage,
  Commitment,
  EntityReference,
  EvidenceItem,
  EvidenceType,
  ExternalOrganisation,
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
  OpportunityQuestion,
  OnboardingRun,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  Outcome,
  Output,
  Person,
  Programme,
  Relation,
  RelationKind,
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
import type { ClaimInit } from "@/lib/knowledge";
import type {
  ProfileCandidate,
  ResearchSource,
} from "@/lib/organisation-intelligence/types";
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
  /**
   * Delivery units, as entities rather than the deprecated string arrays on
   * `Programme`. A string cannot receive an allocation or contribute to an
   * output, which is why these exist.
   */
  activities(ctx: RequestContext, programmeId: string): Promise<Activity[]>;
  getActivity(ctx: RequestContext, id: string): Promise<Activity | null>;
  outputs(ctx: RequestContext, programmeId: string): Promise<Output[]>;
  getOutput(ctx: RequestContext, id: string): Promise<Output | null>;
  getOutcome(ctx: RequestContext, id: string): Promise<Outcome | null>;
  measurements(ctx: RequestContext, indicatorId: string): Promise<IndicatorMeasurement[]>;
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
  /**
   * Evidence supporting any graph entity, through `evidences` relations.
   *
   * `forTarget` reads the legacy `EvidenceLink` table, whose target enum stops
   * at `outcome`. Evidence could therefore support the ambition but not the
   * number that establishes it — the gap MG-1 exists partly to close. New
   * callers use this; `forTarget` remains for the shipped call sites.
   */
  forEntity(ctx: RequestContext, entity: EntityReference): Promise<EvidenceItem[]>;
  /** Link evidence to any entity. Returns null if either side is out of tenant. */
  support(
    ctx: RequestContext,
    evidenceId: string,
    entity: EntityReference,
    note?: string,
  ): Promise<string | null>;
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

export interface CreateReportInit {
  title: string;
  type: ImpactReport["type"];
  reportingPeriod: string;
  definitionId?: string;
  programmeId?: string;
  grantId?: string;
  includedIndicatorIds?: string[];
  includedEvidenceIds?: string[];
}

export interface ReportRepository {
  list(ctx: RequestContext): Promise<ImpactReport[]>;
  get(ctx: RequestContext, id: string): Promise<ImpactReport | null>;

  // --- Templates -------------------------------------------------------

  definitions(ctx: RequestContext): Promise<ReportDefinition[]>;
  getDefinition(ctx: RequestContext, id: string): Promise<ReportDefinition | null>;
  /** What a template's sections need before they can be called complete. */
  requirements(ctx: RequestContext, definitionId: string): Promise<ReportRequirement[]>;
  saveDefinition(
    ctx: RequestContext,
    definition: ReportDefinition,
    requirements: ReportRequirement[],
  ): Promise<void>;

  /** Create a report from a definition, or from the built-in template. */
  create(ctx: RequestContext, init: CreateReportInit): Promise<string>;

  // --- Versions and snapshots ------------------------------------------

  versions(ctx: RequestContext, reportId: string): Promise<ReportVersion[]>;
  getSnapshot(ctx: RequestContext, snapshotId: string): Promise<ReportSnapshot | null>;
  /**
   * Cut an immutable version, pinning every figure it cites.
   *
   * The snapshot is taken here rather than by the caller, because a version
   * without one is exactly the failure this phase exists to prevent and a
   * caller that forgets would produce a version that silently re-resolves
   * against live data.
   */
  cutVersion(
    ctx: RequestContext,
    reportId: string,
    reason: ReportVersion["reason"],
    note?: string,
  ): Promise<ReportVersion | null>;

  // --- People and decisions --------------------------------------------

  contributors(ctx: RequestContext, reportId: string): Promise<ReportContributor[]>;
  addContributor(
    ctx: RequestContext,
    input: Omit<ReportContributor, "id" | "organisationId" | "invitedAt">,
  ): Promise<string | null>;
  approvals(ctx: RequestContext, reportId: string): Promise<ReportApproval[]>;
  /**
   * Record a decision against a version.
   *
   * Returns null when the version does not belong to the report or the tenant.
   * `changes_requested` without a comment is refused: an unexplained rejection
   * is not actionable, and the schema enforces the same rule independently.
   */
  recordApproval(
    ctx: RequestContext,
    input: {
      reportId: string;
      versionId: string;
      decision: ReportApproval["decision"];
      comment?: string;
    },
  ): Promise<string | null>;

  // --- Funder template ingestion ---------------------------------------

  ingestions(ctx: RequestContext): Promise<ReportTemplateIngestion[]>;
  getIngestion(ctx: RequestContext, id: string): Promise<ReportTemplateIngestion | null>;
  saveIngestion(ctx: RequestContext, ingestion: ReportTemplateIngestion): Promise<void>;
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

/**
 * The Mission Graph's edge surface.
 *
 * Strong, single-meaning edges stay as foreign keys. This carries the
 * many-to-many, cross-domain ones — the results chain, evidence support,
 * funder requirements — whose *existence is itself information*.
 */
export interface RelationInit {
  from: EntityReference;
  to: EntityReference;
  kind: RelationKind;
  role?: string;
  weight?: number;
  note?: string;
}

export interface GraphRepository {
  list(ctx: RequestContext): Promise<Relation[]>;
  /** Edges leaving an entity, optionally of one kind. */
  from(ctx: RequestContext, entity: EntityReference, kind?: RelationKind): Promise<Relation[]>;
  /** Edges arriving at an entity, optionally of one kind. */
  to(ctx: RequestContext, entity: EntityReference, kind?: RelationKind): Promise<Relation[]>;
  /**
   * Record an edge.
   *
   * Returns null when either endpoint is missing or belongs to another tenant.
   * Both ends are checked, not just the row's `organisationId`: this is the
   * first table where a row can point at anything, so a correctly-scoped row
   * could otherwise still reach across the boundary.
   */
  connect(ctx: RequestContext, init: RelationInit): Promise<Relation | null>;
  disconnect(ctx: RequestContext, id: string): Promise<void>;
  /**
   * Everything reachable from an entity by following one kind of edge.
   *
   * Cycle-safe and depth-bounded. This is the traversal the §9 acceptance
   * chain runs on: from an activity, following `contributes_to`, reach the
   * outcome it ultimately serves.
   */
  reach(
    ctx: RequestContext,
    from: EntityReference,
    kind: RelationKind,
    options?: { maxDepth?: number; direction?: "forward" | "backward" },
  ): Promise<EntityReference[]>;
}

/**
 * Money, as records rather than as a scalar on a grant.
 *
 * The calculation engine in `lib/finance-intelligence` is unchanged by this
 * interface and knows nothing about it. This supplies the inputs it has never
 * had; it does not re-implement any of its arithmetic.
 */
export interface FinanceRepository {
  funds(ctx: RequestContext): Promise<Fund[]>;
  getFund(ctx: RequestContext, id: string): Promise<Fund | null>;
  transactions(ctx: RequestContext): Promise<FinancialTransaction[]>;
  transactionsForFund(ctx: RequestContext, fundId: string): Promise<FinancialTransaction[]>;
  getTransaction(ctx: RequestContext, id: string): Promise<FinancialTransaction | null>;
  allocations(ctx: RequestContext): Promise<FinancialAllocation[]>;
  /** Allocations attributing money to one delivery entity. */
  allocationsFor(ctx: RequestContext, entity: EntityReference): Promise<FinancialAllocation[]>;
  budgets(ctx: RequestContext): Promise<Budget[]>;
  budgetLines(ctx: RequestContext, budgetId: string): Promise<BudgetLine[]>;
  recordTransaction(
    ctx: RequestContext,
    input: Omit<FinancialTransaction, "id" | "organisationId">,
  ): Promise<string>;
  /**
   * Attribute money to delivery.
   *
   * Returns null when the target is missing or out of tenant. An allocation
   * always carries its method and basis — there is deliberately no overload
   * that omits them, because a figure whose apportionment cannot be explained
   * is exactly what makes cost-per-outcome indefensible.
   */
  allocate(
    ctx: RequestContext,
    input: Omit<FinancialAllocation, "id" | "organisationId">,
  ): Promise<string | null>;
}

export interface StrategyRepository {
  priorities(ctx: RequestContext): Promise<StrategicPriority[]>;
  getPriority(ctx: RequestContext, id: string): Promise<StrategicPriority | null>;
  /** Programmes a priority pursues, through `pursues` relations. */
  programmesFor(ctx: RequestContext, priorityId: string): Promise<Programme[]>;
}

export interface RequirementRepository {
  list(ctx: RequestContext): Promise<ReportingRequirement[]>;
  get(ctx: RequestContext, id: string): Promise<ReportingRequirement | null>;
  forGrant(ctx: RequestContext, grantId: string): Promise<ReportingRequirement[]>;
  /**
   * What a requirement actually asks for, resolved through `requires` edges.
   *
   * This is the method that turns "what did we promise this funder?" from a
   * search over free text into a traversal.
   */
  requires(ctx: RequestContext, requirementId: string): Promise<EntityReference[]>;
}

/**
 * Documents.
 *
 * The separation between `Document`, `DocumentVersion` and `DocumentSource` is
 * carried through the interface deliberately: `addVersion` exists and there is
 * no `replaceContent`, because a corrected annual report must not silently
 * rewrite the bytes that a claim was extracted from and a report cited.
 */
export interface DocumentRepository {
  list(ctx: RequestContext): Promise<Document[]>;
  get(ctx: RequestContext, id: string): Promise<Document | null>;
  versions(ctx: RequestContext, documentId: string): Promise<DocumentVersion[]>;
  currentVersion(ctx: RequestContext, documentId: string): Promise<DocumentVersion | null>;
  sources(ctx: RequestContext, documentId: string): Promise<DocumentSource[]>;
  /**
   * Create a document and its first version.
   *
   * Returns the existing version when `contentHash` matches one already held:
   * re-uploading identical bytes is not a new version, and treating it as one
   * would duplicate every claim extracted from it.
   */
  create(
    ctx: RequestContext,
    input: {
      title: string;
      kind: Document["kind"];
      containsPersonalData: boolean;
      reportingPeriod?: string;
      tags?: string[];
      version: Omit<
        DocumentVersion,
        "id" | "organisationId" | "documentId" | "version" | "createdAt"
      >;
      source: Omit<DocumentSource, "id" | "organisationId" | "documentId" | "versionId">;
    },
  ): Promise<{ document: Document; version: DocumentVersion; deduplicated: boolean }>;
  addVersion(
    ctx: RequestContext,
    documentId: string,
    version: Omit<
      DocumentVersion,
      "id" | "organisationId" | "documentId" | "version" | "createdAt"
    >,
  ): Promise<DocumentVersion | null>;

  extractedClaims(ctx: RequestContext, documentId: string): Promise<ExtractedClaim[]>;
  saveExtractedClaims(
    ctx: RequestContext,
    claims: Omit<ExtractedClaim, "id" | "organisationId" | "createdAt" | "status">[],
  ): Promise<ExtractedClaim[]>;
  setExtractedClaimStatus(
    ctx: RequestContext,
    id: string,
    status: ExtractedClaim["status"],
    claimId?: string,
  ): Promise<void>;
}

export type CandidateDecision = "confirm" | "edit" | "reject";

/**
 * Onboarding research, persisted.
 *
 * Persisted rather than held in a request for a reason that is not
 * convenience: research reaches out to someone's website and to registers that
 * charge per call. A run lost on refresh gets repeated, which is rude to the
 * first and expensive to the second.
 */
export interface OnboardingRepository {
  runs(ctx: RequestContext): Promise<OnboardingRun[]>;
  getRun(ctx: RequestContext, id: string): Promise<OnboardingRun | null>;
  /** The most recent run, which is what the review screen shows. */
  latestRun(ctx: RequestContext): Promise<OnboardingRun | null>;
  startRun(
    ctx: RequestContext,
    input: OnboardingRun["input"],
  ): Promise<OnboardingRun>;
  updateRun(
    ctx: RequestContext,
    id: string,
    patch: Partial<Pick<OnboardingRun, "stage" | "status" | "counts" | "degraded" | "completedAt">>,
  ): Promise<void>;

  sources(ctx: RequestContext, runId: string): Promise<ResearchSource[]>;
  saveSources(ctx: RequestContext, runId: string, sources: ResearchSource[]): Promise<void>;

  candidates(ctx: RequestContext, runId: string): Promise<ProfileCandidate[]>;
  getCandidate(ctx: RequestContext, id: string): Promise<ProfileCandidate | null>;
  saveCandidates(
    ctx: RequestContext,
    runId: string,
    candidates: ProfileCandidate[],
  ): Promise<void>;

  /**
   * Record a reviewer's decision.
   *
   * This is the one transition in the whole pipeline a person must make, so it
   * takes an actor from the context and writes an audit record. Returns null
   * when the candidate is missing or belongs to another tenant.
   */
  decide(
    ctx: RequestContext,
    candidateId: string,
    decision: CandidateDecision,
    editedValue?: string,
  ): Promise<{ candidate: ProfileCandidate; claimId?: string } | null>;
  /** Decisions already made in this run, keyed by candidate id. */
  decisions(
    ctx: RequestContext,
    runId: string,
  ): Promise<Record<string, { decision: CandidateDecision; at: string; by?: string }>>;
}

export interface MissionRepository {
  readonly name: string;
  organisations: OrganisationRepository;
  claims: ClaimRepository;
  /** The Mission Graph's cross-domain edges. */
  graph: GraphRepository;
  documents: DocumentRepository;
  onboarding: OnboardingRepository;
  strategy: StrategyRepository;
  finance: FinanceRepository;
  requirements: RequirementRepository;
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
