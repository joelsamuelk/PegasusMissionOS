import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Application,
  Commitment,
  EntityReference,
  ExternalOrganisation,
  Grant,
  GrantReport,
  Indicator,
  Interaction,
  Person,
  Programme,
  Relationship,
} from "@/types/domain";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { indicatorProgress } from "./progress";
import { commitmentState, type RelationshipHealth } from "./relationship-health";

/**
 * The relationship brief — "prepare me for this meeting".
 *
 * This is **assembly, not generation**. Every line is read from a Mission
 * Graph record and carries `sources`, so any statement can be traced back to
 * the row that produced it. No model is involved, which is why the brief can
 * be trusted before a funder meeting.
 *
 * What is *missing* is stated explicitly rather than smoothed over. A brief
 * that quietly omits the fact that no impact data exists is worse than one
 * that says so.
 *
 * A later phase may render this as prose. It will render *this* — it will not
 * supply the facts.
 */

export interface BriefLine {
  label: string;
  value: string;
  sources: EntityReference[];
}

export interface BriefSection {
  key: string;
  title: string;
  lines: BriefLine[];
}

export interface RelationshipBrief {
  headline: string;
  sections: BriefSection[];
  /** Suggested discussion points, each traceable to the record behind it. */
  discussionPoints: BriefLine[];
  /** Context Pegasus does not hold. Named, not hidden. */
  missing: string[];
}

export interface RelationshipBriefInput {
  organisation: ExternalOrganisation;
  relationship: Relationship;
  health: RelationshipHealth;
  people: Person[];
  ownerName?: string;
  grants: Grant[];
  grantReports: GrantReport[];
  applications: Application[];
  programmes: Programme[];
  indicators: Indicator[];
  interactions: Interaction[];
  commitments: Commitment[];
  now: Date;
}

