import type { Automation, AutomationActionKind, DomainEvent } from "@/types/domain";
import { ACTION_CATALOGUE } from "./actions";
import { matchesTrigger, planRun, type RunPlan } from "./engine";
import type { FactBag } from "./conditions";

/**
 * Test against the current organisation.
 *
 * The brief asks for exactly this, and for exactly this output:
 *
 *   would trigger on 7 records · would create 12 tasks · would send 0 external
 *   communications
 *
 * The last of those three is the one that matters. Somebody enabling an
 * automation needs to know, before they enable it, whether it can reach
 * outside the organisation. A simulation that reported only "would trigger on
 * 7 records" would let a rule that drafts seven funder emails look identical
 * to one that creates seven tasks.
 *
 * The undecidable count is the second thing worth reading and is not in the
 * brief's list. A rule that cannot be decided on forty records is not a rule
 * that will quietly do nothing; it is a rule the organisation believes is
 * running. Reporting it here is the difference between a simulation and a
 * reassurance.
 */

export interface SimulationOutcome {
  automationId: string;
  automationName: string;
  /** Records the trigger applied to at all. */
  candidates: number;
  wouldTrigger: number;
  wouldNotTrigger: number;
  undecidable: number;
  failed: number;
  /** Every action it would take, counted by kind. */
  actionCounts: Record<string, number>;
  /** The count the brief singles out, and the reason simulation exists. */
  externalCommunications: number;
  /** Runs that would wait for a person rather than happening. */
  awaitingApproval: number;
  /** Whether a model would participate anywhere. */
  usesModel: boolean;
  /** The subjects it matched, so a person can spot-check the list. */
  matchedSubjects: { type: string; id: string; label?: string }[];
  /** Why undecidable ones could not be decided, deduplicated. */
  undecidableReasons: string[];
}

export interface SimulationInput {
  automation: Automation;
  /** Every event the rule could see, usually synthesised from current records. */
  events: DomainEvent[];
  now: Date;
  factsFor?: (event: DomainEvent) => FactBag;
  /** Cap the subjects listed back. The counts are never capped. */
  sampleLimit?: number;
}

export function simulateAutomation(input: SimulationInput): SimulationOutcome {
  const { automation, events, now } = input;
  const sampleLimit = input.sampleLimit ?? 10;

  const outcome: SimulationOutcome = {
    automationId: automation.id,
    automationName: automation.name,
    candidates: 0,
    wouldTrigger: 0,
    wouldNotTrigger: 0,
    undecidable: 0,
    failed: 0,
    actionCounts: {},
    externalCommunications: 0,
    awaitingApproval: 0,
    usesModel: false,
    matchedSubjects: [],
    undecidableReasons: [],
  };

  const reasons = new Set<string>();

  for (const event of events) {
    if (!matchesTrigger(automation, event).matched) continue;
    outcome.candidates += 1;

    // The same function a live run calls. A simulation with its own code path
    // would eventually reassure somebody about behaviour that no longer exists.
    const plan: RunPlan = planRun({
      automation,
      event,
      now,
      additionalFacts: input.factsFor?.(event),
    });

    switch (plan.outcome) {
      case "undecidable":
        outcome.undecidable += 1;
        reasons.add(plan.explanation);
        continue;
      case "not_matched":
        outcome.wouldNotTrigger += 1;
        continue;
      case "failed":
      case "skipped":
        outcome.failed += 1;
        reasons.add(plan.explanation);
        continue;
      default:
        break;
    }

    outcome.wouldTrigger += 1;
    if (plan.needsApproval) outcome.awaitingApproval += 1;
    if (outcome.matchedSubjects.length < sampleLimit) {
      outcome.matchedSubjects.push(plan.subject);
    }

    for (const step of plan.steps) {
      const kind: AutomationActionKind = step.action.kind;
      outcome.actionCounts[kind] = (outcome.actionCounts[kind] ?? 0) + 1;
      const descriptor = ACTION_CATALOGUE[kind];
      if (descriptor?.externallyVisible) outcome.externalCommunications += 1;
      if (descriptor?.usesModel) outcome.usesModel = true;
    }
  }

  outcome.undecidableReasons = [...reasons];
  return outcome;
}

/**
 * The simulation as a sentence, in the brief's own shape.
 *
 * Written as a function rather than in a component so the same wording appears
 * in the UI, in a test and in an audit record. Three places rendering the same
 * counts differently is how a "would send 0" becomes a "sends 0" somewhere.
 */
export function describeSimulation(outcome: SimulationOutcome): string[] {
  const lines = [
    `Would trigger on ${outcome.wouldTrigger} record${outcome.wouldTrigger === 1 ? "" : "s"}, out of ${outcome.candidates} the trigger applies to.`,
  ];

  const actions = Object.entries(outcome.actionCounts);
  if (actions.length === 0) {
    lines.push("Would take no action.");
  } else {
    for (const [kind, count] of actions) {
      const label = ACTION_CATALOGUE[kind as AutomationActionKind]?.label ?? kind;
      lines.push(`Would ${label.toLowerCase()} ${count} time${count === 1 ? "" : "s"}.`);
    }
  }

  lines.push(
    `Would send ${outcome.externalCommunications} external communication${outcome.externalCommunications === 1 ? "" : "s"}.`,
  );

  if (outcome.awaitingApproval > 0) {
    lines.push(
      `${outcome.awaitingApproval} run${outcome.awaitingApproval === 1 ? "" : "s"} would wait for a person before anything happened.`,
    );
  }

  if (outcome.undecidable > 0) {
    // Never omitted when non-zero. A rule that cannot be decided on forty
    // records is a rule the organisation wrongly believes is running.
    lines.push(
      `Could not be decided on ${outcome.undecidable} record${outcome.undecidable === 1 ? "" : "s"}, so it would not fire on ${outcome.undecidable === 1 ? "it" : "them"}. ${outcome.undecidableReasons.join(" ")}`,
    );
  }

  if (outcome.failed > 0) {
    lines.push(`${outcome.failed} would fail before running. ${outcome.undecidableReasons.join(" ")}`);
  }

  return lines;
}
