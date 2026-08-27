import { planRun, runFrom, stepsFrom, type RunPlan } from "@/lib/automation/engine";
import type { FactBag } from "@/lib/automation/conditions";
import type {
  Automation,
  AutomationRun,
  DomainEvent,
  DomainEventKind,
  EntityReference,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import { ActionRefused, executeStep } from "./executor";

/**
 * The dispatcher.
 *
 * In-process, synchronous, and deliberately so. The expansion plan is explicit
 * that MG-6 introduces **no queue infrastructure**: a charity operating system
 * reminding somebody about a report does not need a broker, and adding one
 * would be the largest operational cost in the product for the smallest
 * capability. What it does need is a job table for *time*, which is
 * `scheduler.ts`; reacting to a mutation that just happened needs neither.
 *
 * Three properties this file has to keep.
 *
 * **A run is recorded whether or not it matched.** "Why did nothing happen?"
 * is the more common question and only a complete log answers it. Runs are
 * skipped only where the trigger did not apply at all, because otherwise the
 * table grows by the product of events and automations.
 *
 * **One automation failing does not stop the others.** An event dispatches to
 * every matching rule, and a rule that throws records a failure against its
 * own run. A dispatcher that abandoned the remaining rules would make one
 * broken automation silently disable the rest.
 *
 * **Dispatch never blocks the mutation that caused it.** `emit` records the
 * event and dispatches; a caller that cannot afford the latency calls
 * `recordEvent` and lets the scheduler pick it up. The failure mode being
 * avoided is a broken automation making it impossible to save a grant.
 */

export interface EmitInput {
  kind: DomainEventKind;
  subject: EntityReference;
  facts: Record<string, string | number | boolean | null>;
  previous?: Record<string, string | number | boolean | null>;
}

export interface DispatchResult {
  event: DomainEvent;
  runs: AutomationRun[];
  /** Runs held for a person. Nothing in them has taken effect. */
  awaitingApproval: AutomationRun[];
}

/**
 * Record what became true, and react to it.
 *
 * Deliberately not called from the data layer's write methods. Emitting from
 * inside `saveSection` would mean every caller pays for automation whether it
 * wanted it or not, and would make the data layer depend on the intelligence
 * layer, which is the wrong direction. Callers that should emit do so
 * explicitly, and the scheduler catches dated conditions regardless.
 */
export async function emit(
  ctx: RequestContext,
  repo: MissionRepository,
  input: EmitInput,
): Promise<DispatchResult> {
  const event = await repo.automation.recordEvent(ctx, {
    kind: input.kind,
    subject: input.subject,
    facts: input.facts,
    previous: input.previous,
    occurredAt: ctx.now().toISOString(),
    actorId: ctx.userId,
  });

  const result = await dispatch(ctx, repo, event);
  await repo.automation.markEventProcessed(ctx, event.id);
  return result;
}

export async function dispatch(
  ctx: RequestContext,
  repo: MissionRepository,
  event: DomainEvent,
  options: { additionalFacts?: FactBag } = {},
): Promise<DispatchResult> {
  const automations = await repo.automation.activeFor(ctx, event.kind);
  const runs: AutomationRun[] = [];
  const awaitingApproval: AutomationRun[] = [];

  for (const automation of automations) {
    const run = await runOne(ctx, repo, automation, event, options.additionalFacts);
    if (!run) continue;
    runs.push(run);
    if (run.outcome === "awaiting_approval") awaitingApproval.push(run);
  }

  return { event, runs, awaitingApproval };
}

async function runOne(
  ctx: RequestContext,
  repo: MissionRepository,
  automation: Automation,
  event: DomainEvent,
  additionalFacts?: FactBag,
): Promise<AutomationRun | null> {
  const now = ctx.now();
  const plan: RunPlan = planRun({ automation, event, now, additionalFacts });

  const run = runFrom(plan, {
    id: `run-${automation.id}-${event.id}`,
    organisationId: ctx.organisationId,
    eventId: event.id,
    trigger: event.kind,
    startedAt: now,
    simulated: false,
  });
  const steps = stepsFrom(plan, {
    runId: run.id,
    organisationId: ctx.organisationId,
    id: (order) => `step-${run.id}-${order}`,
  });

  await repo.automation.recordRun(ctx, run, steps);

  // Nothing takes effect until a person says so. The run stays open — it is
  // not a failure and not a completion — and appears in the approvals queue.
  if (plan.outcome === "awaiting_approval") return run;
  if (plan.outcome !== "matched") return run;

  await executeRun(ctx, repo, run);
  return (await repo.automation.getRun(ctx, run.id)) ?? run;
}

/**
 * Execute an approved or unconditional run's steps, in order.
 *
 * A step that refuses records a failure and the run continues to the next
 * step. That is the right behaviour for a list of independent actions — a
 * notification failing should not prevent a task being created — and it is
 * why `AutomationFailure` carries `retryable`: a permission refusal cannot
 * succeed on a retry and a provider timeout can.
 */
export async function executeRun(
  ctx: RequestContext,
  repo: MissionRepository,
  run: AutomationRun,
): Promise<void> {
  const steps = await repo.automation.steps(ctx, run.id);
  let failed = 0;

  for (const step of steps) {
    try {
      const outcome = await executeStep({ ctx, repo, run, step });
      await repo.automation.updateStep(ctx, step.id, {
        status: "executed",
        result: outcome.result,
        detail: outcome.detail,
        provenance: outcome.provenance,
        executedAt: ctx.now().toISOString(),
      });
    } catch (error) {
      failed += 1;
      const refused = error instanceof ActionRefused;
      await repo.automation.updateStep(ctx, step.id, {
        status: "failed",
        detail: (error as Error).message,
      });
      await repo.automation.recordFailure(ctx, {
        runId: run.id,
        stepId: step.id,
        code: refused ? (error as ActionRefused).code : "unexpected_error",
        message: (error as Error).message,
        occurredAt: ctx.now().toISOString(),
        retryable: refused ? (error as ActionRefused).retryable : false,
      });
    }
  }

  await repo.automation.completeRun(
    ctx,
    run.id,
    // Partial success is reported as failure, not as completion. A run where
    // two of three actions worked is a run somebody needs to look at, and
    // "completed" is what people skim past.
    failed === 0 ? "completed" : "failed",
    ctx.now().toISOString(),
  );
}

/**
 * Approve a held run and let it take effect.
 *
 * The approval and the execution are the same call, deliberately. A design
 * where approving set a flag and something else later noticed would put a
 * window between a person's decision and its effect, and windows are where
 * "I approved that yesterday and nothing happened" lives.
 */
export async function approveAndRun(
  ctx: RequestContext,
  repo: MissionRepository,
  runId: string,
): Promise<AutomationRun | null> {
  const approved = await repo.automation.approveRun(ctx, runId);
  if (!approved) return null;

  // Steps were parked as `awaiting_approval` at plan time; move them to
  // `planned` now that a person has decided, so the executor's own check sees
  // a run with `approvedBy` set.
  for (const step of await repo.automation.steps(ctx, runId)) {
    if (step.status === "awaiting_approval") {
      await repo.automation.updateStep(ctx, step.id, { status: "planned" });
    }
  }

  await executeRun(ctx, repo, approved);
  return repo.automation.getRun(ctx, runId);
}
