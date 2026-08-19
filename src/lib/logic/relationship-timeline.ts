import type {
  Application,
  Commitment,
  EntityReference,
  Grant,
  GrantPayment,
  GrantReport,
  ImpactReport,
  Interaction,
  Relationship,
  Task,
} from "@/types/domain";
import { formatCurrency } from "@/lib/formatting";
import { commitmentState } from "./relationship-health";

/**
 * The unified relationship timeline.
 *
 * This is a **projection**, not a table. Grant awards, payments, application
 * submissions, reports, deliverables and commitments already exist as records
 * in the Mission Graph; copying them into a timeline store would create a
 * second source of truth that drifts the first time one of them is corrected.
 *
 * Every emitted event therefore carries `source` — the record it was projected
 * from — so the UI can link back and a reader can verify any line.
 *
 * The function is pure and takes already-fetched, already-tenant-scoped
 * records. It has no repository access, which means it cannot reach across a
 * tenant boundary even by mistake.
 */

export type TimelineKind =
  | "interaction"
  | "relationship_started"
  | "grant_awarded"
  | "grant_payment"
  | "grant_report"
  | "application"
  | "impact_report"
  | "commitment"
  | "task";

export interface TimelineEvent {
  id: string;
  /** ISO date or timestamp. Sorting is lexicographic on the ISO string. */
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  href?: string;
  /** Provenance: the record this line was projected from. */
  source: EntityReference;
  tone?: "neutral" | "positive" | "attention";
}

export interface TimelineInput {
  relationship: Relationship;
  interactions: Interaction[];
  /** Grants where this party is the funder. */
  grants: Grant[];
  payments: GrantPayment[];
  grantReports: GrantReport[];
  /** Applications made to this party. */
  applications: Application[];
  /** Impact reports produced for this party's grants. */
  impactReports: ImpactReport[];
  commitments: Commitment[];
  tasks: Task[];
  now: Date;
}

export function buildRelationshipTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (input.relationship.startedAt) {
    events.push({
      id: `rel-${input.relationship.id}`,
      at: input.relationship.startedAt,
      kind: "relationship_started",
      title: "Relationship began",
      source: { type: "relationship", id: input.relationship.id },
      tone: "neutral",
    });
  }

  for (const interaction of input.interactions) {
    events.push({
      id: `int-${interaction.id}`,
      at: interaction.occurredAt,
      kind: "interaction",
      title: interactionTitle(interaction),
      detail: interaction.summary ?? interaction.subject,
      source: { type: "interaction", id: interaction.id },
      tone: "neutral",
    });
  }

  for (const grant of input.grants) {
    events.push({
      id: `grant-${grant.id}`,
      at: grant.startDate,
      kind: "grant_awarded",
      title: "Grant awarded",
      detail: `${grant.title} · ${formatCurrency(grant.awardValue, grant.currency)}`,
      href: `/grants/${grant.id}`,
      source: { type: "grant", id: grant.id },
      tone: "positive",
    });
  }

  for (const payment of input.payments) {
    // Only received payments are facts. A scheduled payment is a plan, and
    // belongs on the forward view, not in the history.
    if (!payment.received) continue;
    const grant = input.grants.find((g) => g.id === payment.grantId);
    events.push({
      id: `pay-${payment.id}`,
      at: payment.dueDate,
      kind: "grant_payment",
      title: "Grant payment received",
      detail: `${formatCurrency(payment.amount, grant?.currency ?? "GBP")} · ${payment.label}`,
      href: grant ? `/grants/${grant.id}` : undefined,
      source: { type: "grant_payment", id: payment.id },
      tone: "positive",
    });
  }

  for (const report of input.grantReports) {
    if (report.status !== "submitted") continue;
    events.push({
      id: `grep-${report.id}`,
      at: report.dueDate,
      kind: "grant_report",
      title: "Report submitted",
      detail: report.title,
      href: `/grants/${report.grantId}`,
      source: { type: "grant_report", id: report.id },
      tone: "positive",
    });
  }

  for (const application of input.applications) {
    const submitted =
      application.status === "submitted" ||
      application.status === "successful" ||
      application.status === "unsuccessful";
    events.push({
      id: `app-${application.id}`,
      at: submitted ? (application.audit.updatedAt ?? application.audit.createdAt) : application.audit.createdAt,
      kind: "application",
      title: submitted ? "Application submitted" : "Application started",
      detail: application.title,
      href: `/applications/${application.id}`,
      source: { type: "application", id: application.id },
      tone: application.status === "unsuccessful" ? "attention" : "neutral",
    });
  }

  for (const report of input.impactReports) {
    if (report.status !== "approved") continue;
    events.push({
      id: `imp-${report.id}`,
      at: report.audit.updatedAt,
      kind: "impact_report",
      title: "Impact report approved",
      detail: `${report.title} · ${report.reportingPeriod}`,
      href: `/impact/${report.id}`,
      source: { type: "impact_report", id: report.id },
      tone: "positive",
    });
  }

  for (const commitment of input.commitments) {
    const state = commitmentState(commitment, input.now);
    const who = commitment.direction === "we_owe" ? "We committed" : commitment.direction === "they_owe" ? "They committed" : "Mutual commitment";
    events.push({
      id: `com-${commitment.id}`,
      at: commitment.completedAt ?? commitment.audit.createdAt,
      kind: "commitment",
      title: state === "completed" ? "Commitment completed" : who,
      detail: commitment.title,
      source: { type: "commitment", id: commitment.id },
      tone: state === "overdue" ? "attention" : state === "completed" ? "positive" : "neutral",
    });
  }

  for (const task of input.tasks) {
    if (task.status !== "done") continue;
    events.push({
      id: `task-${task.id}`,
      at: task.audit.updatedAt,
      kind: "task",
      title: "Task completed",
      detail: task.title,
      source: { type: "task", id: task.id },
      tone: "neutral",
    });
  }

  // Newest first. Ties break on id so the order is stable across renders.
  return events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

const TYPE_TITLES: Record<Interaction["type"], string> = {
  email: "Email",
  meeting: "Meeting",
  call: "Call",
  message: "Message",
  event: "Event",
  introduction: "Introduction",
  note: "Note",
  proposal: "Proposal",
  visit: "Visit",
  other: "Interaction",
};

function interactionTitle(interaction: Interaction): string {
  const base = TYPE_TITLES[interaction.type];
  if (interaction.type === "email") {
    return interaction.direction === "inbound" ? "Email received" : "Email sent";
  }
  if (interaction.type === "call") {
    return interaction.direction === "inbound" ? "Call received" : "Call made";
  }
  return base;
}
