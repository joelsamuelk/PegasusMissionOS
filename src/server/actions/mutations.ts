"use server";

import { revalidatePath } from "next/cache";
import type {
  GroundingRecord,
  ApplicationAnswer,
  EvidenceType,
  FundingOpportunity,
  ImpactReport,
} from "@/types/domain";
import { assessFit } from "@/lib/logic/fit";
import { getRepository } from "@/server/data";
import { authorise, capabilityForTransition, ok, type ActionResult } from "./authorise";

/**
 * Mutating server actions.
 *
 * Two independent protections apply to every action here:
 *
 * 1. **Authorisation** — the acting role must hold the capability. Enforced by
 *    `authorise()`, which returns a refusal rather than failing silently.
 * 2. **Tenant scoping** — the repository resolves ids within the context
 *    organisation only, so a valid id belonging to another tenant simply does
 *    not resolve.
 *
 * Neither substitutes for the other: authorisation says whether this role may
 * do this at all, scoping says which records it can reach.
 */

/** Save an answer draft (e.g. after approving an AI candidate or manual edit). */
export async function saveAnswer(
  answerId: string,
  draft: string,
  provenance?: GroundingRecord,
): Promise<ActionResult> {
  const auth = await authorise("applications:manage");
  if (!auth.ok) return auth.result;

  const repo = getRepository();
  await repo.applications.saveAnswer(auth.ctx, answerId, draft, provenance);
  const answer = await repo.applications.getAnswer(auth.ctx, answerId);
  if (answer) revalidatePath(`/applications/${answer.applicationId}`);
  return ok;
}

/**
 * Move an answer through its review states.
 *
 * Approving is gated separately from editing so a trustee reviewer — who may
 * approve but must not rewrite — is handled correctly by the capability model
 * rather than by convention.
 */
export async function setAnswerStatus(
  answerId: string,
  status: ApplicationAnswer["status"],
): Promise<ActionResult> {
  const auth = await authorise(
    capabilityForTransition(
      status === "approved",
      "applications:manage",
      "applications:approve",
    ),
  );
  if (!auth.ok) return auth.result;

  const repo = getRepository();
  await repo.applications.setAnswerStatus(auth.ctx, answerId, status);
  const answer = await repo.applications.getAnswer(auth.ctx, answerId);
  if (answer) revalidatePath(`/applications/${answer.applicationId}`);
  return ok;
}

export async function updateIndicator(
  indicatorId: string,
  value: number,
  note?: string,
): Promise<ActionResult> {
  const auth = await authorise("outcomes:manage");
  if (!auth.ok) return auth.result;

  await getRepository().programmes.updateIndicator(auth.ctx, indicatorId, value, note);
  revalidatePath("/programmes");
  revalidatePath("/impact");
  return ok;
}

export async function moveOpportunityStage(
  oppId: string,
  stage: FundingOpportunity["stage"],
): Promise<ActionResult> {
  const auth = await authorise("funding:manage");
  if (!auth.ok) return auth.result;

  await getRepository().funding.moveStage(auth.ctx, oppId, stage);
  revalidatePath("/funding");
  revalidatePath(`/funding/${oppId}`);
  return ok;
}

export async function toggleSavedOpportunity(oppId: string): Promise<ActionResult> {
  const auth = await authorise("funding:manage");
  if (!auth.ok) return auth.result;

  await getRepository().funding.toggleSaved(auth.ctx, oppId);
  revalidatePath("/funding");
  return ok;
}

/** Generate and persist a fit assessment for an opportunity. */
export async function generateFitAssessment(oppId: string): Promise<ActionResult> {
  const auth = await authorise("funding:manage");
  if (!auth.ok) return auth.result;

  const { ctx } = auth;
  const repo = getRepository();

  const [opportunity, organisation, profile, evidence] = await Promise.all([
    repo.funding.getOpportunity(ctx, oppId),
    repo.organisations.get(ctx),
    repo.organisations.profile(ctx),
    repo.evidence.list(ctx),
  ]);
  if (!opportunity || !organisation || !profile) {
    return { ok: false, message: "That opportunity could not be found." };
  }

  // Deterministic scoring: unchanged, and deliberately not delegated to a model.
  const result = assessFit({
    opportunity,
    organisation,
    profile,
    evidenceCount: evidence.length,
  });

  await repo.funding.saveFitAssessment(ctx, {
    ...result,
    id: `fit-${oppId}`,
    generatedAt: ctx.now().toISOString(),
  });
  revalidatePath(`/funding/${oppId}`);
  return ok;
}

export interface ConvertToGrantResult extends ActionResult {
  grantId?: string;
}

export async function convertApplicationToGrant(
  applicationId: string,
): Promise<ConvertToGrantResult> {
  const auth = await authorise("grants:manage");
  if (!auth.ok) return auth.result;

  const grantId = await getRepository().applications.convertToGrant(auth.ctx, applicationId);
  if (!grantId) {
    return { ok: false, message: "That application could not be converted into a grant." };
  }
  revalidatePath("/grants");
  revalidatePath("/applications");
  return { ok: true, grantId };
}

export async function saveReportSection(
  reportId: string,
  sectionKey: string,
  content: string,
  provenance?: GroundingRecord,
): Promise<ActionResult> {
  const auth = await authorise("reports:manage");
  if (!auth.ok) return auth.result;

  await getRepository().reports.saveSection(
    auth.ctx,
    reportId,
    sectionKey,
    content,
    provenance,
  );
  revalidatePath(`/impact/${reportId}`);
  return ok;
}

/**
 * Move a report through its states.
 *
 * The approval transition is the one a trustee is expected to make, and the
 * only one they may: `trustee_reviewer` holds `reports:approve` without
 * `reports:manage`.
 */
export async function setReportStatus(
  reportId: string,
  status: ImpactReport["status"],
): Promise<ActionResult> {
  const auth = await authorise(
    capabilityForTransition(status === "approved", "reports:manage", "reports:approve"),
  );
  if (!auth.ok) return auth.result;

  await getRepository().reports.setStatus(auth.ctx, reportId, status);
  revalidatePath(`/impact/${reportId}`);
  revalidatePath("/impact");
  return ok;
}

/**
 * Toggle a task.
 *
 * Gated on `read` deliberately: completing a task on your own list is available
 * to every member, including trustees and contributors. The gate exists so the
 * action is not an unauthenticated hole once auth lands, not to restrict roles.
 */
export async function toggleTask(taskId: string): Promise<ActionResult> {
  const auth = await authorise("read");
  if (!auth.ok) return auth.result;

  await getRepository().workspace.toggleTask(auth.ctx, taskId);
  revalidatePath("/dashboard");
  return ok;
}

export async function setAiEnabled(enabled: boolean): Promise<ActionResult> {
  const auth = await authorise("org:manage_settings");
  if (!auth.ok) return auth.result;

  await getRepository().organisations.setAiEnabled(auth.ctx, enabled);
  revalidatePath("/settings");
  return ok;
}

export async function addEvidence(input: {
  title: string;
  type: EvidenceType;
  description: string;
  tags: string[];
}): Promise<ActionResult> {
  const auth = await authorise("evidence:manage");
  if (!auth.ok) return auth.result;

  await getRepository().evidence.add(auth.ctx, {
    title: input.title,
    type: input.type,
    description: input.description,
    verification: "provided",
    tags: input.tags,
  });
  revalidatePath("/evidence");
  return ok;
}
