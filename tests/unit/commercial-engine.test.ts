import { describe, expect, it } from "vitest";
import {
  confidenceScore,
  scoreFactors,
  shouldPauseSequence,
  signalStrength,
} from "@/lib/commercial/engine";
import type { CommercialSignal } from "@/lib/commercial/types";
const signal = (overrides: Partial<CommercialSignal> = {}): CommercialSignal => ({
  id: "s",
  accountId: "a",
  type: "strategy",
  description: "New strategy",
  source: "report",
  sourceUrl: "https://example.com",
  observedAt: "2026-08-09T00:00:00Z",
  confidence: 0.8,
  relevance: 100,
  decayDays: 100,
  interpretation: "timing",
  ...overrides,
});
describe("commercial intelligence engine", () => {
  it("decays signals to zero and never makes old triggers current", () => {
    expect(signalStrength(signal(), new Date("2026-08-19T00:00:00Z"))).toBe(72);
    expect(signalStrength(signal(), new Date("2027-08-19T00:00:00Z"))).toBe(0);
  });
  it("scores only evidenced factors and exposes reasons", () => {
    const result = scoreFactors(
      [
        {
          label: "ICP",
          score: 90,
          weight: 30,
          reason: "Matched",
          evidenceIds: ["claim-1"],
        },
        { label: "Timing", score: 20, weight: 20, reason: "Unknown", evidenceIds: [] },
      ],
      ["Confirm timing"],
    );
    expect(result.value).toBe(90);
    expect(result.missing).toEqual(["Confirm timing"]);
  });
  it("reduces confidence when evidence coverage is incomplete", () => {
    const result = confidenceScore([
      { label: "a", score: 90, weight: 1, reason: "sourced", evidenceIds: ["e"] },
      { label: "b", score: 100, weight: 1, reason: "missing", evidenceIds: [] },
    ]);
    expect(result.value).toBe(45);
  });
  it("pauses sequences for every consequential response state", () => {
    expect(shouldPauseSequence("reply_received")).toBe(true);
    expect(shouldPauseSequence("meeting_booked")).toBe(true);
    expect(shouldPauseSequence("opportunity_created")).toBe(true);
    expect(shouldPauseSequence("disqualified")).toBe(true);
    expect(shouldPauseSequence("manual_pause")).toBe(true);
    expect(shouldPauseSequence("message_sent")).toBe(false);
  });
});
