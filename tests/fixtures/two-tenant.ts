import { createStoreState, type StoreState } from "@/features/store";
import { createRequestContext, type RequestContext } from "@/server/context/request-context";
import { createInMemoryRepository } from "@/server/data/in-memory/adapter";
import type { MissionRepository } from "@/server/data/types";
import type {
  Application,
  ApplicationAnswer,
  Commitment,
  EvidenceItem,
  ExternalOrganisation,
  FundingOpportunity,
  Grant,
  Interaction,
  Organisation,
  OrganisationProfile,
  Person,
  Relationship,
  RelationshipLink,
  Task,
} from "@/types/domain";

/**
 * A two-tenant fixture.
 *
 * Tenant isolation cannot be proven with a single-organisation seed: every
 * query trivially "passes" because there is nothing else to leak. This fixture
 * adds a second organisation (Beacon Trust) alongside the seeded Northstar
 * workspace so isolation is actually falsifiable.
 *
 * It lives in tests rather than in the runtime seed deliberately — the demo
 * workspace should stay single-tenant.
 */

export const ORG_A = "org-northstar";
export const ORG_B = "org-beacon";
export const USER_A = "user-amara";
export const USER_B = "user-beacon-lead";

const FIXED_NOW = new Date("2026-07-21T10:00:00Z");

function audit() {
  return {
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    archivedAt: null,
  };
}

