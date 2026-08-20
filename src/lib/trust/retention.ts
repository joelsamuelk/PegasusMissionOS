import type { EntityType } from "@/types/domain";

/**
 * What is kept, for how long, and what cannot be deleted.
 *
 * The brief asks for retention, deletion and consent controls. The part most
 * often skipped is the third column below: **what an organisation cannot
 * delete, and why.** A product that offers "delete everything" and then
 * quietly keeps the audit trail has told its customer something untrue, and
 * the discovery costs more trust than the honest answer would have.
 *
 * There are three legitimate reasons a record survives a deletion request, and
 * each is named on the entry rather than left to a footnote.
 */

export type RetentionBasis =
  | "organisation_choice"
  | "legal_obligation"
  | "evidence_of_a_decision"
  | "no_policy";

export interface RetentionRule {
  entityType: EntityType | "form_submission" | "audit_event" | "ai_generation" | "sync_run";
  label: string;
  /** How long, in days. Undefined means kept until the organisation deletes it. */
  days?: number;
  basis: RetentionBasis;
  /** Why it survives a deletion request, where it does. */
  survivesDeletion?: string;
  /** Where the rule is enforced, so a claim can be checked. */
  enforcedBy?: string;
}

export const RETENTION_RULES: RetentionRule[] = [
  {
    entityType: "form_submission",
    label: "Form answers",
    basis: "organisation_choice",
    enforcedBy:
      "The form's own retention period, which a form collecting special category data cannot be published without. `redactExpired` erases the answers and keeps the submission row.",
  },
  {
    entityType: "audit_event",
    label: "Audit records",
    basis: "evidence_of_a_decision",
    survivesDeletion:
      "An audit trail that can be deleted is not evidence that anything happened. Records naming a person are reduced to their role and the action; the record of the action itself is kept.",
    enforcedBy: "Append-only row level security. There is no update or delete policy.",
  },
  {
    entityType: "ai_generation",
    label: "AI generation records",
    basis: "evidence_of_a_decision",
    survivesDeletion:
      "Which model produced which draft, and what it drew on, is what makes a published figure traceable. Deleting it would make a report unexplainable after the fact.",
  },
  {
    entityType: "impact_report",
    label: "Published reports and their versions",
    basis: "evidence_of_a_decision",
    survivesDeletion:
      "A report sent to a funder exists whether or not it is deleted here. Removing the version and its snapshot would leave the organisation unable to say what they sent.",
  },
  {
    entityType: "claim",
    label: "Claims",
    basis: "evidence_of_a_decision",
    survivesDeletion:
      "Claims are immutable and superseding. A published report cites the claim as it stood, so deleting one makes that report unresolvable.",
  },
  {
    entityType: "donation",
    label: "Donations and the transactions behind them",
    basis: "legal_obligation",
    days: 2_555,
    survivesDeletion:
      "Charity accounting records must be kept for six years from the end of the financial year they relate to. A donor's name can be removed from a gift; the gift cannot.",
  },
  {
    entityType: "person",
    label: "People",
    basis: "organisation_choice",
    enforcedBy:
      "No retention period is set by default. `Person` carries no address, date of birth or wealth field, so the data minimisation is structural rather than a policy.",
  },
  {
    entityType: "interaction",
    label: "Interactions and messages",
    basis: "no_policy",
    survivesDeletion: undefined,
    enforcedBy:
      "None. This is a gap: an organisation should be able to set how long communication records are kept, and cannot.",
  },
  {
    entityType: "sync_run",
    label: "Integration sync runs",
    basis: "evidence_of_a_decision",
    survivesDeletion:
      "A sync run records what a machine did without a person present, and is append-only for the same reason an automation run is.",
  },
];

/** Rules with no policy behind them. Reported rather than left implicit. */
export function gaps(): RetentionRule[] {
  return RETENTION_RULES.filter((rule) => rule.basis === "no_policy");
}

/**
 * What a deletion request would and would not remove.
 *
 * Produced before anything is deleted, so an organisation reads the honest
 * answer at the point they decide rather than discovering it afterwards.
 */
export interface DeletionPlan {
  removed: { label: string; note?: string }[];
  retained: { label: string; reason: string }[];
  /** True where anything is retained. A plan with none is unusual, not normal. */
  partial: boolean;
}

export function planDeletion(): DeletionPlan {
  const removed = RETENTION_RULES.filter((rule) => !rule.survivesDeletion).map((rule) => ({
    label: rule.label,
    note: rule.enforcedBy,
  }));
  const retained = RETENTION_RULES.filter((rule) => rule.survivesDeletion).map((rule) => ({
    label: rule.label,
    reason: rule.survivesDeletion!,
  }));

  return { removed, retained, partial: retained.length > 0 };
}
