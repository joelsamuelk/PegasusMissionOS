"use server";

import { runAi, type AiFeature } from "@/lib/ai";
import { refKey } from "@/lib/knowledge";
import type { GroundingRecord } from "@/types/domain";
import type { AiResult } from "@/lib/ai";
import { getRepository } from "@/server/data";
import { authoriseAi } from "./authorise";
import {
  buildAnswerContext,
  buildCommandContext,
  buildPipelineContext,
  buildReportSectionContext,
} from "@/server/services/context";

/**
 * Every entry point here is gated on `ai:use`.
 *
 * That capability is deliberately absent from `trustee_reviewer`: a trustee
 * reviews and approves what the organisation produced, and generating new
 * material on the organisation's behalf is not part of that role.
 */
export interface AiActionResult {
  ok: boolean;
  text: string;
  provenance?: GroundingRecord;
  model?: string;
  /** Surfaced so the UI never presents fallback output as live generation. */
  usedFallback?: boolean;
  error?: string;
}

/**
 * Turn an AI result into the record that gets persisted alongside the output.
 *
 * Everything here is observed: `used` contains only references the generation
 * reported and that were validated against what it was offered. Execution
 * metadata travels with it, so a section can always answer which model and
 * prompt version produced it, and whether it was live or fallback.
 */
function groundingRecord(result: AiResult, at: Date): GroundingRecord {
  return {
    used: result.grounding.used,
    unused: result.grounding.unused,
    assumptions: result.grounding.assumptions,
    couldNotVerify: result.grounding.couldNotVerify,
    model: result.model,
    promptVersion: result.promptVersion,
    usedFallback: result.usedFallback,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    generatedAt: at.toISOString(),
  };
}

/** Generate or transform an application answer. Returns a candidate to review. */
export async function generateAnswer(
  answerId: string,
  feature: AiFeature,
): Promise<AiActionResult> {
  try {
    const auth = await authoriseAi();
    if (!auth.ok) return { ok: false, text: "", error: auth.result.message };
    const { ctx } = auth;
    const repo = getRepository();
    const context = await buildAnswerContext(ctx, repo, answerId);
    const result = await runAi(feature, context);
    const provenance = groundingRecord(result, ctx.now());

    await repo.audit.recordAiGeneration(ctx, {
      feature,
      model: result.model,
      promptVersion: result.promptVersion,
      // The references actually drawn on, not everything that was available.
      inputRefs: [`application_answer:${answerId}`, ...provenance.used.map(refKey)],
      outputPreview: result.text.slice(0, 200),
      approvalStatus: "pending",
    });

    return {
      ok: true,
      text: result.text,
      provenance,
      model: result.model,
      usedFallback: result.usedFallback,
    };
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
    const auth = await authoriseAi();
    if (!auth.ok) return { ok: false, text: "", error: auth.result.message };
    const { ctx } = auth;
    const repo = getRepository();
    const context = await buildReportSectionContext(ctx, repo, reportId, sectionKey);
    const result = await runAi("report_section", context);
    const provenance = groundingRecord(result, ctx.now());

    await repo.audit.recordAiGeneration(ctx, {
      feature: "report_section",
      model: result.model,
      promptVersion: result.promptVersion,
      inputRefs: [`impact_report:${reportId}`, sectionKey, ...provenance.used.map(refKey)],
      outputPreview: result.text.slice(0, 200),
      approvalStatus: "pending",
    });

    // Record where each claim was used, so the figure can be traced back from
    // the report as well as forward from the claim.
    await Promise.all(
      provenance.used
        .filter((ref) => ref.type === "claim")
        .map((ref) =>
          repo.claims.recordUsage(ctx, {
            claimId: ref.id,
            usedIn: { type: "impact_report", id: reportId },
            context: `report section: ${sectionKey}`,
          }),
        ),
    );

    return {
      ok: true,
      text: result.text,
      provenance,
      model: result.model,
      usedFallback: result.usedFallback,
    };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}

/** Answer a command-bar question using approved organisation data. */
export async function askCommand(query: string): Promise<AiActionResult> {
  try {
    const auth = await authoriseAi();
    if (!auth.ok) return { ok: false, text: "", error: auth.result.message };
    const { ctx } = auth;
    const repo = getRepository();
    const context = await buildCommandContext(ctx, repo, query);
    const result = await runAi("command", context);
    const provenance = groundingRecord(result, ctx.now());

    await repo.audit.recordAiGeneration(ctx, {
      feature: "command",
      model: result.model,
      promptVersion: result.promptVersion,
      inputRefs: provenance.used.map(refKey),
      outputPreview: result.text.slice(0, 200),
      // A read-only answer is still an AI generation awaiting human judgement.
      // It is not "approved" simply because nobody had to click anything.
      approvalStatus: "pending",
    });

    return {
      ok: true,
      text: result.text,
      provenance,
      model: result.model,
      usedFallback: result.usedFallback,
    };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}

/** Summarise the funding pipeline. */
export async function summarisePipeline(): Promise<AiActionResult> {
  try {
    const auth = await authoriseAi();
    if (!auth.ok) return { ok: false, text: "", error: auth.result.message };
    const { ctx } = auth;
    const repo = getRepository();
    const context = await buildPipelineContext(ctx, repo);
    const result = await runAi("summarise_pipeline", context);
    return {
      ok: true,
      text: result.text,
      provenance: groundingRecord(result, ctx.now()),
      model: result.model,
      usedFallback: result.usedFallback,
    };
  } catch (error) {
    return { ok: false, text: "", error: (error as Error).message };
  }
}
