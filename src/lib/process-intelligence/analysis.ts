import { z } from "zod";
import { scoreOpportunity } from "./scoring";
import {
  FREQUENCY_FACTORS,
  type OpportunityScore,
  type ProcessFrequency,
  type StepClassification,
} from "./types";

/**
 * Process analysis: turns one participant submission into classified steps and
 * scoped opportunities.
 *
 * The split of responsibility is deliberate. The model reads the evidence,
 * describes steps and reports signals. Everything numeric that a client will
 * see (the opportunity score and the recoverable hours) is computed here from
 * those signals and the participant's own effort estimate, so the figures are
 * reproducible and the methodology version means something.
 */

export const ANALYSIS_VERSION = "pi-analysis-v1";

export interface AnalysisSubmission {
  name: string;
  department?: string;
  team?: string;
  jobTitle?: string;
  frequency: string;
  occurrencesPerYear?: number;
  durationMinutes: number;
  peopleCount: number;
  annualHours: number;
  systems: string[];
  narrative: string;
  friction?: string;
  humanJudgement?: string;
  sensitiveData: string[];
  magicRemoval?: string;
}

const EVIDENCE_FIELDS = [
  "process_name",
  "narrative",
  "friction",
  "human_judgement",
  "would_remove",
  "systems",
  "sensitive_data",
  "effort",
] as const;
const CLASSIFICATIONS = [
  "AUTOMATE",
  "AI_AUTOMATE",
  "AI_ASSIST",
  "REDESIGN",
  "HUMAN",
  "UNKNOWN",
] as const satisfies readonly StepClassification[];
const OPPORTUNITY_TYPES = ["AUTOMATE", "AI_AUTOMATE", "AI_ASSIST", "REDESIGN"] as const;
const COMPLEXITY = ["low", "medium", "high"] as const;

/** Scoring signal ranges mirror the caps in `scoreOpportunity`. */
const SIGNAL_RANGES = {
  frustration: 6,
  sensitivity: 12,
  human_judgement: 15,
  implementation_complexity: 10,
} as const;

const BOOLEAN_SIGNALS = [
  "repetitive_work",
  "manual_data_transfer",
  "rule_based_decisions",
  "document_or_text_work",
  "error_prone",
  "waiting",
  "regulatory_risk",
  "safeguarding_risk",
  "irreversible_action",
  "financial_authority",
  "unclear_process",
  "poor_input_data",
  "unavailable_integration",
] as const;

const stringList = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

/**
 * Strict mode guarantees the tool input matches this schema, but it cannot
 * express numeric ranges, so ranges are stated in descriptions and clamped
 * after parsing.
 */
