import { beforeEach, describe, expect, it } from "vitest";
import {
  createTwoTenantHarness,
  ORG_A,
  ORG_B,
  type TwoTenantHarness,
} from "../fixtures/two-tenant";
import {
  buildPersonView,
  buildProgrammeEcosystem,
  buildRelationshipPortfolio,
  buildRelationshipView,
} from "@/server/services/relationships";

/**
 * Tenant isolation for the relationship layer.
 *
 * This layer holds the most consequential data in the product: a funder
 * contact's address, what was said in a meeting, what one charity has promised
 * another. A leak here is worse than a leaked pipeline figure, so isolation is
 * asserted over every new method rather than inferred from the adapter's
 * general shape.
 */
describe("relationship tenant isolation", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  describe("fixture is non-vacuous", () => {
    it("holds relationship records for both tenants in the same state", () => {
      const { state } = h;
      for (const rows of [
        state.externalOrganisations,
        state.people,
        state.relationships,
        state.interactions,
        state.commitments,
        state.relationshipLinks,
      ]) {
        const tenants = new Set(rows.map((r) => r.organisationId));
        expect(tenants.has(ORG_A)).toBe(true);
        expect(tenants.has(ORG_B)).toBe(true);
      }
    });

    it("returns tenant B's own relationship records to tenant B", async () => {
      const { repo, ctxB } = h;
      expect((await repo.relationships.listOrganisations(ctxB)).map((o) => o.id)).toContain(
        "xorg-beacon-1",
      );
      expect(await repo.relationships.getPerson(ctxB, "per-beacon-1")).not.toBeNull();
      expect(await repo.relationships.get(ctxB, "rel-beacon-1")).not.toBeNull();
    });
  });

  describe("listing never crosses the boundary", () => {
    it("scopes every relationship list to the context organisation", async () => {
      const { repo, ctxA } = h;

      const lists = await Promise.all([
        repo.relationships.listOrganisations(ctxA),
        repo.relationships.listPeople(ctxA),
        repo.relationships.list(ctxA),
        repo.relationships.listInteractions(ctxA),
        repo.relationships.listCommitments(ctxA),
      ]);

      for (const rows of lists) {
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect((row as { organisationId: string }).organisationId).toBe(ORG_A);
        }
      }
    });

    it("does not leak tenant B communication content into tenant A", async () => {
      const { repo, ctxA } = h;

      const serialised = JSON.stringify([
        await repo.relationships.listInteractions(ctxA),
        await repo.relationships.listCommitments(ctxA),
        await repo.relationships.listPeople(ctxA),
        await repo.relationships.listOrganisations(ctxA),
      ]);

      expect(serialised).not.toContain("Beacon");
      expect(serialised).not.toContain("confidential@beacon-confidential.example");
    });
  });

  describe("direct object references are refused", () => {
    it("returns null when tenant A requests tenant B relationship records by id", async () => {
      const { repo, ctxA } = h;

      expect(await repo.relationships.getOrganisation(ctxA, "xorg-beacon-1")).toBeNull();
      expect(await repo.relationships.getPerson(ctxA, "per-beacon-1")).toBeNull();
      expect(await repo.relationships.get(ctxA, "rel-beacon-1")).toBeNull();
      expect(await repo.relationships.forOrganisation(ctxA, "xorg-beacon-1")).toBeNull();
      expect(await repo.relationships.forPerson(ctxA, "per-beacon-1")).toBeNull();
      expect(await repo.relationships.funderForOrganisation(ctxA, "xorg-beacon-1")).toBeNull();
      expect(await repo.relationships.organisationForFunder(ctxA, "funder-beacon-1")).toBeNull();
    });

    it("returns no children for another tenant's parent id", async () => {
      const { repo, ctxA } = h;

      expect(await repo.relationships.peopleForOrganisation(ctxA, "xorg-beacon-1")).toEqual([]);
      expect(await repo.relationships.links(ctxA, "rel-beacon-1")).toEqual([]);
      expect(
        await repo.relationships.interactionsFor(ctxA, {
          externalOrganisationId: "xorg-beacon-1",
          personIds: ["per-beacon-1"],
        }),
      ).toEqual([]);
      expect(
        await repo.relationships.commitmentsFor(ctxA, {
          externalOrganisationId: "xorg-beacon-1",
          personIds: ["per-beacon-1"],
        }),
      ).toEqual([]);
    });

    it("does not return tenant B links when both tenants link the same entity id", async () => {
      // Both fixtures link a relationship to `prog-youth`. Filtering on the
      // entity id alone would leak; filtering on tenant as well does not.
      const { repo, ctxA } = h;

      const links = await repo.relationships.linksForEntity(ctxA, {
        type: "programme",
        id: "prog-youth",
      });

      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l) => l.organisationId === ORG_A)).toBe(true);
      expect(links.some((l) => l.relationshipId === "rel-beacon-1")).toBe(false);
    });
  });

  describe("mutations cannot cross the boundary", () => {
    it("refuses to complete tenant B's commitment from tenant A's context", async () => {
      const { repo, ctxA, ctxB } = h;

      await repo.relationships.setCommitmentStatus(ctxA, "com-beacon-1", "completed");

      const commitments = await repo.relationships.listCommitments(ctxB);
      expect(commitments.find((c) => c.id === "com-beacon-1")?.status).toBe("open");
    });

    it("stamps a logged interaction with the acting tenant", async () => {
      const { repo, ctxB, ctxA } = h;

      const id = await repo.relationships.logInteraction(ctxB, {
        type: "call",
        direction: "outbound",
        occurredAt: "2026-07-20T10:00:00Z",
        subject: "Tenant B call",
        personIds: ["per-beacon-1"],
        externalOrganisationIds: ["xorg-beacon-1"],
        participantUserIds: [],
        links: [],
        source: "manual",
      });

      const forB = await repo.relationships.listInteractions(ctxB);
      const forA = await repo.relationships.listInteractions(ctxA);
      expect(forB.find((i) => i.id === id)?.organisationId).toBe(ORG_B);
      expect(forA.some((i) => i.id === id)).toBe(false);
    });

    it("drops participants belonging to another tenant instead of storing the pointer", async () => {
      const { repo, ctxA } = h;

      const id = await repo.relationships.logInteraction(ctxA, {
        type: "email",
        direction: "outbound",
        occurredAt: "2026-07-20T10:00:00Z",
        subject: "Attempted cross-tenant reference",
        // Tenant B ids supplied deliberately.
        personIds: ["per-beacon-1"],
        externalOrganisationIds: ["xorg-beacon-1"],
        participantUserIds: [],
        links: [],
        source: "manual",
      });

      const stored = (await repo.relationships.listInteractions(ctxA)).find((i) => i.id === id);
      expect(stored?.personIds).toEqual([]);
      expect(stored?.externalOrganisationIds).toEqual([]);
    });

    it("drops a cross-tenant counterparty when creating a commitment", async () => {
      const { repo, ctxA } = h;

      const id = await repo.relationships.createCommitment(ctxA, {
        title: "Attempted cross-tenant commitment",
        direction: "we_owe",
        externalOrganisationId: "xorg-beacon-1",
        personId: "per-beacon-1",
        status: "open",
      });

      const stored = (await repo.relationships.listCommitments(ctxA)).find((c) => c.id === id);
      expect(stored?.organisationId).toBe(ORG_A);
      expect(stored?.externalOrganisationId).toBeUndefined();
      expect(stored?.personId).toBeUndefined();
    });
  });

  describe("assembled views obey the same boundary", () => {
    it("refuses to assemble a relationship view for another tenant's organisation", async () => {
      expect(await buildRelationshipView(h.ctxA, h.repo, "xorg-beacon-1")).toBeNull();
      expect(await buildPersonView(h.ctxA, h.repo, "per-beacon-1")).toBeNull();
    });

    it("keeps tenant B out of tenant A's portfolio entirely", async () => {
      const portfolio = await buildRelationshipPortfolio(h.ctxA, h.repo);
      const serialised = JSON.stringify(portfolio);

      expect(serialised).not.toContain("Beacon");
      expect(portfolio.summaries.every((s) => s.organisation.organisationId === ORG_A)).toBe(
        true,
      );
    });

    it("keeps a shared programme id from leaking a partner across tenants", async () => {
      const ecosystem = await buildProgrammeEcosystem(h.ctxA, h.repo, "prog-youth");

      expect(ecosystem.length).toBeGreaterThan(0);
      expect(ecosystem.every((e) => e.organisation.organisationId === ORG_A)).toBe(true);
      expect(JSON.stringify(ecosystem)).not.toContain("Beacon");
    });

    it("gives tenant B its own view of its own records", async () => {
      const view = await buildRelationshipView(h.ctxB, h.repo, "xorg-beacon-1");
      expect(view?.organisation.name).toBe("Beacon Confidential Foundation");
      expect(view?.people.map((p) => p.id)).toEqual(["per-beacon-1"]);
    });
  });
});
