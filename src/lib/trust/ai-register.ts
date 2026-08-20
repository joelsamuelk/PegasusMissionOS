import { FEATURE_LABELS, type AiFeature } from "@/lib/ai";

/**
 * Where AI is used, enumerated.
 *
 * The brief's requirement is one sentence: *organisations should be able to
 * understand where AI is used.* A privacy policy saying "we may use AI to help
 * you write" does not meet it. This does, and the test beside it fails the
 * build if a feature is added without an entry — which is the only way a
 * register like this stays true.
 *
 * Every entry answers four questions an organisation actually asks:
 *
 * - **What does it see?** Named, from the context builder, not summarised.
 * - **What can it never see?** The more useful half, and the one nobody
 *   volunteers.
 * - **Can it change anything?** For all but one, no: the model returns text a
 *   person reads before it goes anywhere.
 * - **Does the workspace switch turn it off?** Yes, everywhere, and that is
 *   asserted rather than claimed.
 */

export type AiRisk = "low" | "moderate" | "consequential";

export interface AiUse {
  feature: AiFeature;
  label: string;
  /** Where in the product it happens, in words a user would recognise. */
  surface: string;
  /** What the model is given. Specific: a list of fields, not "your data". */
  sees: string[];
  /** What is never assembled for it. The half nobody volunteers. */
  neverSees: string[];
  /** What comes back, and what happens to it. */
  produces: string;
  /**
   * Whether the output can change a record without a person.
   *
   * False for every feature. The single case that comes closest —
   * `draft_communication` in an automation — creates a draft and a task, and
   * nothing in the product can send it.
   */
  writesWithoutReview: false;
  /**
   * How much a wrong answer costs.
   *
   * `consequential` means a funder reads it. That distinction already governs
   * model tier selection in `lib/config`, and it governs how hard a person
   * should look before accepting the output.
   */
  risk: AiRisk;
}

/**
 * Two things every entry below has in common, stated once rather than repeated.
 *
 * **Nothing personal reaches a model.** `FieldSensitivity` classifies every
 * form answer, `partitionForModel` filters on it, and transaction narratives
 * are excluded from grounding by default and gated on `finance:manage` even
 * when explicitly requested. The exclusion is a filter in the context builder,
 * not a redaction step somebody has to remember.
 *
 * **Nothing reaches a model that was not deliberately assembled.** There is no
 * method anywhere that hands a model a repository. Context is a named set of
 * scopes, each gated on a capability, and what was withheld is recorded on the
 * context snapshot.
 */
const UNIVERSAL_EXCLUSIONS = [
  "Personal and special category form answers, which are filtered before context is assembled rather than redacted afterwards",
  "Bank transaction descriptions, which routinely name individuals",
  "Any record in another organisation",
  "Any record the acting person's role cannot read",
];

