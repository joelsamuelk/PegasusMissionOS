import { beforeEach, describe, expect, it } from "vitest";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data/types";

/**
 * The repository contract.
 *
 * Every adapter must satisfy this suite. It is written once and run against
 * each implementation, so "the Supabase adapter behaves like the in-memory one"
 * is a executed claim rather than a hope.
 *
 * It asserts **behaviour a caller depends on**, not the full method surface.
 * Exercising all 67 methods would mostly re-test that a getter returns rows;
 * what actually breaks a second adapter is the shared semantics:
 *
 *   1. Tenant scoping on every read *and* write.
 *   2. A missing or cross-tenant id resolves to `null`, never throws.
 *   3. Writes that cannot be attributed are refused rather than applied loosely.
 *   4. Claims are immutable and supersede rather than update.
 *   5. Records carry the request clock, not the server's wall clock.
 *
 * A Postgres adapter fails these differently from an in-memory one — a missing
 * `.eq('organisation_id', …)` leaks where an in-memory `scoped()` would not, and
 * RLS masks the mistake in one environment while a service-role key exposes it
 * in another. That is exactly why the suite is shared rather than duplicated.
 */

export interface ContractHarness {
  repo: MissionRepository;
  /** Two tenants. Isolation is untestable with one. */
  ctxA: RequestContext;
  ctxB: RequestContext;
  /** Ids that exist in tenant A's fixture. */
  fixtures: {
    opportunityId: string;
    applicationId: string;
    answerId: string;
    grantId: string;
    programmeId: string;
    indicatorId: string;
    evidenceId: string;
    reportId: string;
    claimId: string;
  };
  /** Ids that exist, but belong to tenant B. */
  foreign: {
    opportunityId: string;
    grantId: string;
    evidenceId: string;
    claimId: string;
  };
  /** Release any resources. Called after each test. */
  teardown?: () => Promise<void> | void;
}

export type HarnessFactory = () => Promise<ContractHarness> | ContractHarness;

/**
 * Run the contract against one adapter.
 *
 * @param adapterName Appears in test output so a failure names the adapter.
 */