export const ANALYSIS_TOOL = {
  name: "submit_process_analysis",
  description: "Return the structured analysis of the submitted process.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "Two or three sentences." },
      overall_confidence: {
        type: "number",
        description: "0 to 1. How far the evidence supports this analysis.",
      },
      evidence_gaps: stringList("What the submission does not establish. Empty if none."),
      clarifying_questions: stringList("Questions for the participant. Empty if none."),
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            order: { type: "integer", description: "1-based position." },
            title: { type: "string" },
            description: { type: "string" },
            actor: { type: "string", description: "Role or party. Empty if not stated." },
            system: { type: "string", description: "System used. Empty if none stated." },
            classification: { type: "string", enum: [...CLASSIFICATIONS] },
            reasoning: { type: "string", description: "Why this classification." },
            confidence: { type: "number", description: "0 to 1." },
            decision_required: { type: "boolean" },
            human_judgement_required: { type: "boolean" },
            approval_required: { type: "boolean" },
            data_input: { type: "string", description: "Empty if not stated." },
            data_output: { type: "string", description: "Empty if not stated." },
          },
          required: [
            "order",
            "title",
            "description",
            "actor",
            "system",
            "classification",
            "reasoning",
            "confidence",
            "decision_required",
            "human_judgement_required",
            "approval_required",
            "data_input",
            "data_output",
          ],
          additionalProperties: false,
        },
      },
      opportunities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "A short, concrete name for the change." },
            problem: { type: "string" },
            current_state: { type: "string" },
            proposed_state: { type: "string" },
            opportunity_type: { type: "string", enum: [...OPPORTUNITY_TYPES] },
            expected_benefit: {
              type: "string",
              description: "Qualitative. Do not state hours or money.",
            },
            recoverable_share: {
              type: "number",
              description: "0 to 1. Conservative share of the stated annual effort returned.",
            },
            complexity: { type: "string", enum: [...COMPLEXITY] },
            step_orders: {
              type: "array",
              items: { type: "integer" },
              description: "Orders of the steps this changes.",
            },
            evidence_fields: {
              type: "array",
              items: { type: "string", enum: [...EVIDENCE_FIELDS] },
              description: "Submission fields this opportunity rests on.",
            },
            systems: stringList("Systems involved."),
            integration_requirements: stringList("Integrations needed. Empty if none."),
            data_requirements: stringList("Data needed. Empty if none."),
            oversight_requirements: stringList("Where a person must stay in control."),
            risks: stringList("Risks of making this change."),
            controls: stringList("Controls that address those risks."),
            confidence: { type: "number", description: "0 to 1." },
            signals: {
              type: "object",
              properties: {
                ...Object.fromEntries(BOOLEAN_SIGNALS.map((key) => [key, { type: "boolean" }])),
                frustration: {
                  type: "integer",
                  description: `0 to ${SIGNAL_RANGES.frustration}. Participant-reported friction.`,
                },
                sensitivity: {
                  type: "integer",
                  description: `0 to ${SIGNAL_RANGES.sensitivity}. Sensitivity of the data touched.`,
                },
                human_judgement: {
                  type: "integer",
                  description: `0 to ${SIGNAL_RANGES.human_judgement}. Judgement that must stay human.`,
                },
                implementation_complexity: {
                  type: "integer",
                  description: `0 to ${SIGNAL_RANGES.implementation_complexity}.`,
                },
              },
              required: [...BOOLEAN_SIGNALS, ...Object.keys(SIGNAL_RANGES)],
              additionalProperties: false,
            },
          },
          required: [
            "title",
            "problem",
            "current_state",
            "proposed_state",
            "opportunity_type",
            "expected_benefit",
            "recoverable_share",
            "complexity",
            "step_orders",
            "evidence_fields",
            "systems",
            "integration_requirements",
            "data_requirements",
            "oversight_requirements",
            "risks",
            "controls",
            "confidence",
            "signals",
          ],
          additionalProperties: false,
        },
      },
    },
    required: [
      "summary",
      "overall_confidence",
      "evidence_gaps",
      "clarifying_questions",
      "steps",
      "opportunities",
    ],
    additionalProperties: false,
  },
};

const signalSchema = z
  .object(Object.fromEntries(BOOLEAN_SIGNALS.map((key) => [key, z.boolean()])))
  .extend({
    frustration: z.number(),
    sensitivity: z.number(),
    human_judgement: z.number(),
    implementation_complexity: z.number(),
  });

const rawSchema = z.object({
  summary: z.string(),
  overall_confidence: z.number(),
  evidence_gaps: z.array(z.string()),
  clarifying_questions: z.array(z.string()),
  steps: z.array(
    z.object({
      order: z.number().int(),
      title: z.string().min(1),
      description: z.string(),
      actor: z.string(),
      system: z.string(),
      classification: z.enum(CLASSIFICATIONS),
      reasoning: z.string(),
      confidence: z.number(),
      decision_required: z.boolean(),
      human_judgement_required: z.boolean(),
      approval_required: z.boolean(),
      data_input: z.string(),
      data_output: z.string(),
    }),
  ),
  opportunities: z.array(
    z.object({
      title: z.string().min(1),
      problem: z.string().min(1),
      current_state: z.string(),
      proposed_state: z.string(),
      opportunity_type: z.enum(OPPORTUNITY_TYPES),
      expected_benefit: z.string(),
      recoverable_share: z.number(),
      complexity: z.enum(COMPLEXITY),
      step_orders: z.array(z.number().int()),
      evidence_fields: z.array(z.enum(EVIDENCE_FIELDS)),
      systems: z.array(z.string()),
      integration_requirements: z.array(z.string()),
      data_requirements: z.array(z.string()),
      oversight_requirements: z.array(z.string()),
      risks: z.array(z.string()),
      controls: z.array(z.string()),
      confidence: z.number(),
      signals: signalSchema,
    }),
  ),
});

