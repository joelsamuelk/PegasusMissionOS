import type { EntityType, PortalAudience, PortalView } from "@/types/domain";

/**
 * What each audience may see, field by field.
 *
 * An **allowlist**, and the choice matters more than it looks. A denylist
 * would mean every field added to `Grant` after this file was written is
 * visible to funders by default — which is exactly how a portal leaks: not by
 * a decision, but by a schema change nobody connected to a portal.
 *
 * The views are also the answer to *do not build five independent portal
 * products*. There is one projection function and one access check; the
 * audience decides which views exist and what each one names, and nothing
 * else about a portal differs.
 *
 * Every list below was written by asking one question of each field: **does
 * this audience need it, or is it merely related to something they need?**
 * The second is the failure the brief names.
 */

const view = (
  key: string,
  audience: PortalAudience,
  entityType: EntityType,
  label: string,
  fields: string[],
  withheldNote?: string,
): PortalView => ({ key, audience, entityType, label, fields, withheldNote });

/**
 * The funder portal.
 *
 * A funder sees what they funded and what it produced. They do not see the
 * organisation's other funders, its reserves, its staff, or what it thinks
 * about them: `Grant.grantManagerId` and `Grant.conditions` are internal, and
 * `spentToDate` is deliberately absent because it is an unverifiable scalar
 * that a funder would reasonably read as audited.
 */
const FUNDER_VIEWS: PortalView[] = [
  view(
    "funder.grant",
    "funder",
    "grant",
    "Grant",
    ["title", "awardValue", "currency", "startDate", "endDate", "status"],
    "Internal grant conditions, the assigned manager and the running spend figure are not shown. Ask for a utilisation statement if you need one.",
  ),
  view("funder.programme", "funder", "programme", "Programme", [
    "name",
    "summary",
    "status",
    "startDate",
    "endDate",
    "location",
    "communitiesServed",
  ]),
  view("funder.outcome", "funder", "outcome", "Outcome", ["title", "description", "level"]),
  view(
    "funder.indicator",
    "funder",
    "indicator",
    "Indicator",
    ["name", "definition", "baseline", "target", "currentValue", "unit", "lastUpdated"],
    "The internal data owner and the confidence rating are not shown.",
  ),
  view("funder.evidence", "funder", "evidence", "Evidence", [
    "title",
    "type",
    "description",
    "verification",
    "reportingPeriod",
    "statValue",
    "statLabel",
  ]),
  view("funder.report", "funder", "impact_report", "Report", [
    "title",
    "reportingPeriod",
    "status",
  ]),
  view(
    "funder.deliverable",
    "funder",
    "grant_deliverable",
    "Deliverable",
    ["title", "dueDate", "status"],
  ),
];

/**
 * The beneficiary portal, and what it deliberately cannot show.
 *
 * `MISSION_GRAPH_ARCHITECTURE.md` §8 records the absence of a beneficiary
 * entity as a decision, and MG-7 declined to reverse it. This portal therefore
 * shows a person **the programme**, not a record of themselves: there is no
 * beneficiary record to show, and building one so that a portal could display
 * it would be reversing that decision through the back door.
 *
 * What a beneficiary can do is read what the programme offers, submit a form,
 * and message a named person. That is the whole surface, and it is small on
 * purpose.
 */
const BENEFICIARY_VIEWS: PortalView[] = [
  view(
    "beneficiary.programme",
    "beneficiary",
    "programme",
    "Programme",
    ["name", "summary", "location"],
    "Internal delivery notes, budgets, risks and partner arrangements are not shown.",
  ),
  view("beneficiary.form", "beneficiary", "document", "Form", ["title"]),
];

/**
 * The volunteer portal.
 *
 * Their own activity, and nothing about anybody else's. A volunteer viewing a
 * programme sees the same projection a beneficiary does.
 */
const VOLUNTEER_VIEWS: PortalView[] = [
  view("volunteer.programme", "volunteer", "programme", "Programme", [
    "name",
    "summary",
    "location",
  ]),
  view("volunteer.activity", "volunteer", "activity", "Activity", [
    "title",
    "description",
    "startDate",
    "endDate",
    "status",
    "location",
  ]),
  view("volunteer.task", "volunteer", "task", "Task", ["title", "dueDate", "status"]),
];