export function describeRepositoryContract(
  adapterName: string,
  createHarness: HarnessFactory,
): void {
  describe(`repository contract: ${adapterName}`, () => {
    let h: ContractHarness;

    beforeEach(async () => {
      h = await createHarness();
      return async () => {
        await h.teardown?.();
      };
    });

    /**
     * Guards the rest of the suite. Almost every assertion below is negative
     * ("tenant A sees nothing of tenant B"), and negatives pass trivially
     * against an empty database.
     */
    describe("the harness is non-vacuous", () => {
      it("tenant A can read its own records", async () => {
        const { repo, ctxA, fixtures } = h;

        expect(await repo.funding.getOpportunity(ctxA, fixtures.opportunityId)).toBeTruthy();
        expect(await repo.applications.get(ctxA, fixtures.applicationId)).toBeTruthy();
        expect(await repo.grants.get(ctxA, fixtures.grantId)).toBeTruthy();
        expect(await repo.programmes.get(ctxA, fixtures.programmeId)).toBeTruthy();
        expect(await repo.evidence.get(ctxA, fixtures.evidenceId)).toBeTruthy();
        expect(await repo.reports.get(ctxA, fixtures.reportId)).toBeTruthy();
        expect(await repo.claims.get(ctxA, fixtures.claimId)).toBeTruthy();
      });

      it("tenant B holds records of its own", async () => {
        const { repo, ctxB, foreign } = h;

        expect(await repo.funding.getOpportunity(ctxB, foreign.opportunityId)).toBeTruthy();
        expect(await repo.grants.get(ctxB, foreign.grantId)).toBeTruthy();
        expect(await repo.claims.get(ctxB, foreign.claimId)).toBeTruthy();
      });
    });

    describe("listing never crosses the tenant boundary", () => {
      it("every listed record belongs to the caller", async () => {
        const { repo, ctxA, ctxB } = h;

        const collections: [string, { organisationId: string }[]][] = [
          ["opportunities", await repo.funding.listOpportunities(ctxA)],
          ["funders", await repo.funding.listFunders(ctxA)],
          ["applications", await repo.applications.list(ctxA)],
          ["grants", await repo.grants.list(ctxA)],
          ["programmes", await repo.programmes.list(ctxA)],
          ["indicators", await repo.programmes.allIndicators(ctxA)],
          ["evidence", await repo.evidence.list(ctxA)],
          ["reports", await repo.reports.list(ctxA)],
          ["claims", await repo.claims.list(ctxA)],
          ["tasks", await repo.workspace.tasks(ctxA)],
          ["notifications", await repo.workspace.notifications(ctxA)],
          ["activity", await repo.workspace.activity(ctxA)],
          ["audit", await repo.audit.list(ctxA)],
          ["relationships", await repo.relationships.list(ctxA)],
          ["people", await repo.relationships.listPeople(ctxA)],
          ["interactions", await repo.relationships.listInteractions(ctxA)],
          ["commitments", await repo.relationships.listCommitments(ctxA)],
        ];

        for (const [name, rows] of collections) {
          for (const row of rows) {
            expect(row.organisationId, `${name} leaked a row`).toBe(ctxA.organisationId);
          }
        }
        // And the two contexts genuinely differ, or the above proves nothing.
        expect(ctxA.organisationId).not.toBe(ctxB.organisationId);
      });
    });

    /**
     * Insecure direct object reference: the caller supplies a real id that
     * belongs to someone else. This is the failure a `WHERE id = $1` without a
     * tenant predicate produces, and it is invisible in a single-tenant demo.
     */
    describe("a valid id from another tenant resolves to null", () => {
      it("does not resolve across the boundary, and does not throw", async () => {
        const { repo, ctxA, foreign } = h;

        expect(await repo.funding.getOpportunity(ctxA, foreign.opportunityId)).toBeNull();
        expect(await repo.grants.get(ctxA, foreign.grantId)).toBeNull();
        expect(await repo.evidence.get(ctxA, foreign.evidenceId)).toBeNull();
        expect(await repo.claims.get(ctxA, foreign.claimId)).toBeNull();
      });

      it("an id that exists nowhere resolves to null too", async () => {
        const { repo, ctxA } = h;
        // Same answer for "not yours" and "not there": a caller must not be
        // able to probe another tenant's id space by comparing responses.
        expect(await repo.funding.getOpportunity(ctxA, "does-not-exist")).toBeNull();
        expect(await repo.grants.get(ctxA, "does-not-exist")).toBeNull();
        expect(await repo.claims.get(ctxA, "does-not-exist")).toBeNull();
      });
    });

    describe("writes cannot reach across the boundary", () => {
      it("a mutation against another tenant's record changes nothing", async () => {
        const { repo, ctxA, ctxB, foreign } = h;

        const before = await repo.funding.getOpportunity(ctxB, foreign.opportunityId);
        await repo.funding.moveStage(ctxA, foreign.opportunityId, "successful");
        const after = await repo.funding.getOpportunity(ctxB, foreign.opportunityId);

        expect(after?.stage).toBe(before?.stage);
      });

      it("a created record is stamped with the caller's organisation", async () => {
        const { repo, ctxA, ctxB } = h;

        const id = await repo.evidence.add(ctxA, {
          title: "Contract test evidence",
          type: "statistic",
          description: "Created by the shared contract suite.",
          tags: [],
        });

        expect((await repo.evidence.get(ctxA, id))?.organisationId).toBe(ctxA.organisationId);
        // And is invisible to the other tenant.
        expect(await repo.evidence.get(ctxB, id)).toBeNull();
      });

      it("a claim usage may not cite another tenant's claim", async () => {
        const { repo, ctxA, foreign } = h;

        await repo.claims.recordUsage(ctxA, {
          claimId: foreign.claimId,
          usedIn: { type: "impact_report", id: "any" },
        });

        expect(await repo.claims.usages(ctxA, foreign.claimId)).toHaveLength(0);
      });

      it("superseding another tenant's claim is refused", async () => {
        const { repo, ctxA, ctxB, foreign } = h;

        const target = await repo.claims.get(ctxB, foreign.claimId);
        expect(target).toBeTruthy();

        const result = await repo.claims.supersede(ctxA, foreign.claimId, {
          ...target!,
          id: "contract-attack",
        });

        expect(result).toBeNull();
        expect((await repo.claims.get(ctxB, foreign.claimId))?.supersededBy).toBeUndefined();
      });
    });

    describe("claims are immutable", () => {
      it("superseding writes a new claim and links the predecessor", async () => {
        const { repo, ctxA, fixtures } = h;

        const original = await repo.claims.get(ctxA, fixtures.claimId);
        expect(original).toBeTruthy();

        const next = await repo.claims.supersede(ctxA, fixtures.claimId, {
          ...original!,
          id: "contract-successor",
          text: "A corrected statement.",
        });

        expect(next?.supersedes).toBe(fixtures.claimId);
        expect((await repo.claims.get(ctxA, fixtures.claimId))?.supersededBy).toBe(next?.id);
        // The predecessor's own value is untouched: history is not rewritten.
        expect((await repo.claims.get(ctxA, fixtures.claimId))?.text).toBe(original!.text);
      });

      it("a superseded claim is no longer the current one", async () => {
        const { repo, ctxA, fixtures } = h;

        const original = (await repo.claims.get(ctxA, fixtures.claimId))!;
        await repo.claims.supersede(ctxA, fixtures.claimId, {
          ...original,
          id: "contract-successor-2",
        });

        const current = await repo.claims.current(
          ctxA,
          original.subject,
          original.predicate,
        );
        expect(current?.id).not.toBe(fixtures.claimId);
      });

      it("the support chain stays within the tenant", async () => {
        const { repo, ctxA, fixtures } = h;
        const chain = await repo.claims.supportChain(ctxA, fixtures.claimId);
        for (const claim of chain) {
          expect(claim.organisationId).toBe(ctxA.organisationId);
        }
      });
    });

    /**
     * Audit ordering was broken for three slices by a frozen module constant.
     * An adapter that stamps rows with `now()` in SQL rather than the request
     * clock reintroduces it in a form unit tests would not otherwise catch.
     */
    describe("records carry the request clock", () => {
      it("an audited mutation is stamped from the context, not the wall clock", async () => {
        const { repo, ctxA, fixtures } = h;

        const before = await repo.audit.list(ctxA);
        await repo.programmes.updateIndicator(ctxA, fixtures.indicatorId, 99, "contract");
        const after = await repo.audit.list(ctxA);

        expect(after.length).toBeGreaterThan(before.length);

        const written = after.find((e) => !before.some((b) => b.id === e.id));
        expect(written).toBeTruthy();
        expect(new Date(written!.createdAt).getTime()).toBe(ctxA.now().getTime());
      });
    });

    describe("every method is asynchronous", () => {
      it("reads return promises rather than values", () => {
        const { repo, ctxA } = h;
        // A synchronous adapter would satisfy the types but break the moment a
        // network-backed one replaced it, which is the whole point of the seam.
        expect(repo.funding.listOpportunities(ctxA)).toBeInstanceOf(Promise);
        expect(repo.claims.list(ctxA)).toBeInstanceOf(Promise);
        expect(repo.organisations.get(ctxA)).toBeInstanceOf(Promise);
      });
    });
  });
}
