import { ZodError } from "zod";
import { callAnthropicTool } from "@/lib/ai/anthropic";
import { PROCESS_ANALYSIS_PROMPT, SHARED_POLICY } from "@/lib/ai/prompts";
import { appConfig, resolveAiProvider } from "@/lib/config";
import {
  ANALYSIS_TOOL,
  buildAnalysis,
  renderSubmission,
  type AnalysisSubmission,
} from "@/lib/process-intelligence";
import { createAnonClient } from "@/server/data/supabase/client";

export type AnalysisOutcome =
  | { status: "complete"; analysisId: string }
  | { status: "skipped"; reason: "in_progress" | "reviewed" }
  | { status: "failed"; errorCode: string };

// A full decomposition is a few thousand output tokens on the high tier, which
// does not fit the 30s budget the short text features use.
const ANALYSIS_TIMEOUT_MS = 150_000;
const ANALYSIS_MAX_TOKENS = 12_000;

export function processAnalysisAvailable(): boolean {
  return resolveAiProvider() === "anthropic" && Boolean(process.env.ANTHROPIC_API_KEY);
}

function errorCode(error: unknown): string {
  if (error instanceof ZodError) return "invalid_model_output";
  const message = error instanceof Error ? error.message : "";
  if (message.includes("timed out")) return "provider_timeout";
  const status = message.match(/failed \((\d{3})\)/)?.[1];
  return status ? `provider_http_${status}` : "provider_error";
}

/**
 * Claim, analyse and record one submission.
 *
 * Every failure after the claim is written back as 'failed' with a code, so a
 * submission is never left looking busy and the operator can see why it
 * stopped. There is deliberately no mock fallback: an invented analysis of a
 * real client's process is worse than a visible failure.
 */
export async function analyseSubmission(
  submissionId: string,
  requestId: string,
): Promise<AnalysisOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!processAnalysisAvailable() || !apiKey)
    throw new Error(
      "Process analysis needs AI_PROVIDER=anthropic and ANTHROPIC_API_KEY to be set.",
    );
  const client = await createAnonClient();
  const { data: claim, error: claimError } = await client.rpc(
    "control_claim_process_analysis",
    { p_submission_id: submissionId, p_request_id: requestId },
  );
  if (claimError) throw new Error(claimError.message);
  if (!claim?.claimed) return { status: "skipped", reason: claim?.reason ?? "in_progress" };

  const row = claim.submission as Record<string, unknown>;
  const submission: AnalysisSubmission = {
    name: String(row.name),
    department: row.department ? String(row.department) : undefined,
    team: row.team ? String(row.team) : undefined,
    jobTitle: row.jobTitle ? String(row.jobTitle) : undefined,
    frequency: String(row.frequency),
    occurrencesPerYear: row.occurrencesPerYear ? Number(row.occurrencesPerYear) : undefined,
    durationMinutes: Number(row.durationMinutes),
    peopleCount: Number(row.peopleCount),
    annualHours: Number(row.annualHours),
    systems: (row.systems as string[]) ?? [],
    narrative: String(row.narrative ?? ""),
    friction: row.friction ? String(row.friction) : undefined,
    humanJudgement: row.humanJudgement ? String(row.humanJudgement) : undefined,
    sensitiveData: (row.sensitiveData as string[]) ?? [],
    magicRemoval: row.magicRemoval ? String(row.magicRemoval) : undefined,
  };

  try {
    const model = appConfig.ai.processAnalysisModel;
    const raw = await callAnthropicTool({
      apiKey,
      model,
      system: `${SHARED_POLICY}\n\n${PROCESS_ANALYSIS_PROMPT.instruction}`,
      userMessage: renderSubmission(submission),
      tool: ANALYSIS_TOOL,
      maxTokens: ANALYSIS_MAX_TOKENS,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    });
    const analysis = buildAnalysis(raw, submission, {
      provider: "anthropic",
      model,
      promptVersion: PROCESS_ANALYSIS_PROMPT.version,
    });
    const { data, error } = await client.rpc("control_record_process_analysis", {
      p_submission_id: submissionId,
      p_analysis: analysis,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return { status: "complete", analysisId: String(data) };
  } catch (error) {
    const code = errorCode(error);
    console.error("process analysis failed", { submissionId, code, error });
    await client.rpc("control_fail_process_analysis", {
      p_submission_id: submissionId,
      p_error_code: code,
      p_request_id: requestId,
    });
    return { status: "failed", errorCode: code };
  }
}
