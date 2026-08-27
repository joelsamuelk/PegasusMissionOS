import { resolvePersonByEmail } from "@/lib/logic/relationship-identity";
import type {
  Commitment,
  CommunicationPreferences,
  ContactPoint,
  EntityReference,
  ExternalOrganisation,
  Funder,
  Interaction,
  Location,
  Person,
  Relationship,
  RelationshipLink,
  RelationshipRole,
} from "@/types/domain";
import type { RelationshipRepository } from "../../types";
import { arrayFrom, auditFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

/**
 * `Location` is three columns rather than a jsonb blob, because a region is
 * something you filter and group by. Absent entirely when all three are null,
 * so "we do not know where they are" is distinguishable from "nowhere".
 */
function locationFrom(row: Row): Location | undefined {
  if (!row.location_city && !row.location_region && !row.location_country) return undefined;
  return {
    ...(row.location_city ? { city: String(row.location_city) } : {}),
    ...(row.location_region ? { region: String(row.location_region) } : {}),
    ...(row.location_country ? { country: String(row.location_country) } : {}),
  };
}

function mapExternalOrganisation(row: Row): ExternalOrganisation {
  const location = locationFrom(row);
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    ...(row.legal_name ? { legalName: String(row.legal_name) } : {}),
    type: row.type as ExternalOrganisation["type"],
    ...(row.website ? { website: String(row.website) } : {}),
    ...(row.charity_number ? { charityNumber: String(row.charity_number) } : {}),
    ...(row.company_number ? { companyNumber: String(row.company_number) } : {}),
    ...(location ? { location } : {}),
    ...(row.description ? { description: String(row.description) } : {}),
    tags: arrayFrom(row.tags),
    ...(row.enrichment_source ? { enrichmentSource: String(row.enrichment_source) } : {}),
    isDemo: Boolean(row.is_demo),
    audit: auditFrom(row),
  };
}

function mapContactPoint(row: Row): ContactPoint {
  return {
    id: String(row.id),
    kind: row.kind as ContactPoint["kind"],
    value: String(row.value),
    ...(row.label ? { label: String(row.label) } : {}),
    isPrimary: Boolean(row.is_primary),
    verification: row.verification as ContactPoint["verification"],
  };
}

function preferencesFrom(row: Row): CommunicationPreferences {
  return {
    ...(row.preferred_channel
      ? { preferredChannel: row.preferred_channel as CommunicationPreferences["preferredChannel"] }
      : {}),
    emailAllowed: Boolean(row.email_allowed),
    phoneAllowed: Boolean(row.phone_allowed),
    smsAllowed: Boolean(row.sms_allowed),
    marketingAllowed: Boolean(row.marketing_allowed),
    fundraisingAllowed: Boolean(row.fundraising_allowed),
    doNotContact: Boolean(row.do_not_contact),
    ...(row.communication_notes ? { notes: String(row.communication_notes) } : {}),
  };
}

function mapPerson(row: Row, contacts: ContactPoint[]): Person {
  const location = locationFrom(row);
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    ...(row.preferred_name ? { preferredName: String(row.preferred_name) } : {}),
    emails: contacts.filter((c) => c.kind === "email"),
    phones: contacts.filter((c) => c.kind === "phone"),
    ...(row.job_title ? { jobTitle: String(row.job_title) } : {}),
    ...(row.primary_external_organisation_id
      ? { primaryExternalOrganisationId: String(row.primary_external_organisation_id) }
      : {}),
    ...(location ? { location } : {}),
    communicationPreferences: preferencesFrom(row),
    consent: {
      basis: row.consent_basis as NonNullable<Person["consent"]>["basis"],
      ...(row.consent_source ? { source: String(row.consent_source) } : {}),
      ...(row.consent_recorded_at ? { recordedAt: String(row.consent_recorded_at) } : {}),
      ...(row.consent_review_due_at ? { reviewDueAt: String(row.consent_review_due_at) } : {}),
      // Consent rules are not global, so the jurisdiction travels with the basis.
      ...(row.consent_jurisdiction ? { jurisdiction: String(row.consent_jurisdiction) } : {}),
      ...(row.consent_evidence_type && row.consent_evidence_id
        ? {
            evidenceRef: {
              type: row.consent_evidence_type as EntityReference["type"],
              id: String(row.consent_evidence_id),
            },
          }
        : {}),
    },
    tags: arrayFrom(row.tags),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    isDemo: Boolean(row.is_demo),
    audit: auditFrom(row),
  };
}

