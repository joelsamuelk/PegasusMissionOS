import type { AutomationAction, AutomationActionKind } from "@/types/domain";

/**
 * The closed set of things an automation may do.
 *
 * The brief's instruction is *do NOT allow arbitrary AI database mutation*,
 * and the way to honour that is not to police what a model asks for. It is to
 * make the set of possible effects finite, enumerable and individually
 * reviewed. An automation cannot write a field. It can create a task, and
 * creating a task is a thing whose consequences are known and bounded.
 *
 * Every action declares three properties, and two of them are safety rather
 * than metadata:
 *
 * - **`externallyVisible`** — whether taking it has an effect a third party
 *   can see. Invariant 7 says human approval is required for external action.
 *   Declaring it here rather than checking it at each call site means a new
 *   action cannot be added without answering the question.
 * - **`requiresApproval`** — whether a person must confirm each run. Forced
 *   true for anything externally visible; the field exists separately so that
 *   an internal action can *also* require approval where its blast radius
 *   warrants it (`set_workflow_state` does).
 * - **`usesModel`** — whether a model participates. AI may assist *inside* a
 *   bounded action; it never chooses the action or its target.
 */

export interface ActionDescriptor {
  kind: AutomationActionKind;
  label: string;
  /** What it does, in the words a rule author would use. */
  description: string;
  externallyVisible: boolean;
  requiresApproval: boolean;
  usesModel: boolean;
  /** Parameters the action needs. A missing required param fails validation. */
  required: string[];
  optional: string[];
}

/**
 * The catalogue.
 *
 * Ordered roughly by blast radius, smallest first, which is also the order a
 * rule author should be offered them in.
 */
export const ACTION_CATALOGUE: Record<AutomationActionKind, ActionDescriptor> = {
  create_task: {
    kind: "create_task",
    label: "Create a task",
    description:
      "Adds a task to the workspace, optionally assigned and dated. Visible only inside the organisation.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: false,
    required: ["title"],
    optional: ["assigneeId", "dueDate", "relatedType", "relatedId"],
  },
  notify_user: {
    kind: "notify_user",
    label: "Notify someone",
    description: "Sends an in-product notification to a member of this organisation.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: false,
    required: ["userId", "message"],
    optional: ["link"],
  },
  request_review: {
    kind: "request_review",
    label: "Ask for a review",
    description: "Asks a named person to review a record, as a task carrying the record.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: false,
    required: ["userId", "entityType", "entityId"],
    optional: ["note"],
  },
  request_evidence: {
    kind: "request_evidence",
    label: "Ask for evidence",
    description:
      "Identifies the evidence a report or requirement is missing and creates a task for each gap.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: false,
    required: ["entityType", "entityId"],
    optional: ["assigneeId"],
  },
  prepare_report: {
    kind: "prepare_report",
    label: "Prepare a report",
    description:
      "Creates a report from the relevant template, empty, so the workspace exists before the deadline does.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: false,
    required: ["title", "type", "reportingPeriod"],
    optional: ["definitionId", "grantId", "programmeId"],
  },
  assign_owner: {
    kind: "assign_owner",
    label: "Assign an owner",
    description: "Sets the accountable person on a record that has no owner.",
    externallyVisible: false,
    // Reassigning accountability without anybody deciding to is how a task
    // ends up owned by somebody who does not know they own it.
    requiresApproval: true,
    usesModel: false,
    required: ["entityType", "entityId", "userId"],
    optional: [],
  },
  set_workflow_state: {
    kind: "set_workflow_state",
    label: "Move a workflow state",
    description:
      "Advances a record along a state machine that already permits the transition. Never skips a state and never approves anything.",
    externallyVisible: false,
    // A state change is the closest an automation gets to writing a field, so
    // it is approval-gated even though nobody outside can see it.
    requiresApproval: true,
    usesModel: false,
    required: ["entityType", "entityId", "state"],
    optional: [],
  },
  generate_brief: {
    kind: "generate_brief",
    label: "Generate an intelligence brief",
    description:
      "Assembles a Mission Brief about the subject. The brief is deterministic; a model narrates it.",
    externallyVisible: false,
    requiresApproval: false,
    usesModel: true,
    required: [],
    optional: ["entityType", "entityId"],
  },
  draft_communication: {
    kind: "draft_communication",
    label: "Draft a message",
    description:
      "Drafts a message to an external party. The draft is created; it is never sent.",
    // The draft itself is internal, but the action exists to produce something
    // that will leave the organisation, and the approval gate belongs at the
    // point the draft is created rather than at the point somebody presses
    // send in a hurry.
    externallyVisible: true,
    requiresApproval: true,
    usesModel: true,
    required: ["recipientType", "recipientId", "purpose"],
    optional: ["tone", "relatedType", "relatedId"],
  },
};

export const ACTION_KINDS = Object.keys(ACTION_CATALOGUE) as AutomationActionKind[];

/**
 * Whether a run needs a person before its actions take effect.
 *
 * Computed from the actions rather than read from the automation, and the two
 * are checked against each other at save time. An automation whose author
 * ticked "no approval needed" and whose actions include a draft communication
 * is not permitted to exist, but even if one did, the executor would still
 * refuse: this function is the authority and the stored flag is a record of
 * intent.
 */
export function requiresApproval(actions: AutomationAction[]): boolean {
  return actions.some((action) => {
    const descriptor = ACTION_CATALOGUE[action.kind];
    // An unknown action kind is treated as requiring approval, not as
    // requiring nothing. Failing safe on an unrecognised action is the only
    // defensible default in a system where the catalogue may be extended.
    return descriptor ? descriptor.requiresApproval || descriptor.externallyVisible : true;
  });
}

export function isExternallyVisible(actions: AutomationAction[]): boolean {
  return actions.some((action) => ACTION_CATALOGUE[action.kind]?.externallyVisible ?? true);
}

export function usesModel(actions: AutomationAction[]): boolean {
  return actions.some((action) => ACTION_CATALOGUE[action.kind]?.usesModel ?? false);
}

export interface ActionValidation {
  valid: boolean;
  problems: string[];
}

/**
 * Validate an action's parameters against its descriptor.
 *
 * Unknown parameters are a problem, not a shrug. A rule author who typed
 * `assignee` instead of `assigneeId` should be told, rather than getting an
 * automation that silently creates unassigned tasks forever.
 */
export function validateAction(action: AutomationAction): ActionValidation {
  const descriptor = ACTION_CATALOGUE[action.kind];
  if (!descriptor) {
    return { valid: false, problems: [`${action.kind} is not an action this engine can take.`] };
  }

  const problems: string[] = [];
  for (const key of descriptor.required) {
    const value = action.params[key];
    if (value === undefined || value === null || value === "") {
      problems.push(`${descriptor.label} needs ${key}.`);
    }
  }

  const allowed = new Set([...descriptor.required, ...descriptor.optional]);
  for (const key of Object.keys(action.params)) {
    if (!allowed.has(key)) {
      problems.push(
        `${descriptor.label} does not take ${key}. It takes ${[...allowed].join(", ") || "no parameters"}.`,
      );
    }
  }

  return { valid: problems.length === 0, problems };
}

export function validateActions(actions: AutomationAction[]): ActionValidation {
  if (actions.length === 0) {
    return {
      valid: false,
      problems: ["An automation with no actions does nothing and cannot be saved."],
    };
  }
  const problems = actions.flatMap((action) => validateAction(action).problems);
  return { valid: problems.length === 0, problems };
}
