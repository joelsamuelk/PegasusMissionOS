"use server";

import { revalidatePath } from "next/cache";
import { describeSimulation, validateActions, requiresApproval } from "@/lib/automation";
import type {
  Automation,
  AutomationFailure,
  AutomationRun,
  AutomationStep,
} from "@/types/domain";
import type { OrganisationSimulation } from "@/server/automation/simulation-service";
import { simulateAgainstOrganisation } from "@/server/automation/simulation-service";
import { approveAndRun } from "@/server/automation/dispatcher";
import { tick } from "@/server/automation/scheduler";
import { getRepository } from "@/server/data";
import { authorise, ok, type ActionResult } from "./authorise";

/**
 * Automation server actions.
 *
 * Gated on `org:manage_settings` rather than on a per-domain capability, and
 * that is a deliberate choice rather than a shortcut. An automation is a
 * standing instruction that acts without a person present; whoever can create
 * one can, in effect, act in every domain the action catalogue reaches.
 * Requiring `programmes:manage` to write a rule that creates programme tasks
 * would be the narrower-looking option and the wrong one, because the same
 * rule could then be pointed at anything.
 *
 * Approving a held run is different, and is gated on `reports:approve` — the
 * capability a trustee reviewer holds. Approving is exactly what that role is
 * for.
 */

export interface AutomationListResult {
  ok: boolean;
  automations?: Automation[];
  error?: string;
}

export async function listAutomations(): Promise<AutomationListResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };
  return { ok: true, automations: await getRepository().automation.list(auth.ctx) };
}

export interface SaveAutomationResult extends ActionResult {
  automationId?: string;
  problems?: string[];
}

export async function saveAutomation(
  input: Omit<Automation, "id" | "organisationId" | "audit"> & { id?: string },
): Promise<SaveAutomationResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  const validation = validateActions(input.actions);
  if (!validation.valid) {
    return { ok: false, message: "This automation cannot be saved.", problems: validation.problems };
  }

  // The author's intent is recorded, and the computed answer is forced on top
  // of it. An automation whose actions are externally visible requires
  // approval whatever the author ticked, so a mistake in a form cannot produce
  // a rule that sends without asking.
  const automationId = await getRepository().automation.save(auth.ctx, {
    ...input,
    requiresApproval: input.requiresApproval || requiresApproval(input.actions),
  });

  revalidatePath("/automations");
  return { ...ok, automationId };
}

export async function setAutomationStatus(
  id: string,
  status: Automation["status"],
): Promise<ActionResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;
  await getRepository().automation.setStatus(auth.ctx, id, status);
  revalidatePath("/automations");
  return ok;
}

export interface SimulationResult {
  ok: boolean;
  simulation?: OrganisationSimulation;
  lines?: string[];
  error?: string;
}

/**
 * Test against the current organisation.
 *
 * Runs whether or not the automation is active, and forces it active for the
 * duration: the whole point is to answer "what would this do if I turned it
 * on?" and a simulation that reported "skipped, it is a draft" would answer a
 * question nobody asked.
 */
export async function simulateAutomationAction(id: string): Promise<SimulationResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const automation = await repo.automation.get(auth.ctx, id);
  if (!automation) return { ok: false, error: "That automation could not be found." };

  const simulation = await simulateAgainstOrganisation(auth.ctx, repo, automation);
  return {
    ok: true,
    simulation,
    lines: [...describeSimulation(simulation), ...simulation.caveats],
  };
}

export interface RunLogResult {
  ok: boolean;
  runs?: AutomationRun[];
  steps?: Record<string, AutomationStep[]>;
  failures?: Record<string, AutomationFailure[]>;
  error?: string;
}

export async function loadRunLog(automationId?: string): Promise<RunLogResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const runs = await repo.automation.runs(auth.ctx, { automationId });
  const steps: Record<string, AutomationStep[]> = {};
  const failures: Record<string, AutomationFailure[]> = {};

  for (const run of runs.slice(0, 50)) {
    steps[run.id] = await repo.automation.steps(auth.ctx, run.id);
    const runFailures = await repo.automation.failures(auth.ctx, run.id);
    if (runFailures.length > 0) failures[run.id] = runFailures;
  }

  return { ok: true, runs, steps, failures };
}

export async function approveRun(runId: string): Promise<ActionResult> {
  const auth = await authorise("reports:approve");
  if (!auth.ok) return auth.result;

  const run = await approveAndRun(auth.ctx, getRepository(), runId);
  if (!run) {
    return {
      ok: false,
      message: "That run is not waiting for approval. It may already have been decided.",
    };
  }
  revalidatePath("/automations");
  return ok;
}

export interface TickResult extends ActionResult {
  scanned?: number;
  scheduled?: number;
  alreadyScheduled?: number;
  ran?: number;
}

/**
 * Run the scheduler once.
 *
 * Exposed as an action so the reminder engine can be driven by a request, a
 * cron entry, or a person pressing a button, without any of the three needing
 * different code. Idempotent: the dedupe key means running it twice produces
 * the same reminders once.
 */
export async function runScheduler(): Promise<TickResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  const { scan, jobs } = await tick(auth.ctx, getRepository());
  revalidatePath("/automations");
  return {
    ...ok,
    scanned: scan.scanned,
    scheduled: scan.scheduled.length,
    alreadyScheduled: scan.alreadyScheduled,
    ran: jobs.ran,
  };
}