export interface AnalysedStep {
  order: number;
  title: string;
  description?: string;
  actor?: string;
  system?: string;
  classification: StepClassification;
  reasoning: string;
  confidence: number;
  decisionRequired: boolean;
  humanJudgementRequired: boolean;
  approvalRequired: boolean;
  dataInput?: string;
  dataOutput?: string;
}

export interface AnalysedOpportunity {
  title: string;
  problem: string;
  currentState: string;
  proposedState: string;
  opportunityType: (typeof OPPORTUNITY_TYPES)[number];
  expectedBenefit: string;
  recoverableShare: number;
  estimatedRecoverableHours: number;
  complexity: (typeof COMPLEXITY)[number];
  stepOrders: number[];
  evidenceFields: string[];
  systems: string[];
  integrationRequirements: string[];
  dataRequirements: string[];
  oversightRequirements: string[];
  risks: string[];
  controls: string[];
  confidence: number;
  score: OpportunityScore;
}

export interface ProcessAnalysis {
  analysisVersion: typeof ANALYSIS_VERSION;
  promptVersion: string;
  provider: string;
  model: string;
  summary: string;
  confidence: number;
  evidenceGaps: string[];
  clarifyingQuestions: string[];
  steps: AnalysedStep[];
  opportunities: AnalysedOpportunity[];
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
const unit = (value: number) => Math.round(clamp(value, 1) * 100) / 100;
const optional = (value: string) => (value.trim() ? value.trim() : undefined);
const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

export function occurrencesPerYear(submission: AnalysisSubmission): number {
  if (submission.occurrencesPerYear && submission.occurrencesPerYear > 0)
    return submission.occurrencesPerYear;
  return FREQUENCY_FACTORS[submission.frequency as ProcessFrequency] ?? 0;
}

/**
 * Submission evidence rendered for the model. Every field is labelled with
 * the id the model cites in `evidence_fields`, and absent fields are stated as
 * absent rather than omitted, so silence is not read as "nothing to report".
 */
export function renderSubmission(submission: AnalysisSubmission): string {
  const field = (id: string, label: string, value?: string) =>
    `[${id}] ${label}: ${value?.trim() ? value.trim() : "(not provided)"}`;
  return [
    "<submission>",
    field("process_name", "Process", submission.name),
    field(
      "effort",
      "Participant effort estimate",
      `${submission.frequency.replaceAll("_", " ")} (${occurrencesPerYear(submission)} times a year), ${submission.durationMinutes} minutes each, ${submission.peopleCount} people involved`,
    ),
    `Role: ${[submission.jobTitle, submission.team, submission.department].filter(Boolean).join(", ") || "(not provided)"}`,
    field("systems", "Systems used", submission.systems.join(", ")),
    field("narrative", "How the process works", submission.narrative),
    field("friction", "What takes the most time or causes frustration", submission.friction),
    field("human_judgement", "Where human judgement is needed", submission.humanJudgement),
    field("would_remove", "What they would remove if they could", submission.magicRemoval),
    field("sensitive_data", "Sensitive data declared", submission.sensitiveData.join(", ")),
    "</submission>",
  ].join("\n");
}

/**
 * Validate and normalise model output, then compute every figure.
 *
 * Throws on output that does not match the schema. Out-of-range numbers are
 * clamped and step references that point at no step are dropped, because
 * those are recoverable; a missing field is not.
 */
export function buildAnalysis(
  raw: unknown,
  submission: AnalysisSubmission,
  meta: { provider: string; model: string; promptVersion: string },
): ProcessAnalysis {
  const parsed = rawSchema.parse(raw);
  const ordered = parsed.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 30);
  const steps: AnalysedStep[] = ordered.map((s, index) => ({
      order: index + 1,
      title: s.title.trim(),
      description: optional(s.description),
      actor: optional(s.actor),
      system: optional(s.system),
      classification: s.classification,
      reasoning: s.reasoning.trim(),
      confidence: unit(s.confidence),
      decisionRequired: s.decision_required,
      humanJudgementRequired: s.human_judgement_required,
      approvalRequired: s.approval_required,
      dataInput: optional(s.data_input),
      dataOutput: optional(s.data_output),
    }));
  // Steps are renumbered contiguously, so the model's orders are mapped, not trusted.
  const renumber = new Map(ordered.map((s, index) => [s.order, index + 1]));
  const frequency = occurrencesPerYear(submission);

