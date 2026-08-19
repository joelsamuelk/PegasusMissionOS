import { beforeEach, describe, expect, it } from "vitest";
import {
  createTwoTenantHarness,
  ORG_A,
  ORG_B,
  type TwoTenantHarness,
} from "../fixtures/two-tenant";
import { effectiveClaimKind, indexClaims, traceDepth } from "@/lib/knowledge";

/**
 * Claims carry the most consequential statements in the product — the figures
 * that reach funder reports. A cross-tenant leak here is worse than a leak of
 * raw records, because a claim is pre-packaged to be quoted.
 *
 * Structured like the existing isolation suites: listing, direct reference,
 * mutation, and the derivation traversal, which is the leak route unique to
 * this layer.
 */
describe("claim tenant isolation", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("fixture holds claims for both tenants", () => {
    expect(h.state.claims.some((c) => c.organisationId === ORG_A)).toBe(true);
    expect(h.state.claims.some((c) => c.organisationId === ORG_B)).toBe(true);
  });

  it("listing returns only the caller's claims", async () => {
    const a = await h.repo.claims.list(h.ctxA);
    const b = await h.repo.claims.list(h.ctxB);

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.every((c) => c.organisationId === ORG_A)).toBe(true);
    expect(b.every((c) => c.organisationId === ORG_B)).toBe(true);
  });

  it("a valid id from another tenant does not resolve", async () => {
    expect(await h.repo.claims.get(h.ctxA, "clm-beacon-1")).toBeNull();
    expect(await h.repo.claims.get(h.ctxB, "clm-participants-2025")).toBeNull();
  });

  it("subject queries do not cross the boundary", async () => {
    const leaked = await h.repo.claims.forSubject(h.ctxA, {
      type: "programme",
      id: "prog-beacon",
    });
    expect(leaked).toHaveLength(0);
  });

  it("`current` does not resolve another tenant's claim", async () => {
    const leaked = await h.repo.claims.current(
      h.ctxA,
      { type: "programme", id: "prog-beacon" },
      "participants_supported",
    );
    expect(leaked).toBeNull();
  });

  it("the support chain cannot traverse into another tenant", async () => {
    // Wire tenant A's claim to depend on tenant B's, simulating either a bug
    // or a hostile write. The traversal must still refuse to return it.
    const rootA = h.state.claims.find((c) => c.id === "clm-youth-gap-2027")!;
    rootA.supportedBy = [...rootA.supportedBy, "clm-beacon-1"];

    const chain = await h.repo.claims.supportChain(h.ctxA, "clm-youth-gap-2027");
    expect(chain.every((c) => c.organisationId === ORG_A)).toBe(true);
    expect(chain.map((c) => c.id)).not.toContain("clm-beacon-1");
  });

  it("usage records do not leak across the boundary", async () => {
    expect(await h.repo.claims.usages(h.ctxA, "clm-beacon-1")).toHaveLength(0);

    const usedInB = await h.repo.claims.usedIn(h.ctxA, {
      type: "impact_report",
      id: "report-beacon-1",
    });
    expect(usedInB).toHaveLength(0);
  });

  it("a usage may not cite another tenant's claim", async () => {
    await h.repo.claims.recordUsage(h.ctxA, {
      claimId: "clm-beacon-1",
      usedIn: { type: "impact_report", id: "report-a" },
    });
    expect(h.state.claimUsages.filter((u) => u.organisationId === ORG_A)).toHaveLength(0);
  });

  it("superseding another tenant's claim is refused", async () => {
    const beacon = h.state.claims.find((c) => c.id === "clm-beacon-1")!;
    const result = await h.repo.claims.supersede(h.ctxA, "clm-beacon-1", {
      ...beacon,
      id: "clm-attack",
    });

    expect(result).toBeNull();
    expect(beacon.supersededBy).toBeUndefined();
  });

  it("a created claim is stamped with the caller's organisation", async () => {
    const created = await h.repo.claims.create(h.ctxA, {
      subject: { type: "programme", id: "prog-youth" },
      predicate: "test_predicate",
      value: { type: "text", text: "x" },
      text: "x",
      kind: "fact",
      producedBy: { method: "human", actorId: "user-amara" },
    });

    expect(created.organisationId).toBe(ORG_A);
    expect(await h.repo.claims.get(h.ctxB, created.id)).toBeNull();
  });
});

/**
 * Slice B acceptance criterion 1: any figure traces to its evidence in five
 * hops or fewer. Asserted against the seeded chain rather than a synthetic one,
 * so it measures the shape the product actually ships with.
 */
describe("seeded derivation chain", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("the funding gap traces to grant records within five hops", async () => {
    const chain = await h.repo.claims.supportChain(h.ctxA, "clm-youth-gap-2027");
    const index = indexClaims(chain);
    const root = index.get("clm-youth-gap-2027")!;

    expect(traceDepth(root, index)).toBeLessThanOrEqual(5);
    expect(chain.map((c) => c.id)).toEqual(
      expect.arrayContaining(["clm-henderson-expiry", "clm-youth-continues"]),
    );
  });

  it("the gap is a forecast because it rests on an assumption", async () => {
    const chain = await h.repo.claims.supportChain(h.ctxA, "clm-youth-gap-2027");
    const index = indexClaims(chain);
    // Even had it been recorded as a calculation, the chain would downgrade it.
    expect(effectiveClaimKind(index.get("clm-youth-gap-2027")!, index)).toBe("forecast");
  });

  it("a verified fact names who verified it and when", async () => {
    const fact = await h.repo.claims.get(h.ctxA, "clm-participants-2025");
    expect(fact?.verification).toBe("verified");
    expect(fact?.verifiedBy).toBeTruthy();
    expect(fact?.verifiedAt).toBeTruthy();
    expect(fact?.sources[0]?.locator).toBe("page 14");
  });
});
