import type { CommercialMotion } from "./types";
export const PILOT_LIMITS = { maxCandidatesPerRun: 25, maxRecommendations: 10 } as const;
export type FounderDisposition = "contact_now" | "nurture" | "reject" | "needs_research";
export type RejectionReason =
  | "weak_evidence"
  | "wrong_icp"
  | "wrong_timing"
  | "wrong_size"
  | "no_credible_problem"
  | "weak_pegasus_differentiation"
  | "poor_buyer_access"
  | "already_known"
  | "not_strategically_interesting"
  | "duplicate"
  | "other";
export interface PilotRecommendation {
  id: string;
  prospectId: string;
  motion: CommercialMotion;
  icpId: string;
  signalTypes: string[];
  providerContributions: { provider: string; evidenceIds: string[] }[];
  fit: number;
  intent: number;
  confidence: number;
  rank: number;
  systemReasons: string[];
  unknownCount: number;
  sourceCount: number;
  officialSourceCount: number;
  conflictCount: number;
  discoveryRunId: string;
  providerVersions: Record<string, string>;
  icpVersion: string;
  scoringVersion: string;
  signalState: string;
  researchState: string;
  createdAt: string;
}
export interface FounderReview {
  recommendationId: string;
  disposition: FounderDisposition;
  rejectionReasons: RejectionReason[];
  note?: string;
  reviewedBy: string;
  reviewedAt: string;
}
export interface DiscoveryMiss {
  id: string;
  organisation: string;
  motion: CommercialMotion;
  icpId: string;
  whyItMatters: string;
  evidence?: string;
  createdBy: string;
  createdAt: string;
}
export interface CalibrationRecommendation {
  id: string;
  observation: string;
  sampleSize: number;
  affectedMotion?: CommercialMotion;
  affectedICP?: string;
  suggestedChange: string;
  expectedEffect: string;
  confidence: number;
  status: "proposed" | "approved" | "rejected" | "implemented";
}
export function validateFounderReview(review: FounderReview) {
  if (review.disposition === "reject" && !review.rejectionReasons.length)
    throw new Error("A rejected recommendation requires at least one reason.");
  if (review.disposition !== "reject" && review.rejectionReasons.length)
    throw new Error("Rejection reasons are only valid for rejected recommendations.");
  return review;
}
export function calibrationMetrics(
  recommendations: PilotRecommendation[],
  reviews: FounderReview[],
) {
  const byId = new Map(recommendations.map((r) => [r.id, r]));
  const completed = reviews.filter(
      (r) => r.disposition !== "needs_research" && byId.has(r.recommendationId),
    ),
    contact = completed.filter((r) => r.disposition === "contact_now").length,
    nurture = completed.filter((r) => r.disposition === "nurture").length,
    rejected = completed.filter((r) => r.disposition === "reject").length,
    needsResearch = reviews.filter(
      (r) => r.disposition === "needs_research" && byId.has(r.recommendationId),
    ).length;
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
  return {
    reviewed: completed.length,
    founderAcceptanceRate: rate(contact + nurture, completed.length),
    immediateOutreachRate: rate(contact, completed.length),
    rejectionRate: rate(rejected, completed.length),
    needMoreResearchRate: rate(needsResearch, reviews.length),
    contact,
    nurture,
    rejected,
    needsResearch,
  };
}
export function groupAcceptance(
  recommendations: PilotRecommendation[],
  reviews: FounderReview[],
  key: (r: PilotRecommendation) => string[],
) {
  const reviewById = new Map(reviews.map((r) => [r.recommendationId, r]));
  const groups = new Map<
    string,
    {
      reviewed: number;
      contact_now: number;
      nurture: number;
      rejected: number;
      needs_research: number;
    }
  >();
  for (const recommendation of recommendations) {
    const review = reviewById.get(recommendation.id);
    if (!review) continue;
    for (const value of key(recommendation)) {
      const row = groups.get(value) ?? {
        reviewed: 0,
        contact_now: 0,
        nurture: 0,
        rejected: 0,
        needs_research: 0,
      };
      if (review.disposition === "needs_research") row.needs_research++;
      else {
        row.reviewed++;
        if (review.disposition === "contact_now") row.contact_now++;
        if (review.disposition === "nurture") row.nurture++;
        if (review.disposition === "reject") row.rejected++;
      }
      groups.set(value, row);
    }
  }
  return [...groups.entries()].map(([label, row]) => ({
    label,
    ...row,
    acceptanceRate: row.reviewed
      ? Math.round(((row.contact_now + row.nurture) / row.reviewed) * 100)
      : null,
  }));
}
export function falsePositiveCandidates(
  recommendations: PilotRecommendation[],
  reviews: FounderReview[],
  minimumRankScore = 75,
) {
  const rejected = new Map(
    reviews.filter((r) => r.disposition === "reject").map((r) => [r.recommendationId, r]),
  );
  return recommendations
    .filter(
      (r) =>
        Math.round((r.fit + r.intent + r.confidence) / 3) >= minimumRankScore &&
        rejected.has(r.id),
    )
    .map((r) => ({ recommendation: r, review: rejected.get(r.id)! }));
}
export const pilotJobs = [
  {
    id: "pilot-mission-os",
    name: "Mission OS Pilot",
    motion: "mission_os" as const,
    icpId: "mission-os",
    criteria:
      "UK mission-driven organisations with programme, funding, reporting or organisational-growth evidence",
    signalRequirements: [
      "programme expansion",
      "major grant",
      "impact activity",
      "new strategy",
      "leadership",
      "digital transformation",
    ],
    providers: ["brave_search", "charity_commission_ew", "bounded_public_web"],
    status: "pilot" as const,
  },
  {
    id: "pilot-studio",
    name: "Pegasus Studio Pilot",
    motion: "studio" as const,
    icpId: "ai-transformation",
    criteria:
      "UK organisations with recent product, technology, AI, engineering, leadership or market change",
    signalRequirements: [
      "AI initiative",
      "engineering scaling",
      "leadership change",
      "platform modernisation",
      "market expansion",
    ],
    providers: ["brave_search", "companies_house", "bounded_public_web"],
    status: "pilot" as const,
  },
];
