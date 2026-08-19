import { describe, expect, it } from "vitest";
import {
  corroboratedConfidence,
  detectMeaningfulChanges,
  shouldEnrichPeople,
  sourceAuthorityWeight,
} from "@/lib/commercial/intelligence";
import type { ResearchClaim } from "@/lib/commercial/types";
const claim = (id: string, text: string, observedAt = "2026-08-01"): ResearchClaim => ({
  id,
  accountId: "a",
  claim: text,
  kind: "fact",
  source: "Official",
  sourceUrl: "https://a.test",
  observedAt,
  confidence: 0.8,
  verificationState: "needs_review",
  extractedBy: "provider",
});
describe("source and temporal intelligence", () => {
  it("ranks source authority deterministically without verifying claims", () =>
    expect(sourceAuthorityWeight("official_registry")).toBeGreaterThan(
      sourceAuthorityWeight("other_public_source"),
    ));
  it("counts syndication as one independent confirmation", () => {
    const r = corroboratedConfidence([
      {
        authority: "official_organisation",
        independenceKey: "press-release-1",
        confidence: 0.8,
      },
      {
        authority: "reputable_news",
        independenceKey: "press-release-1",
        confidence: 0.8,
      },
      { authority: "reputable_news", independenceKey: "reporting-2", confidence: 0.7 },
    ]);
    expect(r.independentSources).toBe(2);
    expect(r.confidence).toBe(0.81);
  });
  it("detects meaningful new events but not copy edits", () => {
    const changes = detectMeaningfulChanges(
      [claim("1", "We support communities")],
      [
        claim("2", "We support local communities"),
        claim("3", "A new CTO joined", "2026-07-01"),
      ],
      "2026-08-19",
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.eventDate).toBe("2026-07-01");
  });
  it("enriches people only after qualification and threshold", () => {
    expect(
      shouldEnrichPeople({ fit: 90, confidence: 80, researchState: "qualified" }),
    ).toBe(true);
    expect(
      shouldEnrichPeople({ fit: 90, confidence: 80, researchState: "researched" }),
    ).toBe(false);
    expect(
      shouldEnrichPeople({ fit: 60, confidence: 80, researchState: "qualified" }),
    ).toBe(false);
  });
});
