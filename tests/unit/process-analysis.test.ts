import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TOOL,
  buildAnalysis,
  renderSubmission,
  type AnalysisSubmission,
} from "@/lib/process-intelligence";

const submission: AnalysisSubmission = {
  name: "Filing compliance documents",
  department: "Operations",
  jobTitle: "COO",
  frequency: "daily",
  durationMinutes: 60,
  peopleCount: 2,
  annualHours: 520,
  systems: ["Google Sheet"],
  narrative: "Operator emails the licence. We save it to Drive and type the expiry date.",
  friction: "Extracting information from files and typing it in.",
  sensitiveData: ["personal data"],
};

const signals = {
  repetitive_work: true,
  manual_data_transfer: true,
  rule_based_decisions: true,
  document_or_text_work: true,
  error_prone: false,
  waiting: false,
  regulatory_risk: false,
  safeguarding_risk: false,
  irreversible_action: false,
  financial_authority: false,
  unclear_process: false,
  poor_input_data: false,
  unavailable_integration: false,
  frustration: 4,
  sensitivity: 6,
  human_judgement: 3,
  implementation_complexity: 4,
};

const step = (order: number, title: string) => ({
  order,
  title,
  description: "",
  actor: "LULA operations",
  system: "",
  classification: "AI_AUTOMATE",
  reasoning: "Field extraction from a document.",
  confidence: 0.8,
  decision_required: false,
  human_judgement_required: false,
  approval_required: false,
  data_input: "",
  data_output: "",
});

const raw = {
  summary: "Compliance documents are filed and transcribed by hand.",
  overall_confidence: 0.8,
  evidence_gaps: ["Volume of new drivers per week"],
  clarifying_questions: [],
  steps: [step(20, "Type expiry date"), step(10, "Save licence to Drive")],
  opportunities: [
    {
      title: "Extract licence fields automatically",
      problem: "Fields are typed by hand.",
      current_state: "Manual transcription.",
      proposed_state: "Upload extracts fields for confirmation.",
      opportunity_type: "AI_AUTOMATE",
      expected_benefit: "Less typing and fewer transcription errors.",
      recoverable_share: 1.7,
      complexity: "medium",
      step_orders: [20, 99],
      evidence_fields: ["narrative", "friction", "friction"],
      systems: ["Google Sheet", " "],
      integration_requirements: [],
      data_requirements: [],
      oversight_requirements: ["Confirm blurry images"],
      risks: [],
      controls: [],
      confidence: 0.75,
      signals: { ...signals, frustration: 40 },
    },
  ],
};

const meta = { provider: "anthropic", model: "test-model", promptVersion: "p1" };

function objectsIn(schema: unknown): Record<string, unknown>[] {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  const children = Object.values(node).flatMap(objectsIn);
  return node.type === "object" ? [node, ...children] : children;
}

describe("process analysis", () => {
  it("renders absent evidence as absent and labels citable fields", () => {
    const text = renderSubmission(submission);
    expect(text).toContain("[narrative] How the process works: Operator emails");
    expect(text).toContain("[would_remove] What they would remove if they could: (not provided)");
    expect(text).toContain("daily (260 times a year), 60 minutes each, 2 people");
    expect(text.startsWith("<submission>")).toBe(true);
  });

  it("keeps every tool object valid for strict mode", () => {
    for (const node of objectsIn(ANALYSIS_TOOL.input_schema)) {
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required as string[])].sort()).toEqual(
        Object.keys(node.properties as object).sort(),
      );
    }
  });

  it("computes hours and score from signals, not from the model", () => {
    const analysis = buildAnalysis(raw, submission, meta);
    const [opportunity] = analysis.opportunities;
    // A share above 1 is clamped, so hours never exceed the participant's estimate.
    expect(opportunity!.recoverableShare).toBe(1);
    expect(opportunity!.estimatedRecoverableHours).toBe(520);
    expect(opportunity!.score).toEqual(buildAnalysis(raw, submission, meta).opportunities[0]!.score);
    expect(opportunity!.score.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: "frustration", points: 6 }),
        expect.objectContaining({ signal: "sensitivity", points: -6 }),
      ]),
    );
  });

  it("renumbers steps and drops references to steps that do not exist", () => {
    const analysis = buildAnalysis(raw, submission, meta);
    expect(analysis.steps.map((s) => [s.order, s.title])).toEqual([
      [1, "Save licence to Drive"],
      [2, "Type expiry date"],
    ]);
    expect(analysis.opportunities[0]!.stepOrders).toEqual([2]);
    expect(analysis.opportunities[0]!.evidenceFields).toEqual(["narrative", "friction"]);
    expect(analysis.opportunities[0]!.systems).toEqual(["Google Sheet"]);
    expect(analysis.steps[0]!.system).toBeUndefined();
  });

  it("rejects output that does not match the schema", () => {
    expect(() =>
      buildAnalysis({ ...raw, opportunities: [{ ...raw.opportunities[0], title: undefined }] }, submission, meta),
    ).toThrow();
    expect(() => buildAnalysis({ ...raw, steps: [{ ...step(1, "x"), classification: "MAGIC" }] }, submission, meta)).toThrow();
  });

  it("allows an analysis with no steps when the evidence is thin", () => {
    const analysis = buildAnalysis(
      { ...raw, steps: [], opportunities: [], evidence_gaps: ["No narrative provided"] },
      { ...submission, narrative: "" },
      meta,
    );
    expect(analysis.steps).toEqual([]);
    expect(analysis.evidenceGaps).toEqual(["No narrative provided"]);
  });
});