  const opportunities = parsed.opportunities.slice(0, 5).map((o) => {
    const share = unit(o.recoverable_share);
    const recoverableHours = Math.round(submission.annualHours * share * 10) / 10;
    const s = o.signals as Record<string, number | boolean>;
    const score = scoreOpportunity({
      frequency,
      annualHumanHours: recoverableHours,
      peopleCount: submission.peopleCount,
      repetitiveWork: s.repetitive_work === true,
      manualDataTransfer: s.manual_data_transfer === true,
      ruleBasedDecisions: s.rule_based_decisions === true,
      documentOrTextWork: s.document_or_text_work === true,
      errorProne: s.error_prone === true,
      waiting: s.waiting === true,
      frustration: clamp(Number(s.frustration), SIGNAL_RANGES.frustration),
      sensitivity: clamp(Number(s.sensitivity), SIGNAL_RANGES.sensitivity),
      regulatoryRisk: s.regulatory_risk === true,
      safeguardingRisk: s.safeguarding_risk === true,
      irreversibleAction: s.irreversible_action === true,
      financialAuthority: s.financial_authority === true,
      humanJudgement: clamp(Number(s.human_judgement), SIGNAL_RANGES.human_judgement),
      unclearProcess: s.unclear_process === true,
      poorInputData: s.poor_input_data === true,
      unavailableIntegration: s.unavailable_integration === true,
      implementationComplexity: clamp(
        Number(s.implementation_complexity),
        SIGNAL_RANGES.implementation_complexity,
      ),
    });
    return {
      title: o.title.trim(),
      problem: o.problem.trim(),
      currentState: o.current_state.trim(),
      proposedState: o.proposed_state.trim(),
      opportunityType: o.opportunity_type,
      expectedBenefit: o.expected_benefit.trim(),
      recoverableShare: share,
      estimatedRecoverableHours: recoverableHours,
      complexity: o.complexity,
      stepOrders: [
        ...new Set(o.step_orders.map((n) => renumber.get(n)).filter((n): n is number => !!n)),
      ],
      evidenceFields: [...new Set(o.evidence_fields)],
      systems: clean(o.systems),
      integrationRequirements: clean(o.integration_requirements),
      dataRequirements: clean(o.data_requirements),
      oversightRequirements: clean(o.oversight_requirements),
      risks: clean(o.risks),
      controls: clean(o.controls),
      confidence: unit(o.confidence),
      score,
    } satisfies AnalysedOpportunity;
  });

  return {
    analysisVersion: ANALYSIS_VERSION,
    promptVersion: meta.promptVersion,
    provider: meta.provider,
    model: meta.model,
    summary: parsed.summary.trim(),
    confidence: unit(parsed.overall_confidence),
    evidenceGaps: clean(parsed.evidence_gaps),
    clarifyingQuestions: clean(parsed.clarifying_questions),
    steps,
    opportunities: opportunities.sort((a, b) => b.score.score - a.score.score),
  };
}