/** Minimal but complete records for the second tenant. */
function beaconRecords(state: StoreState): void {
  const organisation: Organisation = {
    id: ORG_B,
    name: "Beacon Trust",
    legalName: "Beacon Trust Limited",
    type: "charity",
    operatingRegions: ["Scotland"],
    isDemo: true,
    aiEnabled: true,
    audit: audit(),
  };

  // Reuse the seeded profile shape, re-pointed at tenant B.
  const sourceProfile = state.profiles[0];
  if (!sourceProfile) throw new Error("Seed state is missing the base organisation profile.");
  const profile: OrganisationProfile = {
    ...structuredClone(sourceProfile),
    organisationId: ORG_B,
  };

  const opportunity: FundingOpportunity = {
    id: "opp-beacon-1",
    organisationId: ORG_B,
    funderId: "funder-beacon-1",
    programmeName: "Beacon Community Fund",
    description: "Tenant B opportunity.",
    currency: "GBP",
    maxAward: 40000,
    deadline: "2026-09-30",
    fundingType: "project",
    eligibleOrgTypes: ["charity"],
    eligibleLocations: ["Scotland"],
    priorityThemes: ["Community"],
    requiredDocuments: [],
    reportingRequirements: [],
    stage: "discovered",
    probability: 30,
    saved: false,
    isDemo: true,
    audit: audit(),
  };

  const application: Application = {
    id: "app-beacon-1",
    organisationId: ORG_B,
    opportunityId: opportunity.id,
    title: "Beacon Community Fund application",
    status: "in_progress",
    contributorIds: [],
    reviewerIds: [],
    requiredDocuments: [],
    submissionChecklist: [],
    audit: audit(),
  };

  const answer: ApplicationAnswer = {
    id: "ans-beacon-1",
    applicationId: application.id,
    organisationId: ORG_B,
    order: 1,
    questionText: "Describe tenant B's beneficiaries.",
    draft: "Tenant B confidential draft.",
    status: "drafting",
    evidenceIds: [],
    audit: audit(),
  };

  const grant: Grant = {
    id: "grant-beacon-1",
    organisationId: ORG_B,
    funderId: "funder-beacon-1",
    title: "Beacon delivery grant",
    awardValue: 40000,
    currency: "GBP",
    restricted: true,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    spentToDate: 1000,
    conditions: [],
    status: "active",
    audit: audit(),
  };

  const evidence: EvidenceItem = {
    id: "ev-beacon-1",
    organisationId: ORG_B,
    title: "Beacon confidential evaluation",
    type: "evaluation",
    description: "Tenant B evidence that must never reach tenant A.",
    verification: "verified",
    tags: ["confidential"],
    audit: audit(),
  };

  const task: Task = {
    id: "task-beacon-1",
    organisationId: ORG_B,
    title: "Beacon internal task",
    status: "todo",
    audit: audit(),
  };

  /**
   * Tenant B's relationship layer.
   *
   * Relationship and communication records are the most consequential leak in
   * the product: a funder contact's address, what was said in a meeting and
   * what one charity has promised another are all here. Isolation is therefore
   * asserted over these tables specifically, not assumed to follow from the
   * adapter's general shape.
   */
  const externalOrganisation: ExternalOrganisation = {
    id: "xorg-beacon-1",
    organisationId: ORG_B,
    name: "Beacon Confidential Foundation",
    type: "foundation",
    website: "https://www.beacon-confidential.example",
    description: "Tenant B funder that must never appear in tenant A.",
    tags: ["confidential"],
    isDemo: true,
    audit: audit(),
  };

  const person: Person = {
    id: "per-beacon-1",
    organisationId: ORG_B,
    firstName: "Beacon",
    lastName: "Contact",
    jobTitle: "Grants Director",
    primaryExternalOrganisationId: externalOrganisation.id,
    emails: [
      {
        id: "cp-beacon-1",
        kind: "email",
        value: "confidential@beacon-confidential.example",
        isPrimary: true,
        verification: "verified",
      },
    ],
    phones: [],
    tags: [],
    isDemo: true,
    audit: audit(),
  };

  const relationship: Relationship = {
    id: "rel-beacon-1",
    organisationId: ORG_B,
    externalOrganisationId: externalOrganisation.id,
    status: "active",
    roles: ["funder"],
    startedAt: "2025-01-01",
    tags: [],
    notes: "Tenant B private relationship note.",
    audit: audit(),
  };

  const personRelationship: Relationship = {
    id: "rel-beacon-person-1",
    organisationId: ORG_B,
    personId: person.id,
    status: "active",
    roles: ["funder"],
    tags: [],
    audit: audit(),
  };

  const relationshipLink: RelationshipLink = {
    id: "rl-beacon-1",
    organisationId: ORG_B,
    relationshipId: relationship.id,
    entity: { type: "programme", id: "prog-youth" },
    role: "funder",
    createdAt: FIXED_NOW.toISOString(),
  };

  const interaction: Interaction = {
    id: "int-beacon-1",
    organisationId: ORG_B,
    type: "meeting",
    direction: "outbound",
    occurredAt: "2026-07-01T10:00:00Z",
    subject: "Beacon confidential board discussion",
    summary: "Tenant B private conversation content.",
    personIds: [person.id],
    externalOrganisationIds: [externalOrganisation.id],
    participantUserIds: [USER_B],
    links: [],
    source: "manual",
    recordedBy: USER_B,
    audit: audit(),
  };

  const commitment: Commitment = {
    id: "com-beacon-1",
    organisationId: ORG_B,
    title: "Beacon confidential commitment",
    direction: "we_owe",
    externalOrganisationId: externalOrganisation.id,
    personId: person.id,
    dueAt: "2026-08-30",
    status: "open",
    audit: audit(),
  };

  state.externalOrganisations.push(externalOrganisation);
  state.people.push(person);
  state.relationships.push(relationship, personRelationship);
  state.relationshipLinks.push(relationshipLink);
  state.interactions.push(interaction);
  state.commitments.push(commitment);

  state.organisations.push(organisation);
  state.profiles.push(profile);
  state.users.push({
    id: USER_B,
    name: "Beacon Lead",
    email: "lead@beacontrust.org.uk",
    avatarInitials: "BL",
  });
  state.members.push({
    id: "mem-beacon-1",
    organisationId: ORG_B,
    userId: USER_B,
    role: "owner",
    status: "active",
  });
  state.funders.push({
    id: "funder-beacon-1",
    organisationId: ORG_B,
    name: "Beacon Foundation",
    type: "trust",
    externalOrganisationId: externalOrganisation.id,
    isDemo: true,
  });
  state.opportunities.push(opportunity);
  state.applications.push(application);
  state.applicationAnswers.push(answer);
  state.grants.push(grant);
  state.grantReports.push({
    id: "rep-beacon-1",
    grantId: grant.id,
    organisationId: ORG_B,
    title: "Beacon progress report",
    dueDate: "2026-10-01",
    status: "not_started",
  });
  state.evidenceItems.push(evidence);
  state.tasks.push(task);
  state.notifications.push({
    id: "not-beacon-1",
    organisationId: ORG_B,
    title: "Beacon notification",
    body: "Tenant B only.",
    kind: "system",
    read: false,
    createdAt: FIXED_NOW.toISOString(),
  });
  // A claim for tenant B, so claim isolation is falsifiable rather than
  // trivially true. Its subject id deliberately mirrors tenant A's programme
  // predicate, so a leak would be indistinguishable from a legitimate read
  // unless scoping actually works.
  state.claims.push({
    id: "clm-beacon-1",
    organisationId: ORG_B,
    subject: { type: "programme", id: "prog-beacon" },
    predicate: "participants_supported",
    value: { type: "number", number: 42 },
    text: "Beacon supported 42 people.",
    kind: "fact",
    verification: "verified",
    sources: [
      {
        ref: { type: "evidence", id: evidence.id },
        authority: "organisation",
        retrievedAt: FIXED_NOW.toISOString(),
      },
    ],
    derivedFrom: [],
    supportedBy: [],
    producedBy: { method: "human", actorId: USER_B },
    assumptions: [],
    caveats: [],
    conflictsWith: [],
    verifiedBy: USER_B,
    verifiedAt: FIXED_NOW.toISOString(),
    audit: audit(),
  });
  state.claimUsages.push({
    id: "cuse-beacon-1",
    organisationId: ORG_B,
    claimId: "clm-beacon-1",
    usedIn: { type: "impact_report", id: "report-beacon-1" },
    context: "report section: executive_summary",
    usedAt: FIXED_NOW.toISOString(),
  });

  state.impactReports.push({
    id: "report-beacon-1",
    organisationId: ORG_B,
    title: "Beacon impact report",
    reportingPeriod: "2026",
    status: "draft",
    includedIndicatorIds: [],
    includedEvidenceIds: [],
    sections: [{ key: "executive_summary", title: "Executive summary", content: "" }],
    audit: audit(),
  });
}

export interface TwoTenantHarness {
  repo: MissionRepository;
  state: StoreState;
  ctxA: RequestContext;
  ctxB: RequestContext;
}

export function createTwoTenantHarness(): TwoTenantHarness {
  const state = createStoreState();
  beaconRecords(state);

  return {
    state,
    repo: createInMemoryRepository(state),
    ctxA: createRequestContext({
      organisationId: ORG_A,
      userId: USER_A,
      role: "owner",
      now: () => FIXED_NOW,
    }),
    ctxB: createRequestContext({
      organisationId: ORG_B,
      userId: USER_B,
      role: "owner",
      now: () => FIXED_NOW,
    }),
  };
}