function mapRelationship(row: Row, roles: RelationshipRole[]): Relationship {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    status: row.status as Relationship["status"],
    roles,
    ...(row.started_at ? { startedAt: String(row.started_at) } : {}),
    ...(row.next_action ? { nextAction: String(row.next_action) } : {}),
    ...(row.next_action_at ? { nextActionAt: String(row.next_action_at) } : {}),
    // An override without a reason is not auditable, so the projection only
    // forms one when both are present.
    ...(row.health_override_state && row.health_override_reason
      ? {
          healthOverride: {
            state: row.health_override_state as NonNullable<
              Relationship["healthOverride"]
            >["state"],
            reason: String(row.health_override_reason),
            ...(row.health_override_by ? { setBy: String(row.health_override_by) } : {}),
            setAt: String(row.health_override_at ?? ""),
          },
        }
      : {}),
    tags: arrayFrom(row.tags),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    audit: auditFrom(row),
  };
}

function mapLink(row: Row): RelationshipLink {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    relationshipId: String(row.relationship_id),
    entity: { type: row.entity_type as EntityReference["type"], id: String(row.entity_id) },
    ...(row.role ? { role: row.role as RelationshipRole } : {}),
    ...(row.note ? { note: String(row.note) } : {}),
    createdAt: String(row.created_at),
  };
}

function mapInteraction(
  row: Row,
  personIds: string[],
  externalOrganisationIds: string[],
  participantUserIds: string[],
  links: EntityReference[],
): Interaction {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    type: row.type as Interaction["type"],
    direction: row.direction as Interaction["direction"],
    ...(row.channel ? { channel: row.channel as Interaction["channel"] } : {}),
    occurredAt: String(row.occurred_at),
    subject: String(row.subject),
    ...(row.summary ? { summary: String(row.summary) } : {}),
    personIds,
    externalOrganisationIds,
    participantUserIds,
    links,
    source: row.source as Interaction["source"],
    ...(row.recorded_by ? { recordedBy: String(row.recorded_by) } : {}),
    audit: auditFrom(row),
  };
}

function mapCommitment(row: Row): Commitment {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    direction: row.direction as Commitment["direction"],
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    ...(row.related_entity_type && row.related_entity_id
      ? {
          relatedEntity: {
            type: row.related_entity_type as EntityReference["type"],
            id: String(row.related_entity_id),
          },
        }
      : {}),
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(row.due_at ? { dueAt: String(row.due_at) } : {}),
    status: row.status as Commitment["status"],
    ...(row.source_entity_type && row.source_entity_id
      ? {
          source: {
            type: row.source_entity_type as EntityReference["type"],
            id: String(row.source_entity_id),
          },
        }
      : {}),
    // An unconfirmed suggestion is never an organisational commitment.
    ...(row.confirmed_by ? { confirmedBy: String(row.confirmed_by) } : {}),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
    audit: auditFrom(row),
  };
}

