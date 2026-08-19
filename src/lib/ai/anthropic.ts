import { appConfig } from "@/lib/config";
import { observeGrounding, refKey, type GroundingItem } from "@/lib/knowledge";
import {
  FEATURE_PROMPTS,
  PROMPT_VERSION,
  SHARED_POLICY,
  isFunderFacing,
  type AiFeature,
} from "./prompts";
import { offeredItems, type AiContext, type AiProvider, type AiResult } from "./types";

/**
 * Anthropic provider. Server-side only: reads ANTHROPIC_API_KEY from the
 * environment and calls the Messages API directly via fetch, so no key reaches
 * the browser and no extra SDK dependency is required.
 *
 * Provenance is **observed**, not assumed (audit S2). The model is required to
 * return the source ids it drew on through a tool schema, and any id it did not
 * receive causes the result to be rejected rather than persisted.
 */

/**
 * Model selection is per feature, not per provider.
 *
 * Most of what this product knows is computed, not generated, so the model's
 * job is usually to phrase facts it was handed. That is a small-model task. The
 * exception is the two features whose output a funder reads, which use the
 * higher tier — see `isFunderFacing`.
 */
function modelFor(feature: AiFeature): string {
  return isFunderFacing(feature)
    ? appConfig.ai.fundingFacingModel
    : appConfig.ai.routineModel;
}

// Was 1024 (audit S6), which truncates a report section mid-sentence. 16k is the
// safe ceiling for a non-streaming request: larger outputs risk an HTTP timeout
// and should stream instead.
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

/**
 * Untrusted content is passed as delimited data, never concatenated into the
 * instruction channel. Evidence text is human-entered today; document ingestion
 * will make it genuinely untrusted, and the boundary needs to exist first.
 */
function renderContext(context: AiContext): string {
  const lines: string[] = [`Organisation: ${context.organisationName}`];

  const section = (title: string, items: GroundingItem[]) => {
    if (!items.length) return;
    lines.push(`\n${title}:`);
    items.forEach((item) => lines.push(`- [${refKey(item.ref)}] ${item.label}: ${item.value}`));
  };

  section("Approved organisation profile", context.profileFields);
  section("Programme and indicator data", context.programmeData);
  section("Selected evidence", context.evidence);

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

const GROUNDING_INSTRUCTION = `
Each grounding item above is prefixed with an id in square brackets, e.g. [evidence:ev-3].
You must return your answer through the \`submit_generation\` tool.
In \`sources_used\`, list ONLY the ids whose content you actually drew on.
Do not list an id you did not use, and never invent an id that does not appear above.
If you could not establish something, say so in \`could_not_verify\` rather than filling the gap.
`.trim();

/**
 * `strict: true` makes the API guarantee the returned input validates against
 * this schema, which matters here more than in a typical tool: `sources_used`
 * is the input to `observeGrounding`, and a malformed or missing array would
 * mean discarding a generation that was probably fine.
 *
 * Strict mode requires `additionalProperties: false` and every property listed
 * in `required`, so the two optional-feeling fields are required and simply
 * come back empty when there is nothing to report.
 */
const OUTPUT_TOOL = {
  name: "submit_generation",
  description: "Return the generated text together with the grounding actually used.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      text: { type: "string", description: "The generated output." },
      sources_used: {
        type: "array",
        items: { type: "string" },
        description: "Ids of grounding items actually drawn on. Empty if none.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Assumptions made. Empty if none.",
      },
      could_not_verify: {
        type: "array",
        items: { type: "string" },
        description: "What could not be established from the data. Empty if none.",
      },
    },
    required: ["text", "sources_used", "assumptions", "could_not_verify"],
    additionalProperties: false,
  },
};

interface ToolResult {
  text: string;
  sources_used: string[];
  assumptions?: string[];
  could_not_verify?: string[];
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(private apiKey: string) {}

  private async call(model: string, system: string, userMessage: string): Promise<ToolResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system,
            tools: [OUTPUT_TOOL],
            tool_choice: { type: "tool", name: OUTPUT_TOOL.name },
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const error = new Error(
            `Anthropic request failed (${response.status}): ${detail.slice(0, 200)}`,
          );
          // 4xx other than rate limiting will not succeed on retry.
          if (response.status < 500 && response.status !== 429) throw error;
          lastError = error;
          continue;
        }

        const data = (await response.json()) as {
          content?: { type: string; name?: string; input?: unknown }[];
        };
        const toolUse = (data.content ?? []).find(
          (b) => b.type === "tool_use" && b.name === OUTPUT_TOOL.name,
        );
        if (!toolUse?.input) {
          throw new Error("Anthropic response did not include the required structured output.");
        }
        return toolUse.input as ToolResult;
      } catch (error) {
        lastError = error as Error;
        if ((error as Error).name === "AbortError") {
          lastError = new Error(`Anthropic request timed out after ${TIMEOUT_MS}ms`);
        }
        if (attempt === MAX_ATTEMPTS) break;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error("Anthropic request failed");
  }

  async generate(feature: AiFeature, context: AiContext): Promise<AiResult> {
    const prompt = FEATURE_PROMPTS[feature];
    const system = `${SHARED_POLICY}\n\nTask: ${prompt.instruction}\n\n${GROUNDING_INSTRUCTION}`;

    const model = modelFor(feature);
    const result = await this.call(model, system, renderContext(context));

    // Throws GroundingViolationError on any id that was never offered. The
    // output is discarded rather than persisted with provenance we cannot
    // stand behind.
    const grounding = observeGrounding({
      offered: offeredItems(context),
      usedKeys: result.sources_used ?? [],
      assumptions: result.assumptions,
      couldNotVerify: result.could_not_verify,
    });

    return {
      text: (result.text ?? "").trim(),
      grounding,
      model,
      promptVersion: prompt.version ?? PROMPT_VERSION,
      usedFallback: false,
    };
  }
}
