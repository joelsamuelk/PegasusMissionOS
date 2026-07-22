import { describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { AiContext } from "@/lib/ai/types";

const provider = new MockAiProvider();

function context(overrides: Partial<AiContext> = {}): AiContext {
  return {
    organisationName: "Northstar",
    profileFields: [
      { label: "Mission statement", value: "Help young people into work" },
      { label: "Communities served", value: "Young people" },
      { label: "Core activities", value: "Employment readiness" },
    ],
    evidence: [{ title: "Evaluation 2025", summary: "58% progressed into EET" }],
    programmeData: [{ label: "Young people supported", value: "168 of 240" }],
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

  it("builds provenance from the provided context", async () => {
    const result = await provider.generate("draft_answer", context());
    expect(result.provenance.profileFieldsUsed).toContain("Mission statement");
    expect(result.provenance.documentsUsed).toContain("Evaluation 2025");
  });

  it("does not invent evidence when none is provided", async () => {
    const result = await provider.generate("strengthen_evidence", context({ evidence: [], draft: "Base." }));
    expect(result.text).toMatch(/no evidence/i);
    expect(result.provenance.couldNotVerify.length).toBeGreaterThan(0);
  });

  it("says when beneficiary stories have no evidence rather than inventing quotes", async () => {
    const result = await provider.generate(
      "report_section",
      context({ sectionKey: "beneficiary_stories", sectionTitle: "Beneficiary stories", evidence: [] }),
    );
    expect(result.text).toMatch(/no approved beneficiary stories|no quotes have been invented/i);
  });

  it("grounds command answers in the provided facts", async () => {
    const result = await provider.generate(
      "command",
      context({ query: "which deadlines are approaching?", programmeData: [{ label: "Deadline: Horizon", value: "10 days left" }] }),
    );
    expect(result.text).toMatch(/Horizon/);
  });
});
