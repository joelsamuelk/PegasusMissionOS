import { beforeEach, describe, expect, it } from "vitest";
import { createStoreState, type StoreState } from "@/features/store";
import { createRequestContext } from "@/server/context/request-context";
import { createInMemoryRepository } from "@/server/data/in-memory/adapter";
import type { MissionRepository } from "@/server/data/types";
import {
  buildPersonView,
  buildProgrammeEcosystem,
  buildRelationshipPortfolio,
  buildRelationshipView,
} from "@/server/services/relationships";

/**
 * The product acceptance test: "What's happening with The Henderson Trust?"
 *
 * The user should not have to search email, a CRM, a funding spreadsheet, a
 * grant tracker, finance, programme management, impact reports or somebody's
 * memory. One call assembles it — and every number it produces has to come
 * from a record, which is what these assertions check.
 */
const NOW = new Date("2026-07-21T10:00:00Z");

function harness(): { repo: MissionRepository; state: StoreState; ctx: ReturnType<typeof createRequestContext> } {
  const state = createStoreState();
  return {
    state,
    repo: createInMemoryRepository(state),
    ctx: createRequestContext({
      organisationId: "org-northstar",
      userId: "user-amara",
      role: "owner",
      now: () => NOW,
    }),
  };
}

describe("relationship view — The Henderson Trust", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("assembles funding, people, programmes, reporting and commitments in one pass", async () => {
    const view = await buildRelationshipView(h.ctx, h.repo, "xorg-henderson");
    expect(view).not.toBeNull();
    if (!view) return;

    // Funding, reached through the funder bridge rather than duplicated.
    expect(view.funder?.id).toBe("fnd-henderson");
    expect(view.grants.map((g) => g.id).sort()).toEqual([
      "grant-henderson",
      "grant-henderson-2022",
    ]);
    expect(view.totalFunding).toBe(95000 + 75000);
    expect(view.activeFunding).toBe(95000);

    // People, programmes and reporting, each from their own module.
    expect(view.people.map((p) => p.id)).toEqual(["per-daniel"]);
    expect(view.programmes.map((p) => p.id)).toContain("prog-youth");
    expect(view.grantReports.map((r) => r.id)).toContain("rep-1");

    // Commitments in both directions.
    expect(view.openCommitments.map((c) => c.id).sort()).toEqual(["com-hen-1", "com-hen-2"]);
    expect(view.openCommitments.find((c) => c.id === "com-hen-2")?.direction).toBe("they_owe");
  });

  it("reads a track record of two grants since 2022 as established, not asserted", async () => {
    const view = await buildRelationshipView(h.ctx, h.repo, "xorg-henderson");

    expect(view?.health.state).toBe("established");
    expect(view?.health.daysSinceLastInteraction).toBe(40);
    expect(view?.health.signals.find((s) => s.key === "historical_funding")?.detail).toBe(
      "1 previous grant",
    );
  });

  it("builds a timeline projected from records, each traceable to its source", async () => {
    const view = await buildRelationshipView(h.ctx, h.repo, "xorg-henderson");
    const timeline = view?.timeline ?? [];

    expect(timeline.length).toBeGreaterThan(5);
    // Newest first.
    const dates = timeline.map((e) => e.at);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);

    // Both grants, the received payments and the introduction all appear.
    expect(timeline.filter((e) => e.kind === "grant_awarded")).toHaveLength(2);
    expect(timeline.filter((e) => e.kind === "grant_payment")).toHaveLength(4);
    expect(timeline.some((e) => e.title === "Introduction")).toBe(true);

    // Provenance on every line.
    for (const event of timeline) {
      expect(event.source.type).toBeTruthy();
      expect(event.source.id).toBeTruthy();
    }
  });

  it("produces a brief whose every line is sourced, and names what is missing", async () => {
    const view = await buildRelationshipView(h.ctx, h.repo, "xorg-henderson");
    const brief = view?.brief;
    expect(brief).toBeDefined();
    if (!brief) return;

    for (const section of brief.sections) {
      for (const line of section.lines) {
        expect(line.sources.length).toBeGreaterThan(0);
      }
    }

    // The outstanding evaluation is the thing to close out before a meeting.
    expect(
      brief.discussionPoints.some((p) => p.value.includes("2026 interim evaluation")),
    ).toBe(true);
    // The report due on 1 August is surfaced from the grant report record.
    expect(
      brief.sections
        .find((s) => s.key === "reporting")
        ?.lines.some((l) => l.label.includes("Six-monthly")),
    ).toBe(true);
    expect(brief.headline).toContain("The Henderson Trust");
  });

  it("does not invent a relationship start date it does not hold", async () => {
    // Remove the recorded start date and check the brief says so rather than
    // guessing from the first interaction.
    const relationship = h.state.relationships.find((r) => r.id === "rel-henderson");
    if (relationship) relationship.startedAt = undefined;

    const view = await buildRelationshipView(h.ctx, h.repo, "xorg-henderson");
    expect(view?.brief.missing).toContain(
      "The date this relationship began has not been recorded.",
    );
  });

  it("returns null for an organisation that does not exist", async () => {
    expect(await buildRelationshipView(h.ctx, h.repo, "xorg-nope")).toBeNull();
  });
});

