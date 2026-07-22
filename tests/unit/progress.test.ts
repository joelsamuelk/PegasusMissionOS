import { describe, expect, it } from "vitest";
import {
  applicationCompletion,
  answersNeedingAttention,
  indicatorProgress,
} from "@/lib/logic/progress";
import { countWords } from "@/lib/utils";
import type { ApplicationAnswer, Indicator } from "@/types/domain";

function answer(status: ApplicationAnswer["status"]): ApplicationAnswer {
  return {
    id: "a",
    applicationId: "app",
    organisationId: "org",
    order: 1,
    questionText: "q",
    draft: "",
    status,
    evidenceIds: [],
    audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null },
  };
}

describe("applicationCompletion", () => {
  it("is 0 with no answers", () => {
    expect(applicationCompletion([])).toBe(0);
  });
  it("is 100 when all answers are approved", () => {
    expect(applicationCompletion([answer("approved"), answer("approved")])).toBe(100);
  });
  it("reflects partial progress", () => {
    const value = applicationCompletion([answer("approved"), answer("not_started")]);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });
  it("counts answers needing attention", () => {
    expect(answersNeedingAttention([answer("approved"), answer("drafting")])).toBe(1);
  });
});

function indicator(overrides: Partial<Indicator>): Indicator {
  return {
    id: "i",
    organisationId: "org",
    outcomeId: "o",
    name: "n",
    definition: "",
    baseline: 0,
    target: 100,
    currentValue: 0,
    unit: "%",
    measurementFrequency: "Monthly",
    confidence: "medium",
    audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null },
    ...overrides,
  };
}

describe("indicatorProgress", () => {
  it("computes percentage towards target from baseline", () => {
    expect(indicatorProgress(indicator({ currentValue: 50 }))).toBe(50);
  });
  it("clamps to 100 when the target is exceeded", () => {
    expect(indicatorProgress(indicator({ currentValue: 150 }))).toBe(100);
  });
  it("handles a non-zero baseline", () => {
    expect(indicatorProgress(indicator({ baseline: 20, target: 40, currentValue: 30 }))).toBe(50);
  });
  it("never returns below zero", () => {
    expect(indicatorProgress(indicator({ currentValue: -10 }))).toBe(0);
  });
});

describe("countWords", () => {
  it("counts words on whitespace", () => {
    expect(countWords("one two three")).toBe(3);
  });
  it("is 0 for empty or whitespace strings", () => {
    expect(countWords("   ")).toBe(0);
  });
  it("collapses multiple spaces", () => {
    expect(countWords("a   b")).toBe(2);
  });
});
