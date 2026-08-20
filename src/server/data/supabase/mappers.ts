import type {
  Activity,
  Application,
  ApplicationAnswer,
  AuditEvent,
  Claim,
  ClaimKind,
  ClaimProducer,
  ClaimValue,
  Commitment,
  EntityReference,
  EntityType,
  EvidenceItem,
  EvidenceLink,
  Funder,
  FundingOpportunity,
  Grant,
  GrantDeliverable,
  GrantPayment,
  GrantReport,
  Indicator,
  IndicatorMeasurement,
  Interaction,
  Notification,
  Organisation,
  OrganisationMember,
  Outcome,
  Output,
  Person,
  Programme,
  Relation,
  Relationship,
  Task,
  User,
  VerificationState,
} from "@/types/domain";
import {
  arrayFrom,
  auditFrom,
  numberFrom,
  optionalNumberFrom,
  optionalStringFrom,
  type Row,
} from "./mapping";

/**
 * Row mappers, one per entity.
 *
 * Deliberately hand-written rather than generated from `baseFrom`. A generic
 * converter gets the easy 80% right and the remaining 20% *silently wrong*,
 * and the wrong ones here are not cosmetic: `subject_type`/`subject_id`
 * collapse into one `EntityReference`, `producer_method`/`producer_detail`
 * reconstitute a discriminated union, and several `numeric` columns arrive as
 * strings. A mapper that returns a plausible object with a broken claim
 * subject is worse than one that fails to compile.
 *
 * Every mapper is total: it produces a valid domain object from any row the
 * schema permits, defaulting only where the column is genuinely nullable.
 */

const str = (value: unknown, fallback = ""): string =>
  value === null || value === undefined ? fallback : String(value);

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

/** `subject_type` + `subject_id` are one reference in the domain model. */
function refFrom(type: unknown, id: unknown, label?: unknown): EntityReference {
  return {
    type: str(type, "organisation") as EntityType,
    id: str(id),
    ...(label ? { label: str(label) } : {}),
  };
}

// --- Organisation --------------------------------------------------------

export function organisationFrom(row: Row): Organisation {
  return {
    id: str(row.id),
    name: str(row.name),
    legalName: str(row.legal_name, str(row.name)),
    type: str(row.type, "charity") as Organisation["type"],
    charityNumber: optionalStringFrom(row.charity_number),
    companyNumber: optionalStringFrom(row.company_number),
    yearFounded: optionalNumberFrom(row.year_founded),
    website: optionalStringFrom(row.website),
    registeredAddress: optionalStringFrom(row.registered_address),
    operatingRegions: arrayFrom(row.operating_regions),
    organisationSize: optionalStringFrom(row.organisation_size),
    annualIncomeBand: optionalStringFrom(row.annual_income_band),
    isDemo: bool(row.is_demo),
    aiEnabled: bool(row.ai_enabled, true),
    audit: auditFrom(row),
  };
}

export function memberFrom(row: Row): OrganisationMember {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    userId: str(row.user_id),
    role: str(row.role, "contributor") as OrganisationMember["role"],
    status: str(row.status, "active") as OrganisationMember["status"],
    invitedAt: optionalStringFrom(row.invited_at),
    joinedAt: optionalStringFrom(row.joined_at),
  };
}

export function userFrom(row: Row): User {
  const name = str(row.name);
  return {
    id: str(row.id),
    name,
    email: str(row.email),
    jobTitle: optionalStringFrom(row.job_title),
    // Derived rather than stored, so it cannot drift from the name.
    avatarInitials:
      optionalStringFrom(row.avatar_initials) ??
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join(""),
  };
}

// --- Funding -------------------------------------------------------------

export function funderFrom(row: Row): Funder {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    name: str(row.name),
    type: str(row.type, "trust"),
    website: optionalStringFrom(row.website),
    contactName: optionalStringFrom(row.contact_name),
    contactEmail: optionalStringFrom(row.contact_email),
    notes: optionalStringFrom(row.notes),
    externalOrganisationId: optionalStringFrom(row.external_organisation_id),
    isDemo: bool(row.is_demo),
  };
}

