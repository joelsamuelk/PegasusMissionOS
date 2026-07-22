"use server";

import { revalidatePath } from "next/cache";
import type { AIProvenance, EvidenceType } from "@/types/domain";
import { mutate, q } from "@/features/store";
import { assessFit } from "@/lib/logic/fit";

/** Save an answer draft (e.g. after approving an AI candidate or manual edit). */
export async function saveAnswer(
  answerId: string,
  draft: string,
  provenance?: AIProvenance,
) {
  mutate.saveAnswer(answerId, draft, provenance);
  const answer = q.answer(answerId);
  if (answer) revalidatePath(`/applications/${answer.applicationId}`);
}

export async function setAnswerStatus(
  answerId: string,
  status: Parameters<typeof mutate.setAnswerStatus>[1],
) {
  mutate.setAnswerStatus(answerId, status);
  const answer = q.answer(answerId);
  if (answer) revalidatePath(`/applications/${answer.applicationId}`);
}

export async function updateIndicator(
  indicatorId: string,
  value: number,
  note?: string,
) {
  mutate.updateIndicator(indicatorId, value, note);
  revalidatePath("/programmes");
  revalidatePath("/impact");
}

export async function moveOpportunityStage(
  oppId: string,
  stage: Parameters<typeof mutate.moveOpportunityStage>[1],
) {
  mutate.moveOpportunityStage(oppId, stage);
  revalidatePath("/funding");
  revalidatePath(`/funding/${oppId}`);
}

export async function toggleSavedOpportunity(oppId: string) {
  mutate.toggleSaved(oppId);
  revalidatePath("/funding");
}

/** Generate and persist a fit assessment for an opportunity. */
export async function generateFitAssessment(oppId: string) {
  const opportunity = q.opportunity(oppId);
  if (!opportunity) return;
  const result = assessFit({
    opportunity,
    organisation: q.organisation(),
    profile: q.profile(),
    evidenceCount: q.evidence().length,
  });
  mutate.saveFitAssessment({
    ...result,
    id: `fit-${oppId}`,
    generatedAt: "2026-07-21T10:00:00Z",
  });
  revalidatePath(`/funding/${oppId}`);
}

export async function convertApplicationToGrant(applicationId: string) {
  const grantId = mutate.convertApplicationToGrant(applicationId);
  revalidatePath("/grants");
  revalidatePath("/applications");
  return grantId;
}

export async function saveReportSection(
  reportId: string,
  sectionKey: string,
  content: string,
  provenance?: AIProvenance,
) {
  mutate.saveReportSection(reportId, sectionKey, content, provenance);
  revalidatePath(`/impact/${reportId}`);
}

export async function setReportStatus(
  reportId: string,
  status: Parameters<typeof mutate.setReportStatus>[1],
) {
  mutate.setReportStatus(reportId, status);
  revalidatePath(`/impact/${reportId}`);
  revalidatePath("/impact");
}

export async function toggleTask(taskId: string) {
  mutate.toggleTask(taskId);
  revalidatePath("/dashboard");
}

export async function setAiEnabled(enabled: boolean) {
  mutate.setAiEnabled(enabled);
  revalidatePath("/settings");
}

export async function addEvidence(input: {
  title: string;
  type: EvidenceType;
  description: string;
  tags: string[];
}) {
  mutate.addEvidence({
    title: input.title,
    type: input.type,
    description: input.description,
    verification: "provided",
    tags: input.tags,
  });
  revalidatePath("/evidence");
}