export const AI_REGISTER: AiUse[] = [
  {
    feature: "draft_answer",
    label: FEATURE_LABELS.draft_answer,
    surface: "Writing an answer to a funder's application question",
    sees: [
      "The funder's question and its guidance",
      "The organisation's mission, communities served, core activities and geographic reach",
      "Evidence items the writer selected for that answer",
      "Up to four indicator values",
    ],
    neverSees: [...UNIVERSAL_EXCLUSIONS, "Finance records", "Other applications"],
    produces: "A draft in the editor. Nothing is submitted, and every figure needs checking.",
    writesWithoutReview: false,
    // A funder reads this and decides whether to fund the organisation.
    risk: "consequential",
  },
  {
    feature: "report_section",
    label: FEATURE_LABELS.report_section,
    surface: "Drafting a section of an impact or funder report",
    sees: [
      "The organisation's profile fields",
      "Indicators included in that report",
      "Evidence included in that report",
      "The section's title and key",
    ],
    neverSees: [...UNIVERSAL_EXCLUSIONS, "Evidence not included in the report"],
    produces:
      "A draft section, with the references it drew on recorded. A reference it was never offered is rejected and the output discarded.",
    writesWithoutReview: false,
    risk: "consequential",
  },
  {
    feature: "improve_clarity",
    label: FEATURE_LABELS.improve_clarity,
    surface: "Editing a draft the writer already wrote",
    sees: ["The draft itself", "The word limit"],
    neverSees: [...UNIVERSAL_EXCLUSIONS, "Anything the writer did not already have on screen"],
    produces: "A rewritten draft, replacing nothing until the writer accepts it.",
    writesWithoutReview: false,
    risk: "low",
  },
  {
    feature: "make_specific",
    label: FEATURE_LABELS.make_specific,
    surface: "Editing a draft the writer already wrote",
    sees: ["The draft", "Indicator values and evidence already in context"],
    neverSees: UNIVERSAL_EXCLUSIONS,
    produces: "A draft with figures added from context. It is instructed to invent none.",
    writesWithoutReview: false,
    risk: "moderate",
  },
  {
    feature: "strengthen_evidence",
    label: FEATURE_LABELS.strengthen_evidence,
    surface: "Editing a draft the writer already wrote",
    sees: ["The draft", "Evidence selected for that answer"],
    neverSees: UNIVERSAL_EXCLUSIONS,
    produces: "A draft citing the selected evidence, or a note that none was selected.",
    writesWithoutReview: false,
    risk: "moderate",
  },
  {
    feature: "shorten",
    label: FEATURE_LABELS.shorten,
    surface: "Editing a draft the writer already wrote",
    sees: ["The draft", "The word limit"],
    neverSees: UNIVERSAL_EXCLUSIONS,
    produces: "A shorter draft.",
    writesWithoutReview: false,
    risk: "low",
  },
  {
    feature: "review_criteria",
    label: FEATURE_LABELS.review_criteria,
    surface: "Checking a draft against a funder's guidance",
    sees: ["The draft", "The funder's guidance and priority themes", "The word limit"],
    neverSees: UNIVERSAL_EXCLUSIONS,
    produces: "A list of observations. It does not rewrite anything.",
    writesWithoutReview: false,
    risk: "low",
  },
  {
    feature: "summarise_pipeline",
    label: FEATURE_LABELS.summarise_pipeline,
    surface: "The funding pipeline view",
    sees: ["Counts and total values of opportunities by stage"],
    neverSees: [...UNIVERSAL_EXCLUSIONS, "Application content", "Any named individual"],
    produces: "A summary of figures it was given.",
    writesWithoutReview: false,
    risk: "low",
  },
  {
    feature: "command",
    label: FEATURE_LABELS.command,
    surface: "The command bar",
    sees: [
      "Pipeline value, application counts and active grant counts",
      "Approaching deadlines and outstanding reports",
    ],
    neverSees: [...UNIVERSAL_EXCLUSIONS, "Free text from any record"],
    produces: "An answer composed from those figures.",
    writesWithoutReview: false,
    risk: "low",
  },
  {
    feature: "mission_brief",
    label: FEATURE_LABELS.mission_brief,
    surface: "Mission Intelligence",
    sees: [
      "Findings already produced by deterministic rules, with their explanations",
      "Calculations and their workings",
      "Questions the records could not answer",
    ],
    neverSees: [
      ...UNIVERSAL_EXCLUSIONS,
      "The underlying records the findings were computed from",
    ],
    produces:
      "Prose restating an assembled brief. It does not rank findings, add one, or compute a figure: the brief is complete before it is called.",
    writesWithoutReview: false,
    risk: "moderate",
  },
  {
    feature: "mission_answer",
    label: FEATURE_LABELS.mission_answer,
    surface: "Ask Mission OS",
    sees: [
      "A deterministic answer to the question, already carrying its citations",
      "Unknowns the records could not resolve",
    ],
    neverSees: [
      ...UNIVERSAL_EXCLUSIONS,
      "The underlying records; the question was answered before the model was called",
    ],
    produces: "A reading of an answer it did not produce.",
    writesWithoutReview: false,
    risk: "moderate",
  },
];

export function registerFor(feature: AiFeature): AiUse | undefined {
  return AI_REGISTER.find((entry) => entry.feature === feature);
}

/** Features whose output a third party reads. Held to the higher standard. */
export function consequentialUses(): AiUse[] {
  return AI_REGISTER.filter((entry) => entry.risk === "consequential");
}

/**
 * What is true of every AI use, for the Trust Centre.
 *
 * Written as statements an organisation could check rather than as
 * reassurances. Each one corresponds to something enforced in code and tested,
 * and none of them says "we take your privacy seriously".
 */
export const AI_GUARANTEES = [
  "No model is given access to the database. Context is assembled server-side from a named set of scopes, each one gated on the acting person's role, and what was withheld is recorded alongside what was included.",
  "Personal and special category information is filtered out before context is assembled, rather than removed afterwards. Forgetting to redact is the usual failure; there is nothing here to forget.",
  "Bank transaction descriptions are excluded by default and require a finance capability even when explicitly requested, because a payment reference routinely names an individual.",
  "A generation that reports drawing on a source it was never offered has its output discarded rather than recorded with false provenance.",
  "No AI output changes a record. Every one is a draft a person reads first.",
  "Turning AI off in Settings stops context being assembled at all. Nothing is generated and nothing is sent.",
  "Every generation is recorded: which feature, which model, which prompt version, which references it drew on, and whether a live provider or the deterministic fallback answered.",
];
