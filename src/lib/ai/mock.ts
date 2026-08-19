import { itemsMentionedIn, observeGrounding } from "@/lib/knowledge";
import { countWords } from "@/lib/utils";
import { FEATURE_PROMPTS, PROMPT_VERSION, type AiFeature } from "./prompts";
import { offeredItems, type AiContext, type AiProvider, type AiResult } from "./types";

/**
 * Deterministic mock AI provider.
 *
 * Produces grounded, useful drafts by composing the structured context passed
 * in. It never introduces figures or claims absent from that context, which
 * mirrors the policy the live provider is instructed to follow.
 *
 * Because it composes its output from known values, it can report **observed**
 * grounding: the references it reports are the ones whose content actually
 * reached the text. That makes the mock the reference implementation of honest
 * provenance, and lets the whole S2 contract be tested with no network and no
 * key.
 */

function shortenToWords(text: string, limit?: number): string {
  if (!limit || countWords(text) <= limit) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const out: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const w = countWords(s);
    if (count + w > limit) break;
    out.push(s.trim());
    count += w;
  }
  if (out.length === 0) {
    return text.split(/\s+/).slice(0, limit).join(" ") + "...";
  }
  return out.join(" ");
}

function field(context: AiContext, label: string): string | undefined {
  return context.profileFields.find((f) => f.label === label)?.value;
}

function draftAnswer(context: AiContext): string {
  const mission = field(context, "Mission statement");
  const communities = field(context, "Communities served");
  const activities = field(context, "Core activities");
  const evidenceLine =
    context.evidence.length > 0
      ? ` This is supported by ${context.evidence.map((e) => e.label.toLowerCase()).join(" and ")}.`
      : " Supporting evidence has not yet been selected for this answer.";

  const parts: string[] = [];
  if (context.question) {
    parts.push(
      `${context.organisationName} responds to this question from its core work. ${mission ?? ""}`.trim(),
    );
  }
  if (communities) {
    parts.push(`We work with ${communities.toLowerCase()}.`);
  }
  if (activities) {
    parts.push(`Our activities include ${activities.toLowerCase()}.`);
  }
  context.programmeData.slice(0, 3).forEach((d) => parts.push(`${d.label}: ${d.value}.`));
  parts.push(evidenceLine.trim());

  return shortenToWords(parts.filter(Boolean).join(" "), context.wordLimit);
}

function improveClarity(context: AiContext): string {
  const draft = context.draft ?? "";
  const sentences = (draft.match(/[^.!?]+[.!?]+/g) ?? [draft])
    .map((s) => s.trim())
    .filter(Boolean);
  return shortenToWords(sentences.join(" "), context.wordLimit);
}

function makeSpecific(context: AiContext): string {
  const draft = context.draft ?? "";
  const figures = [...context.programmeData, ...context.evidence].slice(0, 3);
  const addition =
    figures.length > 0
      ? " Specifically: " + figures.map((f) => `${f.label} (${f.value})`).join("; ") + "."
      : " No additional figures are available in the current context to add specificity.";
  return shortenToWords(draft + addition, context.wordLimit);
}

function strengthenEvidence(context: AiContext): string {
  const draft = context.draft ?? "";
  if (context.evidence.length === 0) {
    return draft + " No evidence has been selected. Add evidence to strengthen this answer.";
  }
  const evidenceSentence =
    " Our approach is evidenced by " +
    context.evidence.map((e) => `${e.label} (${e.value})`).join(", ") +
    ".";
  return shortenToWords(draft + evidenceSentence, context.wordLimit);
}

function reviewCriteria(context: AiContext): string {
  const draft = context.draft ?? "";
  const wc = countWords(draft);
  const lines: string[] = ["Review against funder guidance:"];
  if (context.wordLimit) {
    lines.push(
      wc <= context.wordLimit
        ? `- Length: within the ${context.wordLimit} word limit (${wc} words).`
        : `- Length: over the ${context.wordLimit} word limit (${wc} words). Shorten before submitting.`,
    );
  }
  if (context.priorityThemes && context.priorityThemes.length > 0) {
    const missing = context.priorityThemes.filter(
      (t) => !draft.toLowerCase().includes(t.toLowerCase().split(" ")[0] ?? t.toLowerCase()),
    );
    lines.push(
      missing.length === 0
        ? "- Themes: all funder priority themes appear to be addressed."
        : `- Themes: consider addressing ${missing.join(", ")}.`,
    );
  }
  lines.push(
    context.evidence.length > 0
      ? "- Evidence: the answer references supporting evidence."
      : "- Evidence: no evidence is linked. Add evidence to make the answer credible.",
  );
  lines.push("- Suggestion: confirm all figures against your records before submission.");
  return lines.join("\n");
}

