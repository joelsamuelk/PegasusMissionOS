import type {
  Application,
  Commitment,
  ExternalOrganisation,
  Funder,
  FundingOpportunity,
  Grant,
  GrantReport,
  ImpactReport,
  Indicator,
  Interaction,
  Person,
  Programme,
  Relationship,
  RelationshipLink,
  Task,
  User,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import {
  computeRelationshipHealth,
  commitmentState,
  type RelationshipHealth,
} from "@/lib/logic/relationship-health";
import {
  buildRelationshipTimeline,
  type TimelineEvent,
} from "@/lib/logic/relationship-timeline";
import {
  buildRelationshipBrief,
  type RelationshipBrief,
} from "@/lib/logic/relationship-brief";

/**
 * Relationship context assembly.
 *
 * This is where "what's happening with The Henderson Trust?" is answered. It
 * reads the funding, grant, programme, impact and task records that already
 * exist and joins them through the relationship layer — it does not hold a
 * copy of any of them.
 *
 * Two invariants, matching `services/context.ts`:
 *
 * 1. Every read goes through the tenant-scoped repository, so a relationship
 *    view cannot reach another organisation's data even by mistake.
 * 2. All interpretation happens in pure functions in `lib/logic`, which are
 *    unit-tested without a repository. This module only fetches and joins.
 */

export interface RelationshipView {
  organisation: ExternalOrganisation;
  relationship: Relationship | null;
  funder: Funder | null;
  people: Person[];
  owner: User | null;
  grants: Grant[];
  activeGrants: Grant[];
  grantReports: GrantReport[];
  applications: Application[];
  opportunities: FundingOpportunity[];
  programmes: Programme[];
  indicators: Indicator[];
  impactReports: ImpactReport[];
  interactions: Interaction[];
  commitments: Commitment[];
  openCommitments: Commitment[];
  overdueCommitments: Commitment[];
  tasks: Task[];
  links: RelationshipLink[];
  health: RelationshipHealth;
  timeline: TimelineEvent[];
  brief: RelationshipBrief;
  totalFunding: number;
  activeFunding: number;
}

export async function buildRelationshipView(
  ctx: RequestContext,
  repo: MissionRepository,
  externalOrganisationId: string,
): Promise<RelationshipView | null> {
  const organisation = await repo.relationships.getOrganisation(ctx, externalOrganisationId);
  if (!organisation) return null;

  const now = ctx.now();

  const [relationship, funder, people, allGrants, allApplications, allOpportunities] =
    await Promise.all([
      repo.relationships.forOrganisation(ctx, organisation.id),
      repo.relationships.funderForOrganisation(ctx, organisation.id),
      repo.relationships.peopleForOrganisation(ctx, organisation.id),
      repo.grants.list(ctx),
      repo.applications.list(ctx),
      repo.funding.listOpportunities(ctx),
    ]);

  const personIds = people.map((p) => p.id);
  const party = { externalOrganisationId: organisation.id, personIds };

  const [interactions, commitments, links, allTasks, allImpactReports] = await Promise.all([
    repo.relationships.interactionsFor(ctx, party),
    repo.relationships.commitmentsFor(ctx, party),
    relationship ? repo.relationships.links(ctx, relationship.id) : Promise.resolve([]),
    repo.workspace.tasks(ctx),
    repo.reports.list(ctx),
  ]);

  // Funding: reached through the funder bridge. "Funder" is a role this body
  // plays, so the funding module keeps owning the grant, and the relationship
  // layer only joins to it.
  const grants = funder ? allGrants.filter((g) => g.funderId === funder.id) : [];
  const activeGrants = grants.filter((g) => g.status === "active");
  const grantIds = new Set(grants.map((g) => g.id));

  const opportunities = funder
    ? allOpportunities.filter((o) => o.funderId === funder.id)
    : [];
  const opportunityIds = new Set(opportunities.map((o) => o.id));
  const applications = allApplications.filter((a) => opportunityIds.has(a.opportunityId));

  const grantReportGroups = await Promise.all(
    grants.map((g) => repo.grants.reports(ctx, g.id)),
  );
  const grantReports = grantReportGroups.flat();

  const paymentGroups = await Promise.all(grants.map((g) => repo.grants.payments(ctx, g.id)));
  const payments = paymentGroups.flat();

  // Programmes: through the relationship link table, plus any programme this
  // party funds via a grant.
  const linkedProgrammeIds = new Set(
    links.filter((l) => l.entity.type === "programme").map((l) => l.entity.id),
  );
  const allProgrammes = await repo.programmes.list(ctx);
  const fundedProgrammes = await Promise.all(
    allProgrammes.map(async (p) => ({
      programme: p,
      grants: await repo.programmes.grantsFor(ctx, p.id),
    })),
  );
  for (const entry of fundedProgrammes) {
    if (entry.grants.some((g) => grantIds.has(g.id))) linkedProgrammeIds.add(entry.programme.id);
  }
  const programmes = allProgrammes.filter((p) => linkedProgrammeIds.has(p.id));

  const indicatorGroups = await Promise.all(
    programmes.map((p) => repo.programmes.indicatorsForProgramme(ctx, p.id)),
  );
  const indicators = indicatorGroups.flat();

  const impactReports = allImpactReports.filter(
    (r) =>
      (r.grantId && grantIds.has(r.grantId)) ||
      (r.programmeId && linkedProgrammeIds.has(r.programmeId)),
  );

  // Tasks already relate to Mission Graph entities; reuse that, do not invent
  // a relationship-specific task type.
  const applicationIds = new Set(applications.map((a) => a.id));
  const tasks = allTasks.filter(
    (t) =>
      (t.relatedType === "grant" && t.relatedId && grantIds.has(t.relatedId)) ||
      (t.relatedType === "application" && t.relatedId && applicationIds.has(t.relatedId)),
  );

  const openCommitments = commitments.filter((c) => c.status === "open");
  const overdueCommitments = openCommitments.filter(
    (c) => commitmentState(c, now) === "overdue",
  );

  const effectiveRelationship = relationship ?? placeholderRelationship(organisation);

  const health = computeRelationshipHealth({
    relationship: effectiveRelationship,
    interactions,
    commitments,
    activeFundingCount: activeGrants.length,
    historicalFundingCount: grants.length - activeGrants.length,
    activePartnershipCount: programmes.filter((p) => p.status === "active").length,
    now,
  });

  const owner = effectiveRelationship.ownerId
    ? await repo.organisations.user(ctx, effectiveRelationship.ownerId)
    : null;

  const timeline = buildRelationshipTimeline({
    relationship: effectiveRelationship,
    interactions,
    grants,
    payments,
    grantReports,
    applications,
    impactReports,
    commitments,
    tasks,
    now,
  });

  const brief = buildRelationshipBrief({
    organisation,
    relationship: effectiveRelationship,
    health,
    people,
    ownerName: owner?.name,
    grants,
    grantReports,
    applications,
    programmes,
    indicators,
    interactions,
    commitments,
    now,
  });

  return {
    organisation,
    relationship,
    funder,
    people,
    owner,
    grants,
    activeGrants,
    grantReports,
    applications,
    opportunities,
    programmes,
    indicators,
    impactReports,
    interactions,
    commitments,
    openCommitments,
    overdueCommitments,
    tasks,
    links,
    health,
    timeline,
    brief,
    totalFunding: grants.reduce((s, g) => s + g.awardValue, 0),
    activeFunding: activeGrants.reduce((s, g) => s + g.awardValue, 0),
  };
}

/**
 * An organisation recorded without a relationship yet is still a real thing to
 * show. This keeps the page honest — health reports "no interaction recorded"
 * rather than the page failing — without writing a speculative record.
 */
function placeholderRelationship(organisation: ExternalOrganisation): Relationship {
  return {
    id: `unrecorded-${organisation.id}`,
    organisationId: organisation.organisationId,
    externalOrganisationId: organisation.id,
    status: "prospect",
    roles: [],
    tags: [],
    audit: organisation.audit,
  };
}

// --- Portfolio and attention -------------------------------------------

export interface RelationshipSummary {
  organisation: ExternalOrganisation;
  relationship: Relationship;
  health: RelationshipHealth;
  primaryContact: Person | null;
  ownerName?: string;
  activeGrantCount: number;
  totalFunding: number;
  openCommitmentCount: number;
  overdueCommitmentCount: number;
  lastInteractionAt?: string;
}

export interface RelationshipPortfolio {
  summaries: RelationshipSummary[];
  needsAttention: RelationshipSummary[];
  counts: {
    activeFunders: number;
    prospectiveFunders: number;
    deliveryPartners: number;
    needsAttention: number;
    openCommitments: number;
    overdueCommitments: number;
  };
}

/**
 * The relationship portfolio.
 *
 * Every count here is derived from records, not asserted. "18 active funders"
 * must mean eighteen relationships carrying a funder role, or the number is
 * worse than not showing it.
 */
export async function buildRelationshipPortfolio(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<RelationshipPortfolio> {
  const now = ctx.now();

  const [relationships, organisations, people, grants, programmes, users] = await Promise.all([
    repo.relationships.list(ctx),
    repo.relationships.listOrganisations(ctx),
    repo.relationships.listPeople(ctx),
    repo.grants.list(ctx),
    repo.programmes.list(ctx),
    repo.organisations.users(ctx),
  ]);

  const orgById = new Map(organisations.map((o) => [o.id, o]));
  const summaries: RelationshipSummary[] = [];

  const programmeIdsActive = new Set(
    programmes.filter((p) => p.status === "active").map((p) => p.id),
  );

  for (const relationship of relationships) {
    // Organisation-level relationships only: a person's relationship is shown
    // on the person page, and listing both would double-count the portfolio.
    if (!relationship.externalOrganisationId) continue;
    const organisation = orgById.get(relationship.externalOrganisationId);
    if (!organisation) continue;

    const orgPeople = people.filter(
      (p) => p.primaryExternalOrganisationId === organisation.id,
    );
    const party = {
      externalOrganisationId: organisation.id,
      personIds: orgPeople.map((p) => p.id),
    };

    const [interactions, commitments, funder, links] = await Promise.all([
      repo.relationships.interactionsFor(ctx, party),
      repo.relationships.commitmentsFor(ctx, party),
      repo.relationships.funderForOrganisation(ctx, organisation.id),
      repo.relationships.links(ctx, relationship.id),
    ]);

    const partyGrants = funder ? grants.filter((g) => g.funderId === funder.id) : [];
    const activeGrants = partyGrants.filter((g) => g.status === "active");
    const activePartnerships = links.filter(
      (l) => l.entity.type === "programme" && programmeIdsActive.has(l.entity.id),
    ).length;

    const health = computeRelationshipHealth({
      relationship,
      interactions,
      commitments,
      activeFundingCount: activeGrants.length,
      historicalFundingCount: partyGrants.length - activeGrants.length,
      activePartnershipCount: activePartnerships,
      now,
    });

    const open = commitments.filter((c) => c.status === "open");

    summaries.push({
      organisation,
      relationship,
      health,
      primaryContact: orgPeople[0] ?? null,
      ownerName: users.find((u) => u.id === relationship.ownerId)?.name,
      activeGrantCount: activeGrants.length,
      totalFunding: partyGrants.reduce((s, g) => s + g.awardValue, 0),
      openCommitmentCount: open.length,
      overdueCommitmentCount: open.filter((c) => commitmentState(c, now) === "overdue").length,
      lastInteractionAt: health.lastInteractionAt,
    });
  }

  const hasRole = (s: RelationshipSummary, role: string) =>
    s.relationship.roles.includes(role);

  const needsAttention = summaries
    .filter((s) => s.health.state === "needs_attention")
    // Most overdue commitments first, then longest silence.
    .sort(
      (a, b) =>
        b.overdueCommitmentCount - a.overdueCommitmentCount ||
        (b.health.daysSinceLastInteraction ?? 0) - (a.health.daysSinceLastInteraction ?? 0),
    );

  return {
    summaries: summaries.sort((a, b) =>
      a.organisation.name.localeCompare(b.organisation.name),
    ),
    needsAttention,
    counts: {
      activeFunders: summaries.filter(
        (s) => hasRole(s, "funder") && s.relationship.status === "active",
      ).length,
      prospectiveFunders: summaries.filter((s) => hasRole(s, "prospective_funder")).length,
      deliveryPartners: summaries.filter(
        (s) =>
          hasRole(s, "delivery_partner") ||
          hasRole(s, "programme_partner") ||
          hasRole(s, "referral_partner"),
      ).length,
      needsAttention: needsAttention.length,
      openCommitments: summaries.reduce((s, x) => s + x.openCommitmentCount, 0),
      overdueCommitments: summaries.reduce((s, x) => s + x.overdueCommitmentCount, 0),
    },
  };
}

// --- Person view --------------------------------------------------------

export interface PersonView {
  person: Person;
  relationship: Relationship | null;
  organisation: ExternalOrganisation | null;
  interactions: Interaction[];
  commitments: Commitment[];
  openCommitments: Commitment[];
  health: RelationshipHealth;
  timeline: TimelineEvent[];
  connectedEntities: { label: string; href?: string }[];
}

export async function buildPersonView(
  ctx: RequestContext,
  repo: MissionRepository,
  personId: string,
): Promise<PersonView | null> {
  const person = await repo.relationships.getPerson(ctx, personId);
  if (!person) return null;

  const now = ctx.now();
  const party = { personIds: [person.id] };

  const [relationship, organisation, interactions, commitments] = await Promise.all([
    repo.relationships.forPerson(ctx, person.id),
    person.primaryExternalOrganisationId
      ? repo.relationships.getOrganisation(ctx, person.primaryExternalOrganisationId)
      : Promise.resolve(null),
    repo.relationships.interactionsFor(ctx, party),
    repo.relationships.commitmentsFor(ctx, party),
  ]);

  const effectiveRelationship =
    relationship ??
    ({
      id: `unrecorded-${person.id}`,
      organisationId: person.organisationId,
      personId: person.id,
      status: "prospect",
      roles: [],
      tags: [],
      audit: person.audit,
    } satisfies Relationship);

  /**
   * A person's health reads the live work their organisation holds. Judging a
   * four-year funder contact as if no work existed — because the grant hangs
   * off the organisation rather than the individual — would be misleading.
   */
  const funder = organisation
    ? await repo.relationships.funderForOrganisation(ctx, organisation.id)
    : null;
  const orgGrants = funder
    ? (await repo.grants.list(ctx)).filter((g) => g.funderId === funder.id)
    : [];
  const activeOrgGrants = orgGrants.filter((g) => g.status === "active");

  const health = computeRelationshipHealth({
    relationship: effectiveRelationship,
    interactions,
    commitments,
    activeFundingCount: activeOrgGrants.length,
    historicalFundingCount: orgGrants.length - activeOrgGrants.length,
    activePartnershipCount: 0,
    now,
  });

  const timeline = buildRelationshipTimeline({
    relationship: effectiveRelationship,
    interactions,
    grants: [],
    payments: [],
    grantReports: [],
    applications: [],
    impactReports: [],
    commitments,
    tasks: [],
    now,
  });

  // What this person connects to, read from the interactions they took part
  // in and from their open commitments. Names are resolved from the records
  // themselves rather than trusting the denormalised `label` on the reference.
  const [allGrants, allApplications, allOpportunities, allProgrammes] = await Promise.all([
    repo.grants.list(ctx),
    repo.applications.list(ctx),
    repo.funding.listOpportunities(ctx),
    repo.programmes.list(ctx),
  ]);

  const nameFor = (type: string, id: string): string | null => {
    switch (type) {
      case "grant":
        return allGrants.find((g) => g.id === id)?.title ?? null;
      case "application":
        return allApplications.find((a) => a.id === id)?.title ?? null;
      case "funding_opportunity":
        return allOpportunities.find((o) => o.id === id)?.programmeName ?? null;
      case "programme":
        return allProgrammes.find((p) => p.id === id)?.name ?? null;
      default:
        return null;
    }
  };

  const seen = new Set<string>();
  const connectedEntities: { label: string; href?: string }[] = [];
  const references = [
    ...interactions.flatMap((i) => i.links),
    ...commitments.flatMap((c) => (c.relatedEntity ? [c.relatedEntity] : [])),
  ];
  for (const link of references) {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = nameFor(link.type, link.id) ?? link.label;
    // A reference we cannot resolve to a record is not shown. Displaying a raw
    // id would look like data while telling the reader nothing.
    if (!name) continue;
    connectedEntities.push({ label: name, href: hrefForEntity(link.type, link.id) });
  }

  return {
    person,
    relationship,
    organisation,
    interactions,
    commitments,
    openCommitments: commitments.filter((c) => c.status === "open"),
    health,
    timeline,
    connectedEntities,
  };
}

// --- Programme ecosystem ------------------------------------------------

export interface EcosystemEntry {
  organisation: ExternalOrganisation;
  relationship: Relationship;
  /** How they relate to this programme specifically. */
  role?: string;
  note?: string;
  primaryContact: Person | null;
}

/**
 * Who helps deliver a programme.
 *
 * Read from `RelationshipLink` rather than `Programme.deliveryPartners:
 * string[]`, so a partner is a record that can be opened, contacted and held
 * to a commitment — not a name in an array.
 */
export async function buildProgrammeEcosystem(
  ctx: RequestContext,
  repo: MissionRepository,
  programmeId: string,
): Promise<EcosystemEntry[]> {
  const links = await repo.relationships.linksForEntity(ctx, {
    type: "programme",
    id: programmeId,
  });
  if (links.length === 0) return [];

  const [relationships, organisations, people] = await Promise.all([
    repo.relationships.list(ctx),
    repo.relationships.listOrganisations(ctx),
    repo.relationships.listPeople(ctx),
  ]);

  const relById = new Map(relationships.map((r) => [r.id, r]));
  const orgById = new Map(organisations.map((o) => [o.id, o]));

  const entries: EcosystemEntry[] = [];
  for (const link of links) {
    const relationship = relById.get(link.relationshipId);
    if (!relationship?.externalOrganisationId) continue;
    const organisation = orgById.get(relationship.externalOrganisationId);
    if (!organisation) continue;

    entries.push({
      organisation,
      relationship,
      role: link.role,
      note: link.note,
      primaryContact:
        people.find((p) => p.primaryExternalOrganisationId === organisation.id) ?? null,
    });
  }

  return entries.sort((a, b) => a.organisation.name.localeCompare(b.organisation.name));
}

export function hrefForEntity(type: string, id: string): string | undefined {
  switch (type) {
    case "grant":
      return `/grants/${id}`;
    case "application":
      return `/applications/${id}`;
    case "funding_opportunity":
      return `/funding/${id}`;
    case "programme":
      return `/programmes/${id}`;
    case "impact_report":
      return `/impact/${id}`;
    case "evidence":
      return "/evidence";
    case "external_organisation":
      return `/relationships/${id}`;
    case "person":
      return `/relationships/people/${id}`;
    default:
      return undefined;
  }
}