export function opportunityFrom(row: Row): FundingOpportunity {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    funderId: str(row.funder_id),
    programmeName: str(row.programme_name),
    description: str(row.description),
    minAward: optionalNumberFrom(row.min_award),
    maxAward: optionalNumberFrom(row.max_award),
    currency: str(row.currency, "GBP"),
    deadline: optionalStringFrom(row.deadline),
    fundingDurationMonths: optionalNumberFrom(row.funding_duration_months),
    fundingType: str(row.funding_type, "project") as FundingOpportunity["fundingType"],
    eligibleOrgTypes: arrayFrom(row.eligible_org_types) as Organisation["type"][],
    eligibleLocations: arrayFrom(row.eligible_locations),
    priorityThemes: arrayFrom(row.priority_themes),
    requiredDocuments: arrayFrom(row.required_documents),
    reportingRequirements: arrayFrom(row.reporting_requirements),
    sourceReference: optionalStringFrom(row.source_reference),
    lastVerifiedAt: optionalStringFrom(row.last_verified_at),
    ownerId: optionalStringFrom(row.owner_id),
    stage: str(row.stage, "discovered") as FundingOpportunity["stage"],
    probability: numberFrom(row.probability),
    nextAction: optionalStringFrom(row.next_action),
    saved: bool(row.saved),
    isDemo: bool(row.is_demo),
    notes: optionalStringFrom(row.notes),
    audit: auditFrom(row),
  };
}

// --- Applications --------------------------------------------------------

export function applicationFrom(row: Row): Application {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    opportunityId: str(row.opportunity_id),
    title: str(row.title),
    status: str(row.status, "not_started") as Application["status"],
    ownerId: optionalStringFrom(row.owner_id),
    contributorIds: arrayFrom(row.contributor_ids),
    reviewerIds: arrayFrom(row.reviewer_ids),
    deadline: optionalStringFrom(row.deadline),
    // `jsonb` columns arrive parsed. A null is an empty list, not a crash.
    requiredDocuments: Array.isArray(row.required_documents)
      ? (row.required_documents as Application["requiredDocuments"])
      : [],
    submissionChecklist: Array.isArray(row.submission_checklist)
      ? (row.submission_checklist as Application["submissionChecklist"])
      : [],
    notes: optionalStringFrom(row.notes),
    audit: auditFrom(row),
  };
}

export function answerFrom(row: Row): ApplicationAnswer {
  return {
    id: str(row.id),
    applicationId: str(row.application_id),
    organisationId: str(row.organisation_id),
    order: numberFrom(row.ord),
    questionText: str(row.question_text),
    guidance: optionalStringFrom(row.guidance),
    wordLimit: optionalNumberFrom(row.word_limit),
    draft: str(row.draft),
    status: str(row.status, "not_started") as ApplicationAnswer["status"],
    assignedTo: optionalStringFrom(row.assigned_to),
    evidenceIds: arrayFrom(row.evidence_ids),
    provenance: (row.provenance as ApplicationAnswer["provenance"]) ?? undefined,
    audit: auditFrom(row),
  };
}

// --- Grants --------------------------------------------------------------

export function grantFrom(row: Row): Grant {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    applicationId: optionalStringFrom(row.application_id),
    funderId: str(row.funder_id),
    title: str(row.title),
    // `numeric` may arrive as a string; parsing rather than casting is the
    // difference between an award value and NaN.
    awardValue: numberFrom(row.award_value),
    currency: str(row.currency, "GBP"),
    restricted: bool(row.restricted),
    startDate: str(row.start_date),
    endDate: str(row.end_date),
    grantManagerId: optionalStringFrom(row.grant_manager_id),
    funderContact: optionalStringFrom(row.funder_contact),
    spentToDate: numberFrom(row.spent_to_date),
    conditions: arrayFrom(row.conditions),
    status: str(row.status, "active") as Grant["status"],
    audit: auditFrom(row),
  };
}

export function paymentFrom(row: Row): GrantPayment {
  return {
    id: str(row.id),
    grantId: str(row.grant_id),
    organisationId: str(row.organisation_id),
    label: str(row.label),
    amount: numberFrom(row.amount),
    dueDate: str(row.due_date),
    received: bool(row.received),
  };
}