describe("relationship portfolio", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("counts only what the records support", async () => {
    const portfolio = await buildRelationshipPortfolio(h.ctx, h.repo);

    const funderRelationships = h.state.relationships.filter(
      (r) => r.externalOrganisationId && r.status === "active" && r.roles.includes("funder"),
    );
    expect(portfolio.counts.activeFunders).toBe(funderRelationships.length);

    const openCommitments = h.state.commitments.filter((c) => c.status === "open").length;
    expect(portfolio.counts.openCommitments).toBe(openCommitments);
  });

  it("lists organisation relationships only, so people are not double-counted", async () => {
    const portfolio = await buildRelationshipPortfolio(h.ctx, h.repo);
    expect(portfolio.summaries.every((s) => Boolean(s.relationship.externalOrganisationId))).toBe(
      true,
    );
  });

  it("surfaces overdue promises and long silences, and nothing else", async () => {
    const portfolio = await buildRelationshipPortfolio(h.ctx, h.repo);

    expect(portfolio.needsAttention.length).toBeGreaterThan(0);
    for (const summary of portfolio.needsAttention) {
      expect(summary.health.state).toBe("needs_attention");
      // Every entry can say why it is there.
      expect(summary.health.reason.length).toBeGreaterThan(10);
    }

    // A dormant prospect with nothing outstanding is *not* an alert. Silence
    // where nothing was promised is not a problem to chase.
    expect(portfolio.needsAttention.map((s) => s.organisation.id)).not.toContain("xorg-weston");
  });

  it("ranks the most overdue relationships first", async () => {
    const portfolio = await buildRelationshipPortfolio(h.ctx, h.repo);
    const overdue = portfolio.needsAttention.map((s) => s.overdueCommitmentCount);
    expect([...overdue].sort((a, b) => b - a)).toEqual(overdue);
  });
});

describe("person view", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("carries the person's own history, not the organisation's", async () => {
    const view = await buildPersonView(h.ctx, h.repo, "per-daniel");
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.organisation?.id).toBe("xorg-henderson");
    expect(view.interactions.length).toBeGreaterThan(0);
    expect(view.interactions.every((i) => i.personIds.includes("per-daniel"))).toBe(true);
    expect(view.openCommitments.map((c) => c.id)).toContain("com-hen-1");
  });

  it("resolves connected entities to real record names, never raw ids", async () => {
    const view = await buildPersonView(h.ctx, h.repo, "per-daniel");
    const labels = view?.connectedEntities.map((e) => e.label) ?? [];

    expect(labels).toContain("Youth Futures programme grant");
    expect(labels).toContain("Youth Futures");
    expect(labels.some((l) => l.startsWith("grant-") || l.startsWith("prog-"))).toBe(false);
  });

  it("judges a funder contact against their organisation's live work", async () => {
    // The grant hangs off the organisation, not the individual. Ignoring that
    // would report a four-year funder contact as merely "developing".
    const view = await buildPersonView(h.ctx, h.repo, "per-daniel");
    expect(view?.health.state).toBe("established");
  });

  it("returns null for an unknown person", async () => {
    expect(await buildPersonView(h.ctx, h.repo, "per-nope")).toBeNull();
  });
});

describe("programme ecosystem", () => {
  it("names delivery, referral and evaluation partners from relationship links", async () => {
    const h = harness();
    const ecosystem = await buildProgrammeEcosystem(h.ctx, h.repo, "prog-youth");

    const byName = new Map(ecosystem.map((e) => [e.organisation.name, e]));
    expect(byName.get("Leeds City College")?.role).toBe("delivery_partner");
    expect(byName.get("Bradford Works")?.role).toBe("referral_partner");
    expect(byName.get("Pennine University")?.role).toBe("evaluator");
    expect(byName.get("The Henderson Trust")?.role).toBe("funder");

    // Every entry links to a real relationship record with a contact where one
    // exists — not a string in `Programme.deliveryPartners`.
    expect(byName.get("Leeds City College")?.primaryContact?.lastName).toBe("Reid");
  });

  it("returns nothing for a programme with no recorded partners", async () => {
    const h = harness();
    expect(await buildProgrammeEcosystem(h.ctx, h.repo, "prog-nope")).toEqual([]);
  });
});
