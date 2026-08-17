import { resolveAiProvider } from "@/lib/config";
import { AnthropicAiProvider } from "./anthropic";
import { MockAiProvider } from "./mock";
import type { AiFeature } from "./prompts";
import type { AiContext, AiProvider, AiResult } from "./types";

export type { AiContext, AiResult } from "./types";
export { offeredItems } from "./types";
export type { AiFeature } from "./prompts";
export { FEATURE_LABELS, FEATURE_PROMPTS } from "./prompts";

/**
 * Resolve the active provider. Falls back to the deterministic mock whenever
 * Anthropic is not configured. All AI calls go through here, server-side only.
 */
export function getAiProvider(): AiProvider {
  if (resolveAiProvider() === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) return new AnthropicAiProvider(key);
  }
  return new MockAiProvider();
}

/**
 * Run an AI task.
 *
 * On any provider failure the deterministic mock answers, so the product never
 * breaks. The fallback is reported as **structured metadata** — `usedFallback`
 * plus `fallbackReason` — rather than as a suffix appended to the model string
 * (audit S7). A suffix is not something a UI can reliably branch on, and the
 * requirement is that mock output is never displayed as live generation.
 *
 * A `GroundingViolationError` reaches here like any other failure: a provider
 * that fabricated a source id has produced output whose provenance cannot be
 * trusted, so that output is discarded and the mock answers instead.
 */
export async function runAi(feature: AiFeature, context: AiContext): Promise<AiResult> {
  const provider = getAiProvider();
  try {
    return await provider.generate(feature, context);
  } catch (error) {
    if (provider.name !== "mock") {
      const fallback = await new MockAiProvider().generate(feature, context);
      return {
        ...fallback,
        usedFallback: true,
        fallbackReason: `${provider.name} failed: ${(error as Error).message.slice(0, 160)}`,
      };
    }
    throw error;
  }
}
