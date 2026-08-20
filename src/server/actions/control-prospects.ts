"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authoriseControl as authorise } from "./authorise";
import { getControlRepository } from "@/server/control-plane";
import { ControlAuthorisationError } from "@/lib/control-plane/permissions";
import {
  ControlMembershipError,
  ControlNotAuthenticatedError,
} from "@/server/control-plane/context";
import { addProspectPerson, createProspect } from "@/server/control-plane/prospect-service";
import { runDiscoveryJob, type DiscoveryRunSummary } from "@/server/control-plane/discovery-service";
import { importProspectCsv, type CsvImportSummary } from "@/server/control-plane/prospect-import";
import { pilotJobs } from "@/lib/commercial/pilot";

const DISCOVER = "/control/prospects/discover";

export async function createProspectAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:create");
  const id = await createProspect(ctx, await getControlRepository(ctx), { name: String(form.get("name") ?? ""), website: String(form.get("website") ?? "") || undefined, country: String(form.get("country") ?? "") || undefined, organisationType: String(form.get("organisationType") ?? "") || undefined, source: "manual" });
  redirect(`/control/prospects/${id}`);
}
export async function addProspectPersonAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:update");
  const prospectId = String(form.get("prospectId") ?? "");
  await addProspectPerson(ctx, await getControlRepository(ctx), { prospectId, name: String(form.get("name") ?? ""), role: String(form.get("role") ?? "") || undefined, email: String(form.get("email") ?? "") || undefined, sourceUrl: String(form.get("sourceUrl") ?? "") || undefined });
  revalidatePath(`/control/prospects/${prospectId}`);
}

/**
 * The discover page is a server component, so a run reports back through the
 * URL rather than through client state. Only closed-vocabulary values travel:
 * the page rebuilds every sentence from the job definition it already holds.
 */
function summaryQuery(summary: DiscoveryRunSummary): string {
  const failed = summary.providers.filter((p) => p.failure).map((p) => `${p.provider}:${p.failure}`);
  const query = new URLSearchParams({ job: summary.jobId, found: String(summary.found), created: String(summary.created), duplicates: String(summary.duplicates), rejected: String(summary.rejected) });
  if (failed.length) query.set("failed", failed.join(","));
  return query.toString();
}

/**
 * Classify a failure into the closed vocabulary the discover page can render.
 *
 * An action that throws past this point renders nothing at all: the control
 * surface reaches its error boundary, and before that existed a failed run was
 * indistinguishable from a dead button. Identity and capability are separated
 * because the operator's next step differs — sign in again, or ask for a role.
 */
function failureCode(error: unknown): string {
  if (
    error instanceof ControlNotAuthenticatedError ||
    error instanceof ControlMembershipError
  ) {
    return "signed_out";
  }
  if (error instanceof ControlAuthorisationError) return "not_permitted";
  return "run_failed";
}

export async function runDiscoveryJobAction(form: FormData): Promise<void> {
  const jobId = String(form.get("jobId") ?? "");
  const job = pilotJobs.find((candidate) => candidate.id === jobId);
  if (!job) redirect(`${DISCOVER}?error=unknown_job`);

  // Every await sits inside the attempt, including authorisation: a session
  // that expired while the page was open must report itself, not vanish.
  // `redirect` throws its own control-flow signal, so it is called only after.
  let outcome: { summary: DiscoveryRunSummary } | { error: string };
  try {
    const ctx = await authorise("prospect:create");
    outcome = { summary: await runDiscoveryJob(ctx, await getControlRepository(ctx), job) };
  } catch (error) {
    outcome = { error: failureCode(error) };
  }

  if ("error" in outcome) {
    redirect(`${DISCOVER}?job=${encodeURIComponent(job.id)}&error=${outcome.error}`);
  }
  revalidatePath(DISCOVER);
  revalidatePath("/control/prospects");
  redirect(`${DISCOVER}?${summaryQuery(outcome.summary)}`);
}

export async function importProspectCsvAction(form: FormData): Promise<void> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) redirect(`${DISCOVER}?error=no_file`);

  let outcome: { summary: CsvImportSummary } | { error: string };
  try {
    const ctx = await authorise("prospect:create");
    outcome = {
      summary: await importProspectCsv(ctx, await getControlRepository(ctx), await file.text()),
    };
  } catch (error) {
    const code = failureCode(error);
    outcome = { error: code === "run_failed" ? "import_failed" : code };
  }

  if ("error" in outcome) redirect(`${DISCOVER}?error=${outcome.error}`);
  revalidatePath(DISCOVER);
  revalidatePath("/control/prospects");
  redirect(`${DISCOVER}?import=1&created=${outcome.summary.created}&duplicates=${outcome.summary.duplicates}&rejected=${outcome.summary.rejected}`);
}