function reportSection(context: AiContext): string {
  const title = context.sectionTitle ?? "Section";
  const key = context.sectionKey ?? "";
  const org = context.organisationName;
  const data = context.programmeData;
  const evidence = context.evidence;

  const dataLine = data.length ? data.map((d) => `${d.label}: ${d.value}`).join(". ") + "." : "";

  switch (key) {
    case "executive_summary":
      return shortenToWords(
        `This report covers ${org}'s delivery for the period. ${dataLine} ${
          evidence.length
            ? `The findings draw on ${evidence.map((e) => e.label.toLowerCase()).join(", ")}.`
            : "Supporting evidence should be added before this report is shared."
        }`.trim(),
        context.wordLimit,
      );
    case "outcomes":
      return data.length
        ? `Progress against outcome indicators:\n${data.map((d) => `- ${d.label}: ${d.value}`).join("\n")}\n\nWhere a target has not yet been reached, delivery continues. No outcome is reported beyond what the indicator data shows.`
        : "No indicator data has been selected for this report. Add indicators to report outcomes.";
    case "outputs":
      return data.length
        ? `Outputs delivered in the period:\n${data.map((d) => `- ${d.label}: ${d.value}`).join("\n")}`
        : "No output data has been selected for this report.";
    case "beneficiary_stories":
      return evidence.some(
        (e) =>
          e.value.toLowerCase().includes("quote") ||
          e.value.toLowerCase().includes("testimonial") ||
          e.label.toLowerCase().includes("testimonial") ||
          e.label.toLowerCase().includes("case"),
      )
        ? `The following approved qualitative evidence illustrates the difference made:\n${evidence.map((e) => `- ${e.label}: ${e.value}`).join("\n")}`
        : "No approved beneficiary stories or testimonials have been added for this period. Add qualitative evidence to include stories here. No quotes have been invented.";
    default:
      return shortenToWords(
        `${title} for ${org}. ${dataLine} ${
          evidence.length
            ? `Supporting evidence: ${evidence.map((e) => e.label).join(", ")}.`
            : "Supporting evidence has not yet been added for this section."
        }`.trim(),
        context.wordLimit,
      );
  }
}

function summarisePipeline(context: AiContext): string {
  return context.programmeData.map((d) => `- ${d.label}: ${d.value}`).join("\n");
}

function command(context: AiContext): string {
  const query = (context.query ?? "").toLowerCase();
  const facts = context.programmeData;
  const find = (needle: string) =>
    facts.filter(
      (f) => f.label.toLowerCase().includes(needle) || f.value.toLowerCase().includes(needle),
    );

  if (query.includes("deadline")) {
    const deadlines = find("deadline").concat(find("due"));
    return deadlines.length
      ? "Approaching deadlines:\n" + deadlines.map((d) => `- ${d.label}: ${d.value}`).join("\n")
      : "I could not find upcoming deadlines in the current data.";
  }
  if (query.includes("pipeline") || query.includes("funding")) {
    return facts.length
      ? "Funding pipeline summary:\n" + facts.map((d) => `- ${d.label}: ${d.value}`).join("\n")
      : "There is no pipeline data available.";
  }
  if (query.includes("evidence") || query.includes("missing")) {
    return facts.length
      ? facts.map((d) => `- ${d.label}: ${d.value}`).join("\n")
      : "I could not find gaps in the current data.";
  }
  if (query.includes("behind") || query.includes("report")) {
    return facts.length
      ? "Reporting status:\n" + facts.map((d) => `- ${d.label}: ${d.value}`).join("\n")
      : "No reporting risks were found.";
  }
  return facts.length
    ? "Here is what I can see in your approved data:\n" +
        facts.map((d) => `- ${d.label}: ${d.value}`).join("\n") +
        "\n\nAsk about deadlines, pipeline, evidence, or reporting for more detail."
    : "I can answer using your organisation's approved data. Try asking about deadlines, your funding pipeline, or missing evidence.";
}

const GENERATORS: Record<AiFeature, (c: AiContext) => string> = {
  draft_answer: draftAnswer,
  improve_clarity: improveClarity,
  make_specific: makeSpecific,
  strengthen_evidence: strengthenEvidence,
  shorten: (c) => shortenToWords(c.draft ?? "", c.wordLimit),
  review_criteria: reviewCriteria,
  report_section: reportSection,
  summarise_pipeline: summarisePipeline,
  command: command,
};

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async generate(feature: AiFeature, context: AiContext): Promise<AiResult> {
    const text = GENERATORS[feature](context);
    const offered = offeredItems(context);

    // Observation, not assertion: the references reported are the ones whose
    // content actually reached the output. A value dropped by the word limit is
    // correctly reported as unused.
    const usedKeys = itemsMentionedIn(text, offered);

    return {
      text,
      grounding: observeGrounding({
        offered,
        usedKeys,
        assumptions: [
          "This is a first draft. Confirm every figure and claim before submitting.",
        ],
      }),
      model: "pegasus-mock-1",
      promptVersion: FEATURE_PROMPTS[feature]?.version ?? PROMPT_VERSION,
      usedFallback: false,
    };
  }
}
