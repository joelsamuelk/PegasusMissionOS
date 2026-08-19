import { describe, expect, it } from "vitest";
import type { Claim, ClaimSource } from "@/types/domain";
import {
  ClaimPromotionError,
  GroundingViolationError,
  assessEvidenceStrength,
  confirmClaim,
  correctClaim,
  createClaim,
  effectiveClaimKind,
  indexClaims,
  itemsMentionedIn,
  isCurrent,
  kindIsHonest,
  observeGrounding,
  refKey,
  traceClaim,
  traceDepth,
  tracedAssumptions,
  tracedReferences,
  type GroundingItem,
} from "@/lib/knowledge";

const NOW = new Date("2026-08-17T10:00:00Z");
const ORG = "org-northstar";

function claim(overrides: Partial<Claim> & Pick<Claim, "id">): Claim {
  return {
    organisationId: ORG,
    subject: { type: "programme", id: "prog-youth" },
    predicate: "participants_supported",
    value: { type: "number", number: 1284 },
    text: "Northstar supported 1,284 young people.",
    kind: "fact",
    verification: "verified",
    sources: [],
    derivedFrom: [],
    supportedBy: [],
    producedBy: { method: "human", actorId: "user-amara" },
    assumptions: [],
    caveats: [],
    conflictsWith: [],
    verifiedBy: "user-amara",
    verifiedAt: NOW.toISOString(),
    audit: { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), archivedAt: null },
    ...overrides,
  };
}

/**
 * The rule that stops a tidy number inheriting authority its inputs do not
 * have. Generalised here from `finance-intelligence/statements.ts`, whose 80
 * tests continue to assert the same behaviour through the finance API.
 */
describe("effective kind", () => {
  it("returns the claim's own kind when nothing weakens it", () => {
    const root = claim({ id: "a", kind: "calculation", supportedBy: ["b"] });
    const support = claim({ id: "b", kind: "fact" });
    const index = indexClaims([root, support]);

    expect(effectiveClaimKind(root, index)).toBe("calculation");
    expect(kindIsHonest(root, index)).toBe(true);
  });

  it("a calculation resting on a forecast is not a calculation", () => {
    const root = claim({ id: "a", kind: "calculation", supportedBy: ["b"] });
    const support = claim({ id: "b", kind: "forecast" });
    const index = indexClaims([root, support]);

    expect(effectiveClaimKind(root, index)).toBe("forecast");
    expect(kindIsHonest(root, index)).toBe(false);
  });

  it("finds the weakest link several hops down", () => {
    const index = indexClaims([
      claim({ id: "a", kind: "fact", supportedBy: ["b"] }),
      claim({ id: "b", kind: "calculation", supportedBy: ["c"] }),
      claim({ id: "c", kind: "assumption" }),
    ]);
    const root = index.get("a")!;
    expect(effectiveClaimKind(root, index)).toBe("assumption");
  });

  it("terminates on a cycle rather than recursing forever", () => {
    const index = indexClaims([
      claim({ id: "a", kind: "fact", supportedBy: ["b"] }),
      claim({ id: "b", kind: "calculation", supportedBy: ["a"] }),
    ]);
    expect(effectiveClaimKind(index.get("a")!, index)).toBe("calculation");
  });
});

describe("derivation tracing", () => {
  const index = indexClaims([
    claim({ id: "gap", kind: "forecast", supportedBy: ["expiry", "continues"] }),
    claim({
      id: "expiry",
      kind: "fact",
      derivedFrom: [{ type: "grant", id: "grant-henderson" }],
    }),
    claim({
      id: "continues",
      kind: "assumption",
      assumptions: ["The programme continues at current scale."],
    }),
  ]);

  it("walks from a headline claim to the records beneath it", () => {
    const node = traceClaim(index.get("gap")!, index);
    expect(node.children).toHaveLength(2);
    expect(node.children.map((c) => c.claim.id)).toEqual(["expiry", "continues"]);
  });

  it("reports unresolved supports rather than dropping them", () => {
    const orphan = claim({ id: "x", supportedBy: ["missing-claim"] });
    const node = traceClaim(orphan, indexClaims([orphan]));
    expect(node.unresolved).toEqual(["missing-claim"]);
  });

  it("collects every referenced record across the chain", () => {
    const refs = tracedReferences(index.get("gap")!, index);
    expect(refs.map(refKey)).toContain("grant:grant-henderson");
  });

  it("surfaces assumptions made anywhere in the chain", () => {
    expect(tracedAssumptions(index.get("gap")!, index)).toContain(
      "The programme continues at current scale.",
    );
  });

  /** Slice B acceptance: any figure traces to evidence in five hops or fewer. */
  it("measures trace depth so the five-hop criterion is checkable", () => {
    expect(traceDepth(index.get("gap")!, index)).toBe(1);
  });
});