export function deliverableFrom(row: Row): GrantDeliverable {
  return {
    id: str(row.id),
    grantId: str(row.grant_id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    dueDate: str(row.due_date),
    status: str(row.status, "not_started") as GrantDeliverable["status"],
  };
}

export function grantReportFrom(row: Row): GrantReport {
  return {
    id: str(row.id),
    grantId: str(row.grant_id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    dueDate: str(row.due_date),
    status: str(row.status, "not_started") as GrantReport["status"],
  };
}

// --- Programmes and delivery --------------------------------------------

export function programmeFrom(row: Row): Programme {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    name: str(row.name),
    summary: str(row.summary),
    status: str(row.status, "active") as Programme["status"],
    ownerId: optionalStringFrom(row.owner_id),
    startDate: optionalStringFrom(row.start_date),
    endDate: optionalStringFrom(row.end_date),
    location: optionalStringFrom(row.location),
    communitiesServed: arrayFrom(row.communities_served),
    budget: optionalNumberFrom(row.budget),
    activities: arrayFrom(row.activities),
    outputs: arrayFrom(row.outputs),
    deliveryPartners: arrayFrom(row.delivery_partners),
    risks: arrayFrom(row.risks),
    audit: auditFrom(row),
  };
}

export function activityFrom(row: Row): Activity {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    programmeId: str(row.programme_id),
    title: str(row.title),
    description: optionalStringFrom(row.description),
    startDate: optionalStringFrom(row.start_date),
    endDate: optionalStringFrom(row.end_date),
    status: str(row.status, "active") as Activity["status"],
    ownerId: optionalStringFrom(row.owner_id),
    location: optionalStringFrom(row.location),
    audit: auditFrom(row),
  };
}

export function outputFrom(row: Row): Output {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    programmeId: str(row.programme_id),
    title: str(row.title),
    description: optionalStringFrom(row.description),
    unit: optionalStringFrom(row.unit),
    targetValue: optionalNumberFrom(row.target_value),
    // `value` predates target/current and is the deprecated fallback.
    currentValue: optionalNumberFrom(row.current_value) ?? optionalNumberFrom(row.value),
    reportingPeriod: optionalStringFrom(row.reporting_period),
    audit: auditFrom(row),
  };
}

export function outcomeFrom(row: Row): Outcome {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    programmeId: str(row.programme_id),
    title: str(row.title),
    description: str(row.description),
    level: str(row.level, "outcome") as Outcome["level"],
    audit: auditFrom(row),
  };
}

export function indicatorFrom(row: Row): Indicator {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    outcomeId: str(row.outcome_id),
    name: str(row.name),
    definition: str(row.definition),
    baseline: numberFrom(row.baseline),
    target: numberFrom(row.target),
    currentValue: numberFrom(row.current_value),
    unit: str(row.unit),
    measurementFrequency: str(row.measurement_frequency),
    evidenceSource: optionalStringFrom(row.evidence_source),
    dataOwnerId: optionalStringFrom(row.data_owner_id),
    lastUpdated: optionalStringFrom(row.last_updated),
    confidence: str(row.confidence, "medium") as Indicator["confidence"],
    audit: auditFrom(row),
  };
}

export function measurementFrom(row: Row): IndicatorMeasurement {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    indicatorId: str(row.indicator_id),
    value: numberFrom(row.value),
    recordedAt: str(row.recorded_at),
    note: optionalStringFrom(row.note),
    recordedBy: optionalStringFrom(row.recorded_by),
  };
}

// --- Evidence ------------------------------------------------------------

export function evidenceFrom(row: Row): EvidenceItem {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    type: str(row.type, "document") as EvidenceItem["type"],
    description: str(row.description),
    verification: str(row.verification, "provided") as VerificationState,
    reportingPeriod: optionalStringFrom(row.reporting_period),
    location: optionalStringFrom(row.location),
    community: optionalStringFrom(row.community),
    statValue: optionalStringFrom(row.stat_value),
    statLabel: optionalStringFrom(row.stat_label),
    quote: optionalStringFrom(row.quote),
    attribution: optionalStringFrom(row.attribution),
    fileName: optionalStringFrom(row.file_name),
    fileSizeKb: optionalNumberFrom(row.file_size_kb),
    tags: arrayFrom(row.tags),
    audit: auditFrom(row),
  };
}

export function evidenceLinkFrom(row: Row): EvidenceLink {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    evidenceId: str(row.evidence_id),
    targetType: str(row.target_type, "programme") as EvidenceLink["targetType"],
    targetId: str(row.target_id),
  };
}

// --- Knowledge -----------------------------------------------------------

/**
 * Reconstitute the producer union.
 *
 * The schema stores `producer_method` plus a `producer_detail` jsonb, because a
 * discriminated union does not fit in columns without either five nullable
 * columns or a lie. The union is rebuilt here so that callers never see the
 * storage shape.
 */
