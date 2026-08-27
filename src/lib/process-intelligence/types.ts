export const FREQUENCY_FACTORS = {
  multiple_daily: 520,
  daily: 260,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annually: 1,
  ad_hoc: 0,
  custom: 0,
} as const;

export type ProcessFrequency = keyof typeof FREQUENCY_FACTORS;
export type StepClassification =
  | "AUTOMATE" | "AI_AUTOMATE" | "AI_ASSIST" | "REDESIGN" | "HUMAN" | "UNKNOWN";
export type ReviewDecision = "APPROVE" | "NEEDS_RESEARCH" | "MODIFY" | "DEFER" | "REJECT";

export interface EffortEstimate {
  occurrencesPerYear: number;
  annualHours: number;
  approximate: true;
  assumption: string;
}

export interface OpportunitySignals {
  frequency: number;
  annualHumanHours: number;
  repetitiveWork: boolean;
  manualDataTransfer: boolean;
  ruleBasedDecisions: boolean;
  documentOrTextWork: boolean;
  errorProne: boolean;
  waiting: boolean;
  frustration: number;
  peopleCount: number;
  sensitivity: number;
  regulatoryRisk: boolean;
  safeguardingRisk: boolean;
  irreversibleAction: boolean;
  financialAuthority: boolean;
  humanJudgement: number;
  unclearProcess: boolean;
  poorInputData: boolean;
  unavailableIntegration: boolean;
  implementationComplexity: number;
}

export interface ScoreComponent {
  signal: string;
  points: number;
  explanation: string;
}

export interface OpportunityScore {
  score: number;
  methodologyVersion: "pi-score-v1";
  components: ScoreComponent[];
}

export interface ProcessRecord {
  id: string;
  organisationId: string;
  name: string;
  department: string;
  team?: string;
  frequency: ProcessFrequency;
  durationMinutes: number;
  peopleCount: number;
  annualHours: number;
  systems: string[];
  score: number;
  reviewState: ReviewDecision | "AWAITING_REVIEW";
  risk: "low" | "medium" | "high";
  narrative: string;
  painPoints: string[];
  steps: Array<{ title: string; actor: string; system?: string; classification: StepClassification }>;
}