describe("confidence never promotes verification", () => {
  it("refuses to let an extractor mint a verified claim", () => {
    expect(() =>
      createClaim({
        id: "c1",
        organisationId: ORG,
        subject: { type: "organisation", id: ORG },
        predicate: "mission_statement",
        value: { type: "text", text: "Help young people into work" },
        text: "Help young people into work",
        kind: "fact",
        verification: "verified",
        confidence: 0.98,
        producedBy: { method: "extraction", extractionMethod: "json-ld", sourceId: "src-1" },
        now: NOW,
      }),
    ).toThrow(ClaimPromotionError);
  });

  it("refuses to let a model mint a provided claim", () => {
    expect(() =>
      createClaim({
        id: "c2",
        organisationId: ORG,
        subject: { type: "organisation", id: ORG },
        predicate: "summary",
        value: { type: "text", text: "A summary" },
        text: "A summary",
        kind: "fact",
        verification: "provided",
        producedBy: {
          method: "model",
          provider: "anthropic",
          model: "claude-sonnet-5",
          promptVersion: "2026-07-01",
        },
        now: NOW,
      }),
    ).toThrow(ClaimPromotionError);
  });

  it("allows a 1.0-confidence extraction, but only as ai_extracted", () => {
    const result = createClaim({
      id: "c3",
      organisationId: ORG,
      subject: { type: "organisation", id: ORG },
      predicate: "charity_number",
      value: { type: "text", text: "1234567" },
      text: "1234567",
      kind: "fact",
      confidence: 1,
      producedBy: { method: "extraction", extractionMethod: "json-ld", sourceId: "src-1" },
      now: NOW,
    });
    expect(result.verification).toBe("needs_review");
    expect(result.confidence).toBe(1);
  });
});

describe("claims are immutable", () => {
  const original = claim({ id: "orig", verification: "needs_review", verifiedBy: undefined, verifiedAt: undefined });

  it("confirming produces a new claim that supersedes the old one", () => {
    const next = confirmClaim(original, { actorId: "user-amara", at: NOW }, "new-1");
    expect(next.id).toBe("new-1");
    expect(next.supersedes).toBe("orig");
    expect(next.verification).toBe("verified");
    expect(next.verifiedBy).toBe("user-amara");
    // The original object is untouched.
    expect(original.verification).toBe("needs_review");
  });

  it("a correction yields `provided`, not `verified`, and drops stale confidence", () => {
    const withConfidence = claim({ id: "orig2", verification: "ai_extracted", confidence: 0.9, verifiedBy: undefined, verifiedAt: undefined });
    const next = correctClaim(
      withConfidence,
      { type: "number", number: 1300 },
      "1,300 young people",
      { actorId: "user-amara", at: NOW },
      "new-2",
    );
    // The value became the human's, not the source's.
    expect(next.verification).toBe("provided");
    expect(next.confidence).toBeUndefined();
  });

  it("a correction retains the original sources so the fix stays traceable", () => {
    const source: ClaimSource = {
      ref: { type: "research_source", id: "src-1" },
      authority: "discovery",
    };
    const withSource = claim({ id: "orig3", sources: [source], verifiedBy: undefined, verifiedAt: undefined });
    const next = correctClaim(
      withSource,
      { type: "text", text: "corrected" },
      "corrected",
      { actorId: "user-amara", at: NOW },
      "new-3",
    );
    expect(next.sources).toEqual([source]);
  });

  it("a superseded claim is no longer current", () => {
    expect(isCurrent(claim({ id: "a" }))).toBe(true);
    expect(isCurrent(claim({ id: "b", supersededBy: "c" }))).toBe(false);
    expect(isCurrent(claim({ id: "d", verification: "outdated" }))).toBe(false);
  });
});

describe("evidence strength", () => {
  const source = (
    id: string,
    authority: ClaimSource["authority"],
    retrievedAt?: string,
  ): ClaimSource => ({
    ref: { type: "evidence", id },
    authority,
    ...(retrievedAt ? { retrievedAt } : {}),
  });

  it("reports unsupported when no source is cited", () => {
    const result = assessEvidenceStrength(claim({ id: "a", sources: [] }), NOW);
    expect(result.level).toBe("unsupported");
    expect(result.score).toBe(0);
  });

  it("counts the same document cited twice as one independent source", () => {
    const result = assessEvidenceStrength(
      claim({
        id: "a",
        sources: [source("ev-1", "supporting", "2026-06-01"), source("ev-1", "supporting", "2026-06-01")],
      }),
      NOW,
    );
    expect(result.independentSources).toBe(1);
    expect(result.signals.some((s) => s.label === "Single source")).toBe(true);
  });

  it("rates a verified, corroborated, current claim as strong", () => {
    const result = assessEvidenceStrength(
      claim({
        id: "a",
        verification: "verified",
        sources: [
          source("ev-1", "regulator", "2026-06-01"),
          source("ev-2", "organisation", "2026-05-01"),
        ],
      }),
      NOW,
    );
    expect(result.level).toBe("strong");
  });

  it("penalises a stale source and says so", () => {
    const fresh = assessEvidenceStrength(
      claim({ id: "a", sources: [source("ev-1", "organisation", "2026-06-01")] }),
      NOW,
    );
    const stale = assessEvidenceStrength(
      claim({ id: "b", sources: [source("ev-1", "organisation", "2022-01-01")] }),
      NOW,
    );
    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.staleAfter).toBe("2022-01-01");
    expect(stale.signals.some((s) => s.label === "Stale")).toBe(true);
  });

  it("treats an unknown retrieval date as unknown, not as fresh", () => {
    const dated = assessEvidenceStrength(
      claim({ id: "a", sources: [source("ev-1", "organisation", "2026-06-01")] }),
      NOW,
    );
    const undatedResult = assessEvidenceStrength(
      claim({ id: "b", sources: [source("ev-1", "organisation")] }),
      NOW,
    );
    expect(undatedResult.score).toBeLessThan(dated.score);
    expect(undatedResult.signals.some((s) => s.label === "Age unknown")).toBe(true);
  });

  it("always returns reasons, never a bare grade", () => {
    const result = assessEvidenceStrength(
      claim({ id: "a", sources: [source("ev-1", "discovery")] }),
      NOW,
    );
    expect(result.signals.length).toBeGreaterThan(0);
    for (const signal of result.signals) {
      expect(signal.detail).toBeTruthy();
    }
  });
});

