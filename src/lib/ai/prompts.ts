/**
 * Central prompt and policy layer.
 *
 * All prompts live here rather than scattered through components. Each feature
 * has a versioned prompt so generations can be audited against the exact
 * instructions used. The shared policy is prepended to every request.
 */

export const PROMPT_VERSION = "2026-07-01";

/**
 * Shared policy. Encodes the product's trust rules: AI reduces admin work,
 * never fabricates, and clearly separates verified from inferred information.
 */
export const SHARED_POLICY = `You are Pegasus Intelligence, the assistant inside Pegasus Mission OS, an operating system for mission-driven organisations.

Rules you must always follow:
- Use only the organisation context and evidence provided to you. Never invent funders, statistics, outcomes, beneficiary quotes, or financial figures.
- If information is missing, say so plainly and suggest what the organisation could add. Do not fill gaps with plausible-sounding detail.
- Write in calm, direct UK English. Do not use em dashes. Avoid marketing language such as "supercharge", "unlock", "revolutionise", "game-changing", "effortless".
- Every output is a draft for a person to review and edit. Do not present suggestions as decisions.
- Distinguish verified information from inferred suggestions when it matters.`;

export type AiFeature =
  | "draft_answer"
  | "improve_clarity"
  | "make_specific"
  | "strengthen_evidence"
  | "shorten"
  | "review_criteria"
  | "report_section"
  | "summarise_pipeline"
  | "command";

export const FEATURE_LABELS: Record<AiFeature, string> = {
  draft_answer: "Create first draft",
  improve_clarity: "Improve clarity",
  make_specific: "Make more specific",
  strengthen_evidence: "Strengthen with evidence",
  shorten: "Shorten to word limit",
  review_criteria: "Review against funder criteria",
  report_section: "Generate report section",
  summarise_pipeline: "Summarise funding pipeline",
  command: "Answer a question",
};

/**
 * Which features produce text a funder will read.
 *
 * The distinction is about consequence, not difficulty. A command-bar answer is
 * read by one person who can immediately see whether it is wrong; a grant
 * answer or a report section goes to the body deciding whether to fund the
 * organisation. Only these two justify the more capable tier.
 *
 * The editing features are deliberately routine: they transform a draft a human
 * already wrote and will read again before it goes anywhere.
 */
export const FUNDER_FACING_FEATURES: ReadonlySet<AiFeature> = new Set([
  "draft_answer",
  "report_section",
]);

export function isFunderFacing(feature: AiFeature): boolean {
  return FUNDER_FACING_FEATURES.has(feature);
}

export interface FeaturePrompt {
  feature: AiFeature;
  version: string;
  instruction: string;
}

export const FEATURE_PROMPTS: Record<AiFeature, FeaturePrompt> = {
  draft_answer: {
    feature: "draft_answer",
    version: PROMPT_VERSION,
    instruction:
      "Draft a first response to the funder's question using the organisation profile and selected evidence. Stay within the word limit. Ground every claim in the provided context.",
  },
  improve_clarity: {
    feature: "improve_clarity",
    version: PROMPT_VERSION,
    instruction:
      "Rewrite the draft to be clearer and better structured, without changing its meaning or adding new claims.",
  },
  make_specific: {
    feature: "make_specific",
    version: PROMPT_VERSION,
    instruction:
      "Make the draft more specific using only figures and detail present in the provided context. Do not invent numbers.",
  },
  strengthen_evidence: {
    feature: "strengthen_evidence",
    version: PROMPT_VERSION,
    instruction:
      "Strengthen the draft by weaving in the selected evidence. Reference only evidence that has been provided.",
  },
  shorten: {
    feature: "shorten",
    version: PROMPT_VERSION,
    instruction: "Shorten the draft to fit within the word limit while keeping the key points.",
  },
  review_criteria: {
    feature: "review_criteria",
    version: PROMPT_VERSION,
    instruction:
      "Review the draft against the funder's guidance and priority themes. List what is strong, what is missing, and concrete suggestions. Do not rewrite.",
  },
  report_section: {
    feature: "report_section",
    version: PROMPT_VERSION,
    instruction:
      "Draft this impact report section using programme data, indicators and evidence. Do not claim impact that the data does not support. Where evidence is missing, note it.",
  },
  summarise_pipeline: {
    feature: "summarise_pipeline",
    version: PROMPT_VERSION,
    instruction: "Summarise the funding pipeline: value, stages, and what needs attention.",
  },
  command: {
    feature: "command",
    version: PROMPT_VERSION,
    instruction: "Answer the user's question using the organisation's approved data only.",
  },
};
