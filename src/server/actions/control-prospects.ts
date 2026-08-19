"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authoriseControl as authorise } from "./authorise";
import { getControlRepository } from "@/server/control-plane";
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

export async function runDiscoveryJobAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:create");
  const job = pilotJobs.find((candidate) => candidate.id === String(form.get("jobId") ?? ""));
  if (!job) redirect(`${DISCOVER}?error=unknown_job`);

  let summary: DiscoveryRunSummary;
  try {
    summary = await runDiscoveryJob(ctx, await getControlRepository(ctx), job);
  } catch {
    // The run reached no provider at all — a repository or configuration fault.
    redirect(`${DISCOVER}?job=${encodeURIComponent(job.id)}&error=run_failed`);
  }
  revalidatePath(DISCOVER);
  revalidatePath("/control/prospects");
  redirect(`${DISCOVER}?${summaryQuery(summary)}`);
}

export async function importProspectCsvAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:create");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) redirect(`${DISCOVER}?error=no_file`);

  let summary: CsvImportSummary;
  try {
    summary = await importProspectCsv(ctx, await getControlRepository(ctx), await file.text());
  } catch {
    redirect(`${DISCOVER}?error=import_failed`);
  }
  revalidatePath(DISCOVER);
  revalidatePath("/control/prospects");
  redirect(`${DISCOVER}?import=1&created=${summary.created}&duplicates=${summary.duplicates}&rejected=${summary.rejected}`);
}