export function buildRelationshipBrief(input: RelationshipBriefInput): RelationshipBrief {
  const {
    organisation,
    relationship,
    health,
    people,
    ownerName,
    grants,
    grantReports,
    applications,
    programmes,
    indicators,
    interactions,
    commitments,
    now,
  } = input;

  const orgRef: EntityReference = { type: "external_organisation", id: organisation.id };
  const relRef: EntityReference = { type: "relationship", id: relationship.id };

  const activeGrants = grants.filter((g) => g.status === "active");
  const totalFunding = grants.reduce((sum, g) => sum + g.awardValue, 0);
  const activeFunding = activeGrants.reduce((sum, g) => sum + g.awardValue, 0);
  const openCommitments = commitments.filter((c) => c.status === "open");
  const missing: string[] = [];

  // --- Relationship ------------------------------------------------------
  const relationshipLines: BriefLine[] = [
    { label: "Status", value: health.reason, sources: [relRef] },
  ];

  if (relationship.startedAt) {
    const years = yearsSince(relationship.startedAt, now);
    relationshipLines.push({
      label: "Known since",
      value: `${formatDate(relationship.startedAt)}${years !== undefined ? ` (${years} year${years === 1 ? "" : "s"})` : ""}`,
      sources: [relRef],
    });
  } else {
    missing.push("The date this relationship began has not been recorded.");
  }

  if (ownerName) {
    relationshipLines.push({
      label: "Relationship owner",
      value: ownerName,
      sources: [relRef],
    });
  } else {
    missing.push("No internal owner is assigned to this relationship.");
  }

  if (people.length > 0) {
    relationshipLines.push({
      label: "Contacts",
      value: people
        .map((p) => `${personName(p)}${p.jobTitle ? ` (${p.jobTitle})` : ""}`)
        .join(", "),
      sources: people.map((p) => ({ type: "person" as const, id: p.id })),
    });
  } else {
    missing.push("No named contact is recorded for this organisation.");
  }

  // --- Funding -----------------------------------------------------------
  const fundingLines: BriefLine[] = [];
  if (grants.length > 0) {
    fundingLines.push({
      label: "Funding history",
      value: `${grants.length} grant${grants.length === 1 ? "" : "s"} · ${formatCurrency(totalFunding)} total`,
      sources: grants.map((g) => ({ type: "grant" as const, id: g.id })),
    });
  }
  for (const grant of activeGrants) {
    const elapsed = elapsedPercent(grant, now);
    const spent = grant.awardValue > 0 ? Math.round((grant.spentToDate / grant.awardValue) * 100) : 0;
    fundingLines.push({
      label: grant.title,
      value: `${formatCurrency(grant.awardValue, grant.currency)} · ends ${formatDate(grant.endDate)}${elapsed !== undefined ? ` · ${elapsed}% elapsed, ${spent}% spent` : ""}`,
      sources: [{ type: "grant", id: grant.id }],
    });
  }
  if (grants.length === 0) {
    fundingLines.push({
      label: "Funding history",
      value: "No grants recorded with this organisation.",
      sources: [orgRef],
    });
  }

  const openApplications = applications.filter(
    (a) => a.status !== "successful" && a.status !== "unsuccessful",
  );
  for (const application of openApplications) {
    fundingLines.push({
      label: "Live application",
      value: `${application.title} · ${application.status.replace(/_/g, " ")}${application.deadline ? ` · due ${formatDate(application.deadline)}` : ""}`,
      sources: [{ type: "application", id: application.id }],
    });
  }

  // --- Delivery and impact ----------------------------------------------
  const deliveryLines: BriefLine[] = [];
  for (const programme of programmes) {
    deliveryLines.push({
      label: programme.name,
      value: `${programme.status.replace(/_/g, " ")}${programme.location ? ` · ${programme.location}` : ""}`,
      sources: [{ type: "programme", id: programme.id }],
    });
  }
  if (indicators.length > 0) {
    const onTrack = indicators.filter((i) => indicatorProgress(i) >= 100).length;
    const nearTarget = indicators.filter((i) => indicatorProgress(i) >= 80).length;
    deliveryLines.push({
      label: "Indicator performance",
      value: `${onTrack} of ${indicators.length} at or above target; ${nearTarget} within 20% of target.`,
      sources: indicators.map((i) => ({ type: "indicator" as const, id: i.id })),
    });
  } else if (programmes.length > 0) {
    missing.push("No indicators are linked to the programmes this organisation supports.");
  }
  if (programmes.length === 0) {
    deliveryLines.push({
      label: "Programmes",
      value: "No programmes are linked to this relationship.",
      sources: [relRef],
    });
  }

  // --- Reporting ---------------------------------------------------------
  const reportingLines: BriefLine[] = [];
  const dueReports = grantReports
    .filter((r) => r.status !== "submitted")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const report of dueReports) {
    const days = daysUntil(report.dueDate, now);
    reportingLines.push({
      label: report.title,
      value:
        days === undefined
          ? report.status.replace(/_/g, " ")
          : days < 0
            ? `${Math.abs(days)} days overdue`
            : `due in ${days} day${days === 1 ? "" : "s"} (${formatDate(report.dueDate)})`,
      sources: [{ type: "grant_report", id: report.id }],
    });
  }
  if (reportingLines.length === 0 && activeGrants.length > 0) {
    reportingLines.push({
      label: "Reporting",
      value: "No reports currently outstanding.",
      sources: activeGrants.map((g) => ({ type: "grant" as const, id: g.id })),
    });
  }

  // --- Communications ----------------------------------------------------
  const recent = [...interactions]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 3);
  const communicationLines: BriefLine[] = recent.map((i) => ({
    label: formatDate(i.occurredAt),
    value: `${i.subject}${i.summary ? ` — ${i.summary}` : ""}`,
    sources: [{ type: "interaction", id: i.id }],
  }));
  if (communicationLines.length === 0) {
    missing.push("No interactions have been recorded with this organisation.");
  }

  // --- Commitments -------------------------------------------------------
  const commitmentLines: BriefLine[] = openCommitments.map((c) => {
    const state = commitmentState(c, now);
    const who = c.direction === "we_owe" ? "We owe" : c.direction === "they_owe" ? "They owe" : "Mutual";
    return {
      label: who,
      value: `${c.title}${c.dueAt ? ` · due ${formatDate(c.dueAt)}${state === "overdue" ? " (overdue)" : ""}` : ""}`,
      sources: [{ type: "commitment", id: c.id }],
    };
  });
  if (commitmentLines.length === 0) {
    commitmentLines.push({
      label: "Commitments",
      value: "Nothing outstanding in either direction.",
      sources: [relRef],
    });
  }

  // --- Discussion points -------------------------------------------------
  const discussionPoints: BriefLine[] = [];
  for (const c of openCommitments.filter((c) => c.direction === "we_owe")) {
    discussionPoints.push({
      label: "Close out before the meeting",
      value: c.title,
      sources: [{ type: "commitment", id: c.id }],
    });
  }
  for (const c of openCommitments.filter((c) => c.direction === "they_owe")) {
    discussionPoints.push({
      label: "Ask about",
      value: c.title,
      sources: [{ type: "commitment", id: c.id }],
    });
  }
  for (const report of dueReports.slice(0, 2)) {
    discussionPoints.push({
      label: "Reporting",
      value: `Confirm expectations for ${report.title}.`,
      sources: [{ type: "grant_report", id: report.id }],
    });
  }
  for (const grant of activeGrants) {
    const elapsed = elapsedPercent(grant, now);
    if (elapsed !== undefined && elapsed >= 70) {
      discussionPoints.push({
        label: "Continuation",
        value: `${grant.title} is ${elapsed}% elapsed and ends ${formatDate(grant.endDate)}. Raise what happens next.`,
        sources: [{ type: "grant", id: grant.id }],
      });
    }
  }
  if (health.state === "needs_attention") {
    discussionPoints.push({
      label: "Relationship",
      value: health.reason,
      sources: [relRef],
    });
  }

  const sections: BriefSection[] = [
    { key: "relationship", title: "Relationship", lines: relationshipLines },
    { key: "funding", title: "Funding", lines: fundingLines },
    { key: "delivery", title: "Programmes and impact", lines: deliveryLines },
    { key: "reporting", title: "Reporting", lines: reportingLines },
    { key: "communications", title: "Recent communications", lines: communicationLines },
    { key: "commitments", title: "Open commitments", lines: commitmentLines },
  ].filter((s) => s.lines.length > 0);

  return {
    headline: headline(organisation, health, activeFunding, totalFunding),
    sections,
    discussionPoints,
    missing,
  };
}

