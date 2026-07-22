import { resolveAiProvider } from "@/lib/config";
import { AnthropicAiProvider } from "./anthropic";
import { MockAiProvider } from "./mock";
import type { AiFeature } from "./prompts";
import type { AiContext, AiProvider, AiResult } from "./types";

export type { AiContext, AiResult } from "./types";
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
 * Run an AI task. On any provider failure the mock provider is used so the
 * product experience never breaks, and the failure is surfaced in the result
 * model name for transparency.
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
        model: `${fallback.model} (fell back from ${provider.name}: ${(error as Error).message.slice(0, 80)})`,
      };
    }
    throw error;
  }
}
