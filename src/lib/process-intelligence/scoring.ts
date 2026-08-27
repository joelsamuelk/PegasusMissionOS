import { FREQUENCY_FACTORS, type EffortEstimate, type OpportunityScore, type OpportunitySignals, type ProcessFrequency, type ScoreComponent } from "./types";

const rounded = (value: number) => Math.round(value * 10) / 10;

export function estimateAnnualEffort(input: {
  frequency: ProcessFrequency;
  customOccurrencesPerYear?: number;
  durationMinutes: number;
  peopleCount: number;
}): EffortEstimate {
  const defaultOccurrences = FREQUENCY_FACTORS[input.frequency];
  const occurrencesPerYear = Math.max(0, input.customOccurrencesPerYear ?? defaultOccurrences);
  const duration = Math.max(0, input.durationMinutes);
  const people = Math.max(1, input.peopleCount);
  return {
    occurrencesPerYear,
    annualHours: rounded((occurrencesPerYear * duration * people) / 60),
    approximate: true,
    assumption: `${occurrencesPerYear} occurrences/year × ${duration} minutes × ${people} people`,
  };
}

export function scoreOpportunity(s: OpportunitySignals): OpportunityScore {
  const components: ScoreComponent[] = [];
  const add = (signal: string, points: number, explanation: string) => {
    if (points !== 0) components.push({ signal, points, explanation });
  };
  add("frequency", Math.min(12, Math.round(Math.max(0, s.frequency) / 25)), "More frequent work compounds the benefit.");
  add("annual_effort", Math.min(18, Math.round(Math.max(0, s.annualHumanHours) / 50)), "Annual human effort creates recoverable capacity.");
  add("repetition", s.repetitiveWork ? 10 : 0, "The work repeats in a consistent pattern.");
  add("manual_transfer", s.manualDataTransfer ? 12 : 0, "Information is manually moved between systems.");
  add("rule_based", s.ruleBasedDecisions ? 8 : 0, "Decisions have explicit rules.");
  add("document_text", s.documentOrTextWork ? 8 : 0, "Document or language work may benefit from assistance.");
  add("errors", s.errorProne ? 6 : 0, "Errors are a reported source of rework.");
  add("waiting", s.waiting ? 4 : 0, "Waiting creates avoidable elapsed time.");
  add("frustration", Math.min(6, Math.max(0, s.frustration)), "Participant-reported friction.");
  add("coordination", Math.min(5, Math.max(0, s.peopleCount - 1)), "More hand-offs increase coordination cost.");
  add("sensitivity", -Math.min(12, Math.max(0, s.sensitivity)), "Sensitive information requires stronger controls.");
  add("regulated", s.regulatoryRisk ? -10 : 0, "Regulatory implications constrain automation.");
  add("safeguarding", s.safeguardingRisk ? -15 : 0, "Safeguarding requires human control.");
  add("irreversible", s.irreversibleAction ? -8 : 0, "Irreversible actions need oversight.");
  add("financial_authority", s.financialAuthority ? -8 : 0, "Financial authority must remain controlled.");
  add("human_judgement", -Math.min(15, Math.max(0, s.humanJudgement)), "Substantial judgement should remain human-led.");
  add("unclear", s.unclearProcess ? -8 : 0, "The process needs clarification before intervention.");
  add("poor_data", s.poorInputData ? -7 : 0, "Input quality limits reliable automation.");
  add("integration", s.unavailableIntegration ? -8 : 0, "A required integration is unavailable.");
  add("complexity", -Math.min(10, Math.max(0, s.implementationComplexity)), "Implementation complexity reduces near-term feasibility.");
  return { score: Math.max(0, Math.min(100, 20 + components.reduce((sum, item) => sum + item.points, 0))), methodologyVersion: "pi-score-v1", components };
}

export function tokenDigest(token: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((hash) =>
    Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

export function createOpaqueToken(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