export function createRelationshipRepository(q: Query, deps: Deps): RelationshipRepository {
  type Ctx = Parameters<RelationshipRepository["list"]>[0];

  /** People with their contact points, which live in their own table. */
  async function hydratePeople(ctx: Ctx, rows: Row[]): Promise<Person[]> {
    if (rows.length === 0) return [];
    const contacts = await q.whereIn(
      ctx,
      "contact_points",
      "person_id",
      rows.map((r) => String(r.id)),
    );
    const by = new Map<string, ContactPoint[]>();
    for (const row of contacts) {
      const key = String(row.person_id);
      const list = by.get(key) ?? [];
      list.push(mapContactPoint(row));
      by.set(key, list);
    }
    return rows.map((row) => mapPerson(row, by.get(String(row.id)) ?? []));
  }

  async function hydrateRelationships(ctx: Ctx, rows: Row[]): Promise<Relationship[]> {
    if (rows.length === 0) return [];
    const roleRows = await q.whereIn(
      ctx,
      "relationship_roles",
      "relationship_id",
      rows.map((r) => String(r.id)),
    );
    const by = new Map<string, RelationshipRole[]>();
    for (const row of roleRows) {
      const key = String(row.relationship_id);
      const list = by.get(key) ?? [];
      list.push(String(row.role) as RelationshipRole);
      by.set(key, list);
    }
    return rows.map((row) => mapRelationship(row, by.get(String(row.id)) ?? []));
  }

  async function hydrateInteractions(ctx: Ctx, rows: Row[]): Promise<Interaction[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => String(r.id));
    const [participants, links] = await Promise.all([
      q.whereIn(ctx, "interaction_participants", "interaction_id", ids),
      q.whereIn(ctx, "interaction_links", "interaction_id", ids),
    ]);
    return rows.map((row) => {
      const id = String(row.id);
      const mine = participants.filter((p) => String(p.interaction_id) === id);
      return mapInteraction(
        row,
        mine.filter((p) => p.person_id).map((p) => String(p.person_id)),
        mine
          .filter((p) => p.external_organisation_id)
          .map((p) => String(p.external_organisation_id)),
        mine.filter((p) => p.user_id).map((p) => String(p.user_id)),
        links
          .filter((l) => String(l.interaction_id) === id)
          .map((l) => ({
            type: l.entity_type as EntityReference["type"],
            id: String(l.entity_id),
          })),
      );
    });
  }

  /**
   * Resolve a party to the ids it covers, dropping anything out of tenant.
   *
   * Filtering here rather than at the query means a party naming another
   * organisation's person matches nothing, instead of matching their
   * interactions.
   */
  async function resolveParty(
    ctx: Ctx,
    party: { externalOrganisationId?: string; personIds?: string[] },
  ): Promise<{ organisationIds: Set<string>; personIds: Set<string> }> {
    const organisationIds = new Set<string>();
    const personIds = new Set<string>();
    if (party.externalOrganisationId) {
      const row = await q.maybeOne(ctx, "external_organisations", {
        id: party.externalOrganisationId,
      });
      if (row) organisationIds.add(String(row.id));
    }
    if (party.personIds?.length) {
      const rows = await q.whereIn(ctx, "people", "id", party.personIds);
      for (const row of rows) personIds.add(String(row.id));
    }
    return { organisationIds, personIds };
  }

  return {
    async listOrganisations(ctx) {
      const rows = await q.many(ctx, "external_organisations", {}, {
        order: { column: "name" },
        liveOnly: true,
      });
      return rows.map(mapExternalOrganisation);
    },

    async getOrganisation(ctx, id) {
      const row = await q.maybeOne(ctx, "external_organisations", { id });
      return row ? mapExternalOrganisation(row) : null;
    },

    async listPeople(ctx) {
      const rows = await q.many(ctx, "people", {}, {
        order: { column: "last_name" },
        liveOnly: true,
      });
      return hydratePeople(ctx, rows);
    },

    async upsertPersonByEmail(ctx, input) {
      const existing = await hydratePeople(ctx, await q.many(ctx, "people", {}, { liveOnly: true }));
      const match = resolvePersonByEmail(existing, input.email);
      // Only a confident match attaches. A low-confidence match would merge
      // two people on the strength of a shared mailbox, which is far harder to
      // undo than a duplicate.
      if (match && match.confidence === "high") return { person: match.record, created: false };

      const row = await q.insert(ctx, "people", {
        firstName: input.firstName?.trim() || input.email.split("@")[0] || "Unknown",
        lastName: input.lastName?.trim() || "",
        tags: [],
        isDemo: false,
      });
      const contact = await q.insert(
        ctx,
        "contact_points",
        {
          personId: String(row.id),
          kind: "email",
          value: input.email,
          isPrimary: true,
          // Somebody typed it into a form. Nobody has confirmed it is theirs,
          // and `provided` is what that state is called.
          verification: "provided",
        },
        { audit: false },
      );
      return { person: mapPerson(row, [mapContactPoint(contact)]), created: true };
    },

    async getPerson(ctx, id) {
      const row = await q.maybeOne(ctx, "people", { id });
      if (!row) return null;
      const [person] = await hydratePeople(ctx, [row]);
      return person ?? null;
    },

    async peopleForOrganisation(ctx, externalOrganisationId) {
      const rows = await q.many(ctx, "people", {
        primary_external_organisation_id: externalOrganisationId,
      });
      return hydratePeople(ctx, rows);
    },

    async list(ctx) {
      const rows = await q.many(ctx, "relationships", {}, { liveOnly: true });
      return hydrateRelationships(ctx, rows);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "relationships", { id });
      if (!row) return null;
      const [relationship] = await hydrateRelationships(ctx, [row]);
      return relationship ?? null;
    },

    async forOrganisation(ctx, externalOrganisationId) {
      const row = await q.maybeOne(ctx, "relationships", {
        external_organisation_id: externalOrganisationId,
      });
      if (!row) return null;
      const [relationship] = await hydrateRelationships(ctx, [row]);
      return relationship ?? null;
    },

    async forPerson(ctx, personId) {
      const row = await q.maybeOne(ctx, "relationships", { person_id: personId });
      if (!row) return null;
      const [relationship] = await hydrateRelationships(ctx, [row]);
      return relationship ?? null;
    },

    async links(ctx, relationshipId) {
      const rows = await q.many(ctx, "relationship_links", { relationship_id: relationshipId });
      return rows.map(mapLink);
    },

    async linksForEntity(ctx, entity) {
      const rows = await q.many(ctx, "relationship_links", {
        entity_type: entity.type,
        entity_id: entity.id,
      });
      return rows.map(mapLink);
    },

    async listInteractions(ctx) {
      const rows = await q.many(ctx, "interactions", {}, {
        order: { column: "occurred_at", ascending: false },
        liveOnly: true,
      });
      return hydrateInteractions(ctx, rows);
    },

    async interactionsFor(ctx, party) {
      const { organisationIds, personIds } = await resolveParty(ctx, party);
      if (organisationIds.size === 0 && personIds.size === 0) return [];
      const all = await hydrateInteractions(
        ctx,
        await q.many(ctx, "interactions", {}, {
          order: { column: "occurred_at", ascending: false },
        }),
      );
      return all.filter(
        (i) =>
          i.externalOrganisationIds.some((id) => organisationIds.has(id)) ||
          i.personIds.some((id) => personIds.has(id)),
      );
    },

    async logInteraction(ctx, input) {
      // Participants are filtered to this tenant. An interaction must never
      // become a pointer to another organisation's person record.
      const [validPeople, validOrgs] = await Promise.all([
        q.whereIn(ctx, "people", "id", input.personIds),
        q.whereIn(ctx, "external_organisations", "id", input.externalOrganisationIds),
      ]);

      const row = await q.insert(ctx, "interactions", {
        type: input.type,
        direction: input.direction,
        channel: input.channel,
        occurredAt: input.occurredAt,
        subject: input.subject,
        summary: input.summary,
        source: input.source,
        recordedBy: ctx.userId,
      });
      const id = String(row.id);

      for (const person of validPeople) {
        await q.insert(
          ctx,
          "interaction_participants",
          { interactionId: id, personId: String(person.id) },
          { audit: false },
        );
      }
      for (const org of validOrgs) {
        await q.insert(
          ctx,
          "interaction_participants",
          { interactionId: id, externalOrganisationId: String(org.id) },
          { audit: false },
        );
      }
      for (const userId of input.participantUserIds) {
        await q.insert(
          ctx,
          "interaction_participants",
          { interactionId: id, userId },
          { audit: false },
        );
      }
      for (const link of input.links) {
        await q.insert(
          ctx,
          "interaction_links",
          { interactionId: id, entityType: link.type, entityId: link.id },
          { audit: false },
        );
      }

      await deps.recordActivity(ctx, `logged ${input.type}`, input.subject);
      await deps.audit.record(ctx, {
        action: "relationship.interaction.logged",
        entityType: "interaction",
        entityId: id,
        summary: `Logged ${input.type}: ${input.subject.slice(0, 60)}`,
      });
      return id;
    },

    async listCommitments(ctx) {
      const rows = await q.many(ctx, "commitments", {}, {
        order: { column: "due_at" },
        liveOnly: true,
      });
      return rows.map(mapCommitment);
    },

    async commitmentsFor(ctx, party) {
      const { organisationIds, personIds } = await resolveParty(ctx, party);
      if (organisationIds.size === 0 && personIds.size === 0) return [];
      const rows = await q.many(ctx, "commitments", {}, { order: { column: "due_at" } });
      return rows
        .map(mapCommitment)
        .filter(
          (c) =>
            (c.externalOrganisationId && organisationIds.has(c.externalOrganisationId)) ||
            (c.personId && personIds.has(c.personId)),
        );
    },

    async createCommitment(ctx, input) {
      const row = await q.insert(ctx, "commitments", {
        title: input.title,
        description: input.description,
        direction: input.direction,
        personId: input.personId,
        externalOrganisationId: input.externalOrganisationId,
        relatedEntityType: input.relatedEntity?.type,
        relatedEntityId: input.relatedEntity?.id,
        ownerId: input.ownerId,
        dueAt: input.dueAt,
        status: input.status,
        sourceEntityType: input.source?.type,
        sourceEntityId: input.source?.id,
        confirmedBy: input.confirmedBy,
      });
      return String(row.id);
    },

    async setCommitmentStatus(ctx, commitmentId, status) {
      await q.update(ctx, "commitments", commitmentId, {
        status,
        ...(status === "completed" ? { completedAt: ctx.now().toISOString() } : {}),
      });
    },

    async organisationForFunder(ctx, funderId) {
      const funder = await q.maybeOne(ctx, "funders", { id: funderId });
      if (!funder?.external_organisation_id) return null;
      const row = await q.maybeOne(ctx, "external_organisations", {
        id: String(funder.external_organisation_id),
      });
      return row ? mapExternalOrganisation(row) : null;
    },

    async funderForOrganisation(ctx, externalOrganisationId) {
      const row = await q.maybeOne(ctx, "funders", {
        external_organisation_id: externalOrganisationId,
      });
      if (!row) return null;
      return {
        id: String(row.id),
        organisationId: String(row.organisation_id),
        name: String(row.name),
        type: String(row.type ?? ""),
        ...(row.website ? { website: String(row.website) } : {}),
        ...(row.contact_name ? { contactName: String(row.contact_name) } : {}),
        ...(row.contact_email ? { contactEmail: String(row.contact_email) } : {}),
        ...(row.notes ? { notes: String(row.notes) } : {}),
        externalOrganisationId,
        isDemo: Boolean(row.is_demo),
      } satisfies Funder;
    },
  };
}