/**
 * Audit S2. The old `AIProvenance` could not be wrong, because a bare label
 * references nothing. These assert the property that replaced it.
 */
describe("observed grounding", () => {
  const offered: GroundingItem[] = [
    { ref: { type: "evidence", id: "ev-1" }, label: "Evaluation", value: "58% progressed" },
    { ref: { type: "indicator", id: "ind-1" }, label: "Supported", value: "168 of 240" },
  ];

  it("records only what was reported as used", () => {
    const result = observeGrounding({ offered, usedKeys: ["evidence:ev-1"] });
    expect(result.used.map(refKey)).toEqual(["evidence:ev-1"]);
    expect(result.unused.map(refKey)).toEqual(["indicator:ind-1"]);
  });

  it("rejects a reference that was never offered", () => {
    expect(() =>
      observeGrounding({ offered, usedKeys: ["evidence:ev-1", "evidence:ev-fabricated"] }),
    ).toThrow(GroundingViolationError);
  });

  it("names the fabricated references so the failure is diagnosable", () => {
    try {
      observeGrounding({ offered, usedKeys: ["grant:invented"] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as GroundingViolationError).fabricated).toEqual(["grant:invented"]);
    }
  });

  it("says so when nothing was drawn on", () => {
    const result = observeGrounding({ offered, usedKeys: [] });
    expect(result.used).toHaveLength(0);
    expect(result.couldNotVerify.join(" ")).toMatch(/does not draw on any specific record/i);
  });

  it("deduplicates repeated references", () => {
    const result = observeGrounding({
      offered,
      usedKeys: ["evidence:ev-1", "evidence:ev-1"],
    });
    expect(result.used).toHaveLength(1);
  });
});

/**
 * The deterministic matcher behind the mock provider's observed grounding.
 *
 * A false positive here reintroduces S2 by a different route: it attributes the
 * output to a record it never drew on. These pin the conservative behaviour so
 * a later "make matching smarter" change has to break a test to loosen it.
 */
describe("itemsMentionedIn is biased against false positives", () => {
  const item = (id: string, label: string, value: string): GroundingItem => ({
    ref: { type: "indicator", id },
    label,
    value,
  });

  it("matches content the output actually reproduced", () => {
    const offered = [item("i1", "Mission statement", "Help young people into work")];
    expect(itemsMentionedIn("We help young people into work across Leeds.", offered)).toEqual([
      "indicator:i1",
    ]);
  });

  it("does not match a bare number that happens to coincide", () => {
    // A figure of 2026 must not claim grounding in every sentence about 2026.
    const offered = [item("i1", "Target year", "2026")];
    expect(itemsMentionedIn("Delivery continues through 2026.", offered)).toEqual([]);
  });

  it("does not match a value that is only a substring of another word", () => {
    const offered = [item("i1", "Programme", "Aspire")];
    expect(itemsMentionedIn("We raise the aspirations of participants.", offered)).toEqual([]);
  });

  it("does not match on a short common value", () => {
    const offered = [item("i1", "Region", "Leeds")];
    expect(itemsMentionedIn("Leeds and Bradford delivery.", offered)).toEqual([]);
  });

  it("still matches a distinctive label even when the value does not appear", () => {
    const offered = [item("i1", "Youth Futures evaluation", "58% progressed")];
    expect(
      itemsMentionedIn("Findings draw on the Youth Futures evaluation.", offered),
    ).toEqual(["indicator:i1"]);
  });

  it("treats a percentage-only value as unprovable", () => {
    const offered = [item("i1", "Progression", "58%")];
    expect(itemsMentionedIn("Around 58% progressed into work.", offered)).toEqual([]);
  });
});
