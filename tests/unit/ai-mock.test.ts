import { describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { AiContext } from "@/lib/ai/types";
import { refKey } from "@/lib/knowledge";

const provider = new MockAiProvider();

function context(overrides: Partial<AiContext> = {}): AiContext {
  return {
    organisationName: "Northstar",
    profileFields: [
      {
        ref: { type: "organisation_profile_field", id: "org-a:missionStatement" },
        label: "Mission statement",
        value: "Help young people into work",
      },
      {
        ref: { type: "organisation_profile_field", id: "org-a:communitiesServed" },
        label: "Communities served",
        value: "Young people",
      },
      {
        ref: { type: "organisation_profile_field", id: "org-a:coreActivities" },
        label: "Core activities",
        value: "Employment readiness",
      },
    ],
    evidence: [
      {
        ref: { type: "evidence", id: "ev-eval" },
        label: "Evaluation 2025",
        value: "58% progressed into EET",
      },
    ],
    programmeData: [
      {
        ref: { type: "indicator", id: "ind-supported" },
        label: "Young people supported",
        value: "168 of 240",
      },
    ],
    question: "Describe the young people you support.",
    wordLimit: 60,
    ...overrides,
  };
}

describe("MockAiProvider", () => {
  it("is deterministic for the same input", async () => {
    const a = await provider.generate("draft_answer", context());
    const b = await provider.generate("draft_answer", context());
    expect(a.text).toBe(b.text);
  });

  it("respects the word limit when drafting", async () => {
    const result = await provider.generate("draft_answer", context({ wordLimit: 20 }));
    expect(result.text.trim().split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it("does not invent evidence when none is provided", async () => {
    const result = await provider.generate(
      "strengthen_evidence",
      context({ evidence: [], draft: "Base." }),
    );
    expect(result.text).toMatch(/no evidence/i);
    expect(result.grounding.couldNotVerify.length).toBeGreaterThan(0);
  });

  it("says when beneficiary stories have no evidence rather than inventing quotes", async () => {
    const result = await provider.generate(
      "report_section",
      context({
        sectionKey: "beneficiary_stories",
        sectionTitle: "Beneficiary stories",
        evidence: [],
      }),
    );
    expect(result.text).toMatch(/no approved beneficiary stories|no quotes have been invented/i);
  });

  it("grounds command answers in the provided facts", async () => {
    const result = await provider.generate(
      "command",
      context({
        query: "which deadlines are approaching?",
        programmeData: [
          {
            ref: { type: "funding_opportunity", id: "opp-horizon" },
            label: "Deadline: Horizon",
            value: "10 days left",
          },
        ],
      }),
    );
    expect(result.text).toMatch(/Horizon/);
  });
});

/**
 * Audit S2. Provenance used to list everything *offered* as though it had been
 * *used*, which made it impossible to be wrong and therefore worthless. These
 * assert the opposite property: the record reflects what actually reached the
 * output.
 */
describe("observed provenance", () => {
  it("reports only grounding that reached the output", async () => {
    const result = await provider.generate("draft_answer", context());
    const usedKeys = result.grounding.used.map(refKey);

    // The mission statement is composed into the draft.
    expect(usedKeys).toContain("organisation_profile_field:org-a:missionStatement");
    // The evidence title is cited in the supporting sentence.
    expect(usedKeys).toContain("evidence:ev-eval");
  });

  it("reports unused grounding as unused rather than as used", async () => {
    // A draft feature that ignores evidence entirely: the evidence was offered
    // and must not appear as though it had informed the output.
    const result = await provider.generate(
      "shorten",
      context({ draft: "A short sentence with nothing borrowed." }),
    );

    expect(result.grounding.used).toHaveLength(0);
    expect(result.grounding.unused.length).toBeGreaterThan(0);
    expect(result.grounding.couldNotVerify.join(" ")).toMatch(/does not draw on any specific record/i);
  });

  it("every used reference was actually offered", async () => {
    const c = context();
    const offeredKeys = new Set(
      [...c.profileFields, ...c.programmeData, ...c.evidence].map((i) => refKey(i.ref)),
    );
    const result = await provider.generate("draft_answer", c);

    for (const ref of result.grounding.used) {
      expect(offeredKeys.has(refKey(ref))).toBe(true);
    }
  });

  it("carries execution metadata so fallback cannot be shown as live generation", async () => {
    const result = await provider.generate("draft_answer", context());
    expect(result.usedFallback).toBe(false);
    expect(result.model).toBe("pegasus-mock-1");
    expect(result.promptVersion).toBeTruthy();
  });
});
