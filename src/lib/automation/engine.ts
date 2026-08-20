import type {
  Automation,
  AutomationAction,
  AutomationRun,
  AutomationRunOutcome,
  AutomationStep,
  DomainEvent,
  EntityReference,
} from "@/types/domain";
import { ACTION_CATALOGUE, requiresApproval, validateActions } from "./actions";
import {
  evaluateCondition,
  explainTrace,
  type AutomationCondition,
  type ConditionTrace,
  type FactBag,
} from "./conditions";

/**
 * The rules engine.
 *
 * Its single most important property: **it plans, it does not act.** Given an
 * automation and an event it returns a decision and a list of steps, and
 * writes nothing. Execution is a separate, authorised, approval-gated step in
 * `server/automation/executor.ts`.
 *
 * That separation is what makes simulation honest. The brief asks for "test
 * against current organisation" showing *would trigger on 7 records, would
 * create 12 tasks, would send 0 external communications*. If planning and
 * acting were the same function, simulation would either be a second code path
 * — which would eventually diverge from the real one and reassure people about
 * behaviour that no longer exists — or a real run with the writes commented
 * out, which is worse. Here, simulation runs exactly the code a live run runs,
 * and simply does not call the executor.
 */

export type TriggerMatch =
  | { matched: true }
  | { matched: false; reason: string };

/**
 * Does this event concern this automation at all?
 *
 * Checked before the condition, because a rule about grants should not be
 * recorded as "did not match" on every indicator update. A run is only
 * recorded once the trigger matched; otherwise the run table would grow by the
 * product of events and automations.
 */
export function matchesTrigger(automation: Automation, event: DomainEvent): TriggerMatch {
  if (automation.trigger.kind !== event.kind) {
    return { matched: false, reason: `Trigger is ${automation.trigger.kind}, event is ${event.kind}.` };
  }
  if (automation.trigger.entityType && automation.trigger.entityType !== event.subject.type) {
    return {
      matched: false,
      reason: `Trigger is limited to ${automation.trigger.entityType}, subject is ${event.subject.type}.`,
    };
  }
  return { matched: true };
}

export interface PlannedStep {
  order: number;
  action: AutomationAction;
  /** True where this step cannot run until a person approves. */
  needsApproval: boolean;
  /** True where a model participates inside the action. */
  usesModel: boolean;
}

export interface RunPlan {
  automationId: string;
  outcome: AutomationRunOutcome;
  explanation: string;
  trace?: ConditionTrace;
  steps: PlannedStep[];
  /** True where the whole run is held pending a person. */
  needsApproval: boolean;
  subject: EntityReference;
}

export interface PlanOptions {
  automation: Automation;
  event: DomainEvent;
  now: Date;
  /**
   * Extra facts beyond the event's own payload — a grant's health when the
   * event was about its deliverable, for instance. Merged under the event's
   * facts so an event never has its own values overwritten.
   */
  additionalFacts?: FactBag;
}

/**
 * Decide what an automation would do, without doing any of it.
 */
export function planRun(options: PlanOptions): RunPlan {
  const { automation, event, now } = options;

  const facts: FactBag = {
    ...(options.additionalFacts ?? {}),
    ...event.facts,
    ...Object.fromEntries(
      Object.entries(event.previous ?? {}).map(([key, value]) => [`previous.${key}`, value]),
    ),
  };

  const base = {
    automationId: automation.id,
    subject: event.subject,
    needsApproval: false,
    steps: [] as PlannedStep[],
  };

  if (automation.status !== "active") {
    return {
      ...base,
      outcome: "skipped",
      explanation: `This automation is ${automation.status} and does not run.`,
    };
  }

  const validation = validateActions(automation.actions);
  if (!validation.valid) {
    // A misconfigured automation fails loudly at plan time rather than
    // half-executing at run time. Two of three actions taken is worse than
    // none, because nobody can tell from the outside which two.
    return {
      ...base,
      outcome: "failed",
      explanation: `This automation cannot run: ${validation.problems.join(" ")}`,
    };
  }

  let trace: ConditionTrace | undefined;
  if (automation.condition) {
    const evaluation = evaluateCondition(automation.condition as AutomationCondition, {
      facts,
      now,
    });
    trace = evaluation.trace;

    if (evaluation.result === "unknown") {
      return {
        ...base,
        outcome: "undecidable",
        explanation: explainTrace(evaluation.trace),
        trace,
      };
    }
    if (evaluation.result === "false") {
      return {
        ...base,
        outcome: "not_matched",
        explanation: explainTrace(evaluation.trace),
        trace,
      };
    }
  }

  const steps: PlannedStep[] = automation.actions.map((action, index) => {
    const descriptor = ACTION_CATALOGUE[action.kind];
    return {
      order: index,
      action,
      needsApproval: descriptor ? descriptor.requiresApproval || descriptor.externallyVisible : true,
      usesModel: descriptor?.usesModel ?? false,
    };
  });

  // The stored flag records the author's intent; this recomputes the answer
  // from the actions themselves. Where they disagree, the computed answer
  // wins, so a mistake in the stored flag cannot send anything.
  const needsApproval = automation.requiresApproval || requiresApproval(automation.actions);

  return {
    automationId: automation.id,
    subject: event.subject,
    outcome: needsApproval ? "awaiting_approval" : "matched",
    explanation: trace
      ? explainTrace(trace)
      : "This automation has no condition, so it runs whenever its trigger fires.",
    trace,
    steps,
    needsApproval,
  };
}

/** Build the run record from a plan. Written whether or not it matched. */
export function runFrom(
  plan: RunPlan,
  input: {
    id: string;
    organisationId: string;
    eventId?: string;
    trigger: AutomationRun["trigger"];
    startedAt: Date;
    simulated: boolean;
  },
): AutomationRun {
  return {
    id: input.id,
    organisationId: input.organisationId,
    automationId: plan.automationId,
    eventId: input.eventId,
    trigger: input.trigger,
    subject: plan.subject,
    outcome: plan.outcome,
    conditionTrace: plan.trace,
    explanation: plan.explanation,
    startedAt: input.startedAt.toISOString(),
    finishedAt:
      plan.outcome === "awaiting_approval" ? undefined : input.startedAt.toISOString(),
    simulated: input.simulated,
  };
}

export function stepsFrom(
  plan: RunPlan,
  input: { runId: string; organisationId: string; id: (order: number) => string },
): AutomationStep[] {
  return plan.steps.map((step) => ({
    id: input.id(step.order),
    organisationId: input.organisationId,
    runId: input.runId,
    order: step.order,
    action: step.action.kind,
    params: step.action.params,
    status: step.needsApproval ? "awaiting_approval" : "planned",
  }));
}
