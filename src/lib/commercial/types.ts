export type CommercialMotion = "studio" | "mission_os";
export type EvidenceState =
  "verified" | "provided" | "needs_review" | "ai_extracted" | "outdated";

export interface ICPProfile {
  id: string;
  name: string;
  commercialMotion: CommercialMotion;
  description: string;
  targetSectors: string[];
  buyerPersonas: string[];
  positiveSignals: string[];
  triggerSignals: string[];
  relevantCapabilities: string[];
  weights: {
    icpMatch: number;
    problemEvidence: number;
    timing: number;
    buyerAccessibility: number;
    differentiation: number;
    commercialPotential: number;
  };
}

export interface CommercialSignal {
  id: string;
  accountId: string;
  type: string;
  description: string;
  source: string;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
  relevance: number;
  decayDays: number;
  interpretation: string;
}

export interface ResearchClaim {
  id: string;
  accountId: string;
  claim: string;
  kind: "fact" | "hypothesis";
  source?: string;
  sourceUrl?: string;
  observedAt?: string;
  confidence: number;
  verificationState: EvidenceState;
  extractedBy: "human" | "ai" | "provider";
  reviewedBy?: string;
}

export interface CommercialScoreFactor {
  label: string;
  score: number;
  weight: number;
  reason: string;
  evidenceIds: string[];
}
export interface CommercialScore {
  value: number;
  factors: CommercialScoreFactor[];
  missing: string[];
}
export interface AccountRanking {
  fit: CommercialScore;
  intent: CommercialScore;
  confidence: CommercialScore;
  priority: number;
}
