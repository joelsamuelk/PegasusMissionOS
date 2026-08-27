import type {
  Activity,
  Application,
  ApplicationAnswer,
  Budget,
  BudgetLine,
  Claim,
  ClaimConflict,
  Commitment,
  EvidenceItem,
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
  Organisation,
  OrganisationProfile,
  Outcome,
  Output,
  Person,
  Programme,
  Relation,
  Relationship,
  RelationshipLink,
  ReportingRequirement,
  StrategicPriority,
  Task,
} from "@/types/domain";

/**
 * Everything the deterministic intelligence layer reasons over.
 *
 * A single, explicitly assembled value, and that is the design. Three
 * properties follow from it that a "give the engine a repository" shape cannot
 * have:
 *
 * 1. **The engine is pure.** Every detector is a function from this to
 *    attention items, so cross-domain reasoning is unit-testable without a
 *    store, a session or a clock.
 * 2. **The context is enumerable.** What was assembled is exactly what a model
 *    can be shown, so `ContextSnapshot` can be honest about it rather than
 *    approximating.
 * 3. **Nothing can widen the query.** A detector cannot decide it also needs
 *    another tenant's grants, because it has no way to ask for anything.
 *
 * Fields are arrays rather than maps because the assembler already scoped them
 * and the detectors index what they need. Anything absent is absent because it
 * was not authorised or not requested, never because it failed to load — the
 * assembler records withholding in the snapshot rather than dropping it.
 */
export interface MissionSnapshot {
  organisationId: string;
  /** The request clock. Detectors never call `new Date()`. */
  now: Date;
  currency: string;

  organisation: Organisation | null;
  profile: OrganisationProfile | null;

  strategicPriorities: StrategicPriority[];

  programmes: Programme[];
  activities: Activity[];
  outputs: Output[];
  outcomes: Outcome[];
  indicators: Indicator[];
  measurements: IndicatorMeasurement[];

  grants: Grant[];
  payments: GrantPayment[];
  deliverables: GrantDeliverable[];
  grantReports: GrantReport[];
  /** Which grants fund which programmes. */
  programmeGrants: { programmeId: string; grantId: string }[];

  funders: Funder[];
  opportunities: FundingOpportunity[];
  applications: Application[];
  answers: ApplicationAnswer[];
  fitAssessments: FitAssessment[];

  requirements: ReportingRequirement[];
  reports: ImpactReport[];

  evidence: EvidenceItem[];
  /** Legacy typed links plus `evidences` relations, already unioned. */
  evidenceTargets: { evidenceId: string; targetType: string; targetId: string }[];

  relationships: Relationship[];
  externalOrganisations: ExternalOrganisation[];
  people: Person[];
  relationshipLinks: RelationshipLink[];
  interactions: Interaction[];
  commitments: Commitment[];

  funds: Fund[];
  transactions: FinancialTransaction[];
  allocations: FinancialAllocation[];
  budgets: Budget[];
  budgetLines: BudgetLine[];

  relations: Relation[];
  claims: Claim[];
  claimConflicts: ClaimConflict[];
  tasks: Task[];
}

/** An empty snapshot. Detectors must tolerate one and return nothing. */
export function emptySnapshot(
  organisationId: string,
  now: Date,
  currency = "GBP",
): MissionSnapshot {
  return {
    organisationId,
    now,
    currency,
    organisation: null,
    profile: null,
    strategicPriorities: [],
    programmes: [],
    activities: [],
    outputs: [],
    outcomes: [],
    indicators: [],
    measurements: [],
    grants: [],
    payments: [],
    deliverables: [],
    grantReports: [],
    programmeGrants: [],
    funders: [],
    opportunities: [],
    applications: [],
    answers: [],
    fitAssessments: [],
    requirements: [],
    reports: [],
    evidence: [],
    evidenceTargets: [],
    relationships: [],
    externalOrganisations: [],
    people: [],
    relationshipLinks: [],
    interactions: [],
    commitments: [],
    funds: [],
    transactions: [],
    allocations: [],
    budgets: [],
    budgetLines: [],
    relations: [],
    claims: [],
    claimConflicts: [],
    tasks: [],
  };
}
