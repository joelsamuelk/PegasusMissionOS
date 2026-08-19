import { describe, expect, it } from "vitest";
import {
  calibrationMetrics,
  falsePositiveCandidates,
  groupAcceptance,
  PILOT_LIMITS,
  pilotJobs,
  validateFounderReview,
  type FounderReview,
  type PilotRecommendation,
} from "@/lib/commercial/pilot";
const rec = (
  id: string,
  overrides: Partial<PilotRecommendation> = {},
): PilotRecommendation => ({
  id,
  prospectId: id,
  motion: "mission_os",
  icpId: "mission-os",
  signalTypes: ["programme_expansion"],
  providerContributions: [{ provider: "charity_commission_ew", evidenceIds: ["e"] }],
  fit: 90,
  intent: 80,
  confidence: 80,
  rank: 1,
  systemReasons: ["Strong match"],
  unknownCount: 2,
  sourceCount: 3,
  officialSourceCount: 2,
  conflictCount: 0,
  discoveryRunId: "run",
  providerVersions: { brave: "1" },
  icpVersion: "1",
  scoringVersion: "1",
  signalState: "current",
  researchState: "qualified",
  createdAt: "2026-08-19",
  ...overrides,
});
const review = (
  recommendationId: string,
  disposition: FounderReview["disposition"],
  rejectionReasons: FounderReview["rejectionReasons"] = [],
): FounderReview => ({
  recommendationId,
  disposition,
  rejectionReasons,
  reviewedBy: "founder",
  reviewedAt: "2026-08-19",
});
describe("pilot calibration", () => {
  it("enforces small pilot limits and two motions", () => {
    expect(PILOT_LIMITS).toEqual({ maxCandidatesPerRun: 25, maxRecommendations: 10 });
    expect(pilotJobs.map((j) => j.motion)).toEqual(["mission_os", "studio"]);
  });
  it("requires rejection reasons", () => {
    expect(() => validateFounderReview(review("a", "reject"))).toThrow("requires");
    expect(() => validateFounderReview(review("a", "nurture", ["wrong_timing"]))).toThrow(
      "only valid",
    );
    expect(
      validateFounderReview(review("a", "reject", ["no_credible_problem"])),
    ).toBeTruthy();
  });
  it("excludes unresolved research from the acceptance denominator", () => {
    const metrics = calibrationMetrics(
      [rec("a"), rec("b"), rec("c")],
      [review("a", "contact_now"), review("b", "nurture"), review("c", "needs_research")],
    );
    expect(metrics).toMatchObject({
      reviewed: 2,
      founderAcceptanceRate: 100,
      immediateOutreachRate: 50,
      needsResearch: 1,
    });
  });
  it("groups acceptance by signal", () => {
    const rows = groupAcceptance(
      [rec("a"), rec("b", { signalTypes: ["impact_report"] })],
      [review("a", "contact_now"), review("b", "reject", ["weak_evidence"])],
      (r) => r.signalTypes,
    );
    expect(rows.map((r) => [r.label, r.acceptanceRate])).toEqual([
      ["programme_expansion", 100],
      ["impact_report", 0],
    ]);
  });
  it("preserves system and founder reasoning for high-ranked rejects", () => {
    const results = falsePositiveCandidates(
      [rec("a")],
      [review("a", "reject", ["no_credible_problem"])],
    );
    expect(results[0]!.recommendation.systemReasons).toEqual(["Strong match"]);
    expect(results[0]!.review.rejectionReasons).toEqual(["no_credible_problem"]);
  });
});
