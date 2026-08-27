"use server";

import { revalidatePath } from "next/cache";
import type {
  ConsentRecord,
  Form,
  FormSubmission,
  SubmissionAnswer,
} from "@/types/domain";
import { getRepository } from "@/server/data";
import { applyProjection, buildProjection, type FullProjection } from "@/server/forms/apply";
import { authorise, ok, type ActionResult } from "./authorise";

/**
 * Form server actions.
 *
 * Three capabilities, and the split is the one the brief implies rather than
 * the one that is convenient:
 *
 * - `forms:manage` designs forms, which decides what the organisation asks
 *   people and is therefore a governance act rather than an editorial one.
 * - `forms:review` decides what a submission changes in the graph.
 * - `beneficiary_data:view` is checked inside the repository, not here, so
 *   that a reviewer without it can still review — they simply do not see the
 *   special category answers.
 *
 * The public path lives in `public-forms.ts`, separately, so that the
 * `@public-action` exemption in the data-boundary test covers exactly the two
 * actions that need it and not the six here that do not.
 */

export interface FormsResult {
  ok: boolean;
  forms?: Form[];
  error?: string;
}

export async function listForms(): Promise<FormsResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };
  return { ok: true, forms: await getRepository().forms.list(auth.ctx) };
}

export interface SubmissionDetail {
  submission: FormSubmission;
  answers: SubmissionAnswer[];
  consent: ConsentRecord[];
  projection: FullProjection | null;
  /** True where the caller cannot see every answer. Said, never implied. */
  answersWithheld: boolean;
}

export interface SubmissionResult {
  ok: boolean;
  detail?: SubmissionDetail;
  error?: string;
}

export async function loadSubmission(submissionId: string): Promise<SubmissionResult> {
  const auth = await authorise("forms:review");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const submission = await repo.forms.getSubmission(auth.ctx, submissionId);
  if (!submission) return { ok: false, error: "That submission could not be found." };

  const [answers, consent, projection] = await Promise.all([
    repo.forms.answers(auth.ctx, submissionId),
    repo.forms.consent(auth.ctx, submissionId),
    buildProjection(auth.ctx, repo, submissionId),
  ]);

  // Whether anything was filtered out for this reader. A reviewer who sees
  // eight answers should know when there were nine.
  const version = await repo.forms.getVersion(auth.ctx, submission.versionId);
  const fields = version ? await repo.forms.fields(auth.ctx, version.id) : [];
  const answered = new Set(answers.map((answer) => answer.fieldKey));
  const answersWithheld = fields.some(
    (field) => field.sensitivity === "special_category" && !answered.has(field.key),
  );

  return {
    ok: true,
    detail: { submission, answers, consent, projection, answersWithheld },
  };
}

export interface ApplyActionResult extends ActionResult {
  applied?: { summary: string }[];
  skipped?: { summary: string; reason: string }[];
}

/**
 * Apply the changes a reviewer accepted.
 *
 * Takes explicit mapping ids. A reviewer who approved four of six must get
 * four; an action that could only apply all or none would push them into
 * approving the two they did not want.
 */
export async function applySubmission(
  submissionId: string,
  acceptedMappingIds: string[],
): Promise<ApplyActionResult> {
  const auth = await authorise("forms:review");
  if (!auth.ok) return auth.result;

  const result = await applyProjection(
    auth.ctx,
    getRepository(),
    submissionId,
    acceptedMappingIds,
  );
  revalidatePath("/forms");
  return {
    ok: result.ok,
    message: result.message,
    applied: result.applied.map((entry) => ({ summary: entry.summary })),
    skipped: result.skipped,
  };
}

export async function rejectSubmission(
  submissionId: string,
  note: string,
): Promise<ActionResult> {
  const auth = await authorise("forms:review");
  if (!auth.ok) return auth.result;
  if (!note.trim()) {
    return { ok: false, message: "Say why. An unexplained rejection is not auditable." };
  }
  await getRepository().forms.reviewSubmission(auth.ctx, submissionId, "rejected", note);
  revalidatePath("/forms");
  return ok;
}

export interface PublishResult extends ActionResult {
  problems?: { code: string; message: string }[];
}

export async function publishForm(versionId: string): Promise<PublishResult> {
  const auth = await authorise("forms:manage");
  if (!auth.ok) return auth.result;

  const result = await getRepository().forms.publish(auth.ctx, versionId);
  revalidatePath("/forms");
  return result.ok
    ? ok
    : { ok: false, message: "This form cannot be published yet.", problems: result.problems };
}

export interface RetentionResult extends ActionResult {
  submissions?: number;
  answers?: number;
}

/**
 * Erase answers whose retention has expired.
 *
 * Exposed as an action for the same reason the scheduler is: there is no
 * background worker, and pretending otherwise would mean a retention policy
 * that quietly never runs. Idempotent — an already-erased answer is skipped.
 */
export async function runRetention(): Promise<RetentionResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  const result = await getRepository().forms.redactExpired(auth.ctx);
  revalidatePath("/forms");
  return { ...ok, ...result };
}