function headline(
  organisation: ExternalOrganisation,
  health: RelationshipHealth,
  activeFunding: number,
  totalFunding: number,
): string {
  const parts = [organisation.name];
  if (totalFunding > 0) {
    parts.push(
      activeFunding > 0
        ? `${formatCurrency(activeFunding)} active of ${formatCurrency(totalFunding)} awarded`
        : `${formatCurrency(totalFunding)} awarded historically`,
    );
  }
  if (health.daysSinceLastInteraction !== undefined) {
    parts.push(`last contact ${health.daysSinceLastInteraction} days ago`);
  }
  return parts.join(" · ");
}

export function personName(person: Person): string {
  return person.preferredName
    ? `${person.preferredName} ${person.lastName}`
    : `${person.firstName} ${person.lastName}`;
}

function yearsSince(iso: string, now: Date): number | undefined {
  const days = daysUntil(iso, now);
  if (days === undefined) return undefined;
  return Math.max(0, Math.floor(-days / 365));
}

function daysUntil(iso: string, now: Date): number | undefined {
  try {
    return differenceInCalendarDays(parseISO(iso), now);
  } catch {
    return undefined;
  }
}

function elapsedPercent(grant: Grant, now: Date): number | undefined {
  try {
    const start = parseISO(grant.startDate).getTime();
    const end = parseISO(grant.endDate).getTime();
    if (end <= start) return undefined;
    const ratio = (now.getTime() - start) / (end - start);
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  } catch {
    return undefined;
  }
}