function producerFrom(method: unknown, detail: unknown): ClaimProducer {
  const d = (detail ?? {}) as Record<string, unknown>;
  switch (str(method, "human")) {
    case "extraction":
      return {
        method: "extraction",
        extractionMethod: str(d.extractionMethod ?? d.extraction_method),
        sourceId: str(d.sourceId ?? d.source_id),
      };
    case "calculation":
      return {
        method: "calculation",
        function: str(d.function),
        version: str(d.version),
      };
    case "model":
      return {
        method: "model",
        provider: str(d.provider),
        model: str(d.model),
        promptVersion: str(d.promptVersion ?? d.prompt_version),
      };
    default:
      return { method: "human", actorId: str(d.actorId ?? d.actor_id) };
  }
}

export function producerToColumns(producer: ClaimProducer): {
  producer_method: string;
  producer_detail: Record<string, unknown>;
} {
  const { method, ...detail } = producer;
  return { producer_method: method, producer_detail: detail as Record<string, unknown> };
}

export function claimFrom(
  row: Row,
  extras: { sources?: Claim["sources"]; supportedBy?: string[]; conflictsWith?: string[] } = {},
): Claim {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    subject: refFrom(row.subject_type, row.subject_id),
    predicate: str(row.predicate),
    value: (row.value ?? { type: "text", text: str(row.text) }) as ClaimValue,
    text: str(row.text),
    kind: str(row.kind, "fact") as ClaimKind,
    verification: str(row.verification, "needs_review") as VerificationState,
    confidence: optionalNumberFrom(row.confidence),
    // These live in join tables. An empty default is honest: the caller asked
    // for a claim, not for its chain, and the repository fills them when it
    // has fetched them.
    sources: extras.sources ?? [],
    derivedFrom: Array.isArray(row.derived_from) ? (row.derived_from as EntityReference[]) : [],
    supportedBy: extras.supportedBy ?? [],
    producedBy: producerFrom(row.producer_method, row.producer_detail),
    workings: optionalStringFrom(row.workings),
    assumptions: arrayFrom(row.assumptions),
    caveats: arrayFrom(row.caveats),
    validFrom: optionalStringFrom(row.valid_from),
    validUntil: optionalStringFrom(row.valid_until),
    periodLabel: optionalStringFrom(row.period_label),
    supersedes: optionalStringFrom(row.supersedes),
    supersededBy: optionalStringFrom(row.superseded_by),
    conflictsWith: extras.conflictsWith ?? [],
    verifiedBy: optionalStringFrom(row.verified_by),
    verifiedAt: optionalStringFrom(row.verified_at),
    audit: auditFrom(row),
  };
}

// --- Relationships -------------------------------------------------------

export function relationshipFrom(row: Row, roles: string[] = []): Relationship {
  const overrideState = optionalStringFrom(row.health_override_state);
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    personId: optionalStringFrom(row.person_id),
    externalOrganisationId: optionalStringFrom(row.external_organisation_id),
    ownerId: optionalStringFrom(row.owner_id),
    status: str(row.status, "active") as Relationship["status"],
    roles,
    startedAt: optionalStringFrom(row.started_at),
    nextAction: optionalStringFrom(row.next_action),
    nextActionAt: optionalStringFrom(row.next_action_at),
    // An override without a reason is not auditable, so it is only surfaced
    // when both halves are present.
    healthOverride:
      overrideState && row.health_override_reason
        ? {
            state: overrideState as NonNullable<Relationship["healthOverride"]>["state"],
            reason: str(row.health_override_reason),
            setBy: optionalStringFrom(row.health_override_by),
            setAt: str(row.health_override_at),
          }
        : undefined,
    tags: arrayFrom(row.tags),
    notes: optionalStringFrom(row.notes),
    audit: auditFrom(row),
  };
}

