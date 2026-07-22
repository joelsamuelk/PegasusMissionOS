import { AIProvenance } from "@/types/domain";
import {
  FEATURE_PROMPTS,
  PROMPT_VERSION,
  SHARED_POLICY,
  type AiFeature,
} from "./prompts";
import type { AiContext, AiProvider, AiResult } from "./types";

/**
 * Anthropic provider. Server-side only: reads ANTHROPIC_API_KEY from the
 * environment and calls the Messages API directly via fetch, so no key is ever
 * exposed to the browser and no extra SDK dependency is required. Provenance is
 * built from the same structured context the mock uses, keeping the trust model
 * consistent across providers.
 */

const MODEL = "claude-sonnet-5";

function buildProvenance(context: AiContext): AIProvenance {
  return {
    profileFieldsUsed: context.profileFields.map((f) => f.label),
    documentsUsed: context.evidence.map((e) => e.title),
    programmeDataUsed: context.programmeData.map((d) => d.label),
    assumptions: ["This is a first draft. Confirm every figure and claim before submitting."],
    couldNotVerify:
      context.evidence.length === 0
        ? ["No specific evidence was selected for this generation."]
        : [],
  };
}

function renderContext(context: AiContext): string {
  const lines: string[] = [`Organisation: ${context.organisationName}`];
  if (context.profileFields.length) {
    lines.push("\nApproved organisation profile:");
    context.profileFields.forEach((f) => lines.push(`- ${f.label}: ${f.value}`));
  }
  if (context.programmeData.length) {
    lines.push("\nProgramme and indicator data:");
    context.programmeData.forEach((d) => lines.push(`- ${d.label}: ${d.value}`));
  }
  if (context.evidence.length) {
    lines.push("\nSelected evidence:");
    context.evidence.forEach((e) => lines.push(`- ${e.title}: ${e.summary}`));
  }
  if (context.question) lines.push(`\nFunder question: ${context.question}`);
  if (context.guidance) lines.push(`Funder guidance: ${context.guidance}`);
  if (context.priorityThemes?.length)
    lines.push(`Funder priority themes: ${context.priorityThemes.join(", ")}`);
  if (context.wordLimit) lines.push(`Word limit: ${context.wordLimit}`);
  if (context.sectionTitle) lines.push(`\nReport section: ${context.sectionTitle}`);
  if (context.draft) lines.push(`\nCurrent draft:\n${context.draft}`);
  if (context.query) lines.push(`\nUser question: ${context.query}`);
  return lines.join("\n");
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(private apiKey: string) {}

  async generate(feature: AiFeature, context: AiContext): Promise<AiResult> {
    const prompt = FEATURE_PROMPTS[feature];
    const system = `${SHARED_POLICY}\n\nTask: ${prompt.instruction}`;
    const userMessage = renderContext(context);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    return {
      text,
      provenance: buildProvenance(context),
      model: MODEL,
      promptVersion: prompt.version ?? PROMPT_VERSION,
    };
  }
}
