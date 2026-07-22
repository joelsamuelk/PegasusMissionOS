"use server";

import { runAi, type AiFeature } from "@/lib/ai";
import type { AIProvenance } from "@/types/domain";
import { CURRENT_USER_ID, recordAiGeneration } from "@/features/store";
import {
  buildAnswerContext,
  buildCommandContext,
  buildPipelineContext,
  buildReportSectionContext,
} from "@/server/services/context";

export interface AiActionResult {
  ok: boolean;
  text: string;
  provenance?: AIProvenance;
  model?: string;
  error?: string;
}

/** Generate or transform an application answer. Returns a candidate to review. */
export async function generateAnswer(
  answerId: string,
  feature: AiFeature,
): Promise<AiActionResult> {
  try {
    const context = buildAnswerContext(answerId);
    const result = await runAi(feature, context);
    recordAiGeneration({
      feature,
      model: result.model,
      promptVersion: result.promptVersion,
      userId: CURRENT_USER_ID,
      inputRefs: [answerId],
      outputPreview: result.text.slice(0, 200),
      approvalStatus: "pending",
    });
    return { ok: true, text: result.text, provenance: result.provenance, model: result.model };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}

/** Generate a draft for an impact report section. Returns a candidate to review. */
export async function generateReportSection(
  reportId: string,
  sectionKey: string,
): Promise<AiActionResult> {
  try {
    const context = buildReportSectionContext(reportId, sectionKey);
    const result = await runAi("report_section", context);
    recordAiGeneration({
      feature: "report_section",
      model: result.model,
      promptVersion: result.promptVersion,
      userId: CURRENT_USER_ID,
      inputRefs: [reportId, sectionKey],
      outputPreview: result.text.slice(0, 200),
      approvalStatus: "pending",
    });
    return { ok: true, text: result.text, provenance: result.provenance, model: result.model };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}

/** Answer a command-bar question using approved organisation data. */
export async function askCommand(query: string): Promise<AiActionResult> {
  try {
    const context = buildCommandContext(query);
    const result = await runAi("command", context);
    recordAiGeneration({
      feature: "command",
      model: result.model,
      promptVersion: result.promptVersion,
      userId: CURRENT_USER_ID,
      inputRefs: [],
      outputPreview: result.text.slice(0, 200),
      approvalStatus: "approved",
    });
    return { ok: true, text: result.text, provenance: result.provenance, model: result.model };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}

/** Summarise the funding pipeline. */
export async function summarisePipeline(): Promise<AiActionResult> {
  try {
    const context = buildPipelineContext();
    const result = await runAi("summarise_pipeline", context);
    return { ok: true, text: result.text, provenance: result.provenance, model: result.model };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}