export function personFrom(
  row: Row,
  contacts: { emails: Person["emails"]; phones: Person["phones"] } = { emails: [], phones: [] },
): Person {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    preferredName: optionalStringFrom(row.preferred_name),
    emails: contacts.emails,
    phones: contacts.phones,
    jobTitle: optionalStringFrom(row.job_title),
    primaryExternalOrganisationId: optionalStringFrom(row.primary_external_organisation_id),
    location:
      row.location_city || row.location_region || row.location_country
        ? {
            city: optionalStringFrom(row.location_city),
            region: optionalStringFrom(row.location_region),
            country: optionalStringFrom(row.location_country),
          }
        : undefined,
    communicationPreferences: {
      preferredChannel: optionalStringFrom(row.preferred_channel) as
        | Person["communicationPreferences"] extends undefined
          ? never
          : NonNullable<Person["communicationPreferences"]>["preferredChannel"],
      emailAllowed: bool(row.email_allowed, true),
      phoneAllowed: bool(row.phone_allowed, true),
      smsAllowed: bool(row.sms_allowed),
      marketingAllowed: bool(row.marketing_allowed),
      fundraisingAllowed: bool(row.fundraising_allowed),
      doNotContact: bool(row.do_not_contact),
      notes: optionalStringFrom(row.communication_notes),
    },
    consent: {
      // `not_recorded` is the honest default and deliberately not a synonym
      // for consent.
      basis: str(row.consent_basis, "not_recorded") as NonNullable<Person["consent"]>["basis"],
      source: optionalStringFrom(row.consent_source),
      recordedAt: optionalStringFrom(row.consent_recorded_at),
      reviewDueAt: optionalStringFrom(row.consent_review_due_at),
      jurisdiction: optionalStringFrom(row.consent_jurisdiction),
      evidenceRef: row.consent_evidence_id
        ? refFrom(row.consent_evidence_type, row.consent_evidence_id)
        : undefined,
    },
    tags: arrayFrom(row.tags),
    notes: optionalStringFrom(row.notes),
    isDemo: bool(row.is_demo),
    audit: auditFrom(row),
  };
}

export function interactionFrom(
  row: Row,
  parts: {
    personIds?: string[];
    externalOrganisationIds?: string[];
    participantUserIds?: string[];
    links?: EntityReference[];
  } = {},
): Interaction {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    type: str(row.type, "note") as Interaction["type"],
    direction: str(row.direction, "internal") as Interaction["direction"],
    channel: optionalStringFrom(row.channel) as Interaction["channel"],
    occurredAt: str(row.occurred_at),
    subject: str(row.subject),
    summary: optionalStringFrom(row.summary),
    personIds: parts.personIds ?? [],
    externalOrganisationIds: parts.externalOrganisationIds ?? [],
    participantUserIds: parts.participantUserIds ?? [],
    links: parts.links ?? [],
    source: str(row.source, "manual") as Interaction["source"],
    recordedBy: optionalStringFrom(row.recorded_by),
    audit: auditFrom(row),
  };
}

export function commitmentFrom(row: Row): Commitment {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    description: optionalStringFrom(row.description),
    direction: str(row.direction, "we_owe") as Commitment["direction"],
    personId: optionalStringFrom(row.person_id),
    externalOrganisationId: optionalStringFrom(row.external_organisation_id),
    relatedEntity: row.related_id ? refFrom(row.related_type, row.related_id) : undefined,
    ownerId: optionalStringFrom(row.owner_id),
    dueAt: optionalStringFrom(row.due_at),
    status: str(row.status, "open") as Commitment["status"],
    source: row.source_id ? refFrom(row.source_type, row.source_id) : undefined,
    confirmedBy: optionalStringFrom(row.confirmed_by),
    completedAt: optionalStringFrom(row.completed_at),
    audit: auditFrom(row),
  };
}

// --- Mission Graph -------------------------------------------------------

export function relationFrom(row: Row): Relation {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    from: refFrom(row.from_type, row.from_id),
    to: refFrom(row.to_type, row.to_id),
    kind: str(row.kind),
    role: optionalStringFrom(row.role),
    weight: optionalNumberFrom(row.weight),
    note: optionalStringFrom(row.note),
    audit: auditFrom(row),
  };
}

// --- Work ----------------------------------------------------------------

export function taskFrom(row: Row): Task {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    status: str(row.status, "todo") as Task["status"],
    dueDate: optionalStringFrom(row.due_date),
    assigneeId: optionalStringFrom(row.assignee_id),
    relatedType: optionalStringFrom(row.related_type),
    relatedId: optionalStringFrom(row.related_id),
    audit: auditFrom(row),
  };
}

export function notificationFrom(row: Row): Notification {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    body: str(row.body),
    kind: str(row.kind, "system") as Notification["kind"],
    read: bool(row.read),
    createdAt: str(row.created_at),
    href: optionalStringFrom(row.href),
  };
}

export function auditEventFrom(row: Row): AuditEvent {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    actorId: optionalStringFrom(row.actor_id),
    actorName: str(row.actor_name, "Unknown actor"),
    action: str(row.action),
    entityType: str(row.entity_type),
    entityId: str(row.entity_id),
    summary: str(row.summary),
    createdAt: str(row.created_at),
  };
}