/**
 * The partner portal.
 *
 * A delivery partner sees the shared work and the commitments between the two
 * organisations. They do not see the funding behind it: which funder pays for
 * a jointly delivered programme is the lead organisation's business, and a
 * partner portal that showed it would leak a funding relationship every time.
 */
const PARTNER_VIEWS: PortalView[] = [
  view("partner.programme", "partner", "programme", "Programme", [
    "name",
    "summary",
    "status",
    "startDate",
    "endDate",
    "location",
  ]),
  view("partner.output", "partner", "output", "Output", [
    "title",
    "description",
    "unit",
    "targetValue",
    "currentValue",
    "reportingPeriod",
  ]),
  view("partner.commitment", "partner", "commitment", "Commitment", [
    "title",
    "description",
    "direction",
    "dueAt",
    "status",
  ]),
  view("partner.evidence", "partner", "evidence", "Evidence", [
    "title",
    "type",
    "description",
    "reportingPeriod",
  ]),
];

/**
 * The trustee portal.
 *
 * The widest audience, and still not internal access. A trustee governs and
 * approves; they do not draft. The restriction that matters is already in the
 * permission model — `trustee_reviewer` holds `reports:approve` and not
 * `reports:manage` — and this preserves it: a trustee can approve a report
 * through the portal and cannot edit one.
 */
const TRUSTEE_VIEWS: PortalView[] = [
  view("trustee.report", "trustee", "impact_report", "Report", [
    "title",
    "type",
    "reportingPeriod",
    "status",
  ]),
  view("trustee.grant", "trustee", "grant", "Grant", [
    "title",
    "awardValue",
    "currency",
    "startDate",
    "endDate",
    "status",
    "restricted",
  ]),
  view("trustee.programme", "trustee", "programme", "Programme", [
    "name",
    "summary",
    "status",
    "risks",
  ]),
  view("trustee.fund", "trustee", "fund", "Fund", [
    "name",
    "restriction",
    "restrictionPurpose",
    "status",
  ]),
];

/**
 * The applicant portal.
 *
 * Somebody applying for a grant the organisation gives out. They see their own
 * application and the opportunity, and nothing about anyone else's.
 */
const APPLICANT_VIEWS: PortalView[] = [
  view("applicant.opportunity", "applicant", "funding_opportunity", "Opportunity", [
    "programmeName",
    "description",
    "deadline",
    "minAward",
    "maxAward",
    "currency",
    "fundingType",
  ]),
  view(
    "applicant.application",
    "applicant",
    "application",
    "Application",
    ["status", "submittedAt"],
    "Internal review notes and scores are not shown.",
  ),
];

export const PORTAL_VIEWS: PortalView[] = [
  ...FUNDER_VIEWS,
  ...BENEFICIARY_VIEWS,
  ...VOLUNTEER_VIEWS,
  ...PARTNER_VIEWS,
  ...TRUSTEE_VIEWS,
  ...APPLICANT_VIEWS,
];

const BY_KEY = new Map(PORTAL_VIEWS.map((entry) => [entry.key, entry]));

export function findView(key: string): PortalView | undefined {
  return BY_KEY.get(key);
}

export function viewsFor(audience: PortalAudience): PortalView[] {
  return PORTAL_VIEWS.filter((entry) => entry.audience === audience);
}

/**
 * The view an audience uses for an entity type, where it has one.
 *
 * Returns `undefined` rather than a permissive default. An entity type no view
 * names cannot be shared with that audience at all, which is the behaviour
 * that makes adding a new entity safe: it is invisible to every portal until
 * somebody writes a view for it.
 */
export function viewForEntity(
  audience: PortalAudience,
  entityType: EntityType,
): PortalView | undefined {
  return PORTAL_VIEWS.find(
    (entry) => entry.audience === audience && entry.entityType === entityType,
  );
}
