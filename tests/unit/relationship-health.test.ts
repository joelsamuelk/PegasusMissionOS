import { describe, expect, it } from "vitest";
import type { Commitment, Interaction, Relationship } from "@/types/domain";
import {
  commitmentState,
  computeRelationshipHealth,
  type RelationshipHealthInput,
} from "@/lib/logic/relationship-health";

const NOW = new Date("2026-07-21T10:00:00Z");

function audit() {
  return { createdAt: "2025-01-01", updatedAt: "2025-01-01", archivedAt: null };
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "rel-1",
    organisationId: "org-1",
    externalOrganisationId: "xorg-1",
    status: "active",
    roles: ["funder"],
    tags: [],
    audit: audit(),
    ...overrides,
  };
}

/** `daysAgo` days before the fixed NOW, as an ISO instant. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function interactionAt(occurredAt: string, id = occurredAt): Interaction {
  return {
    id,
    organisationId: "org-1",
    type: "email",
    direction: "outbound",
    occurredAt,
    subject: "Update",
    personIds: [],
    externalOrganisationIds: ["xorg-1"],
    participantUserIds: [],
    links: [],
    source: "manual",
    audit: audit(),
  };
}

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: "com-1",
    organisationId: "org-1",
    title: "Send the evaluation",
    direction: "we_owe",
    status: "open",
    audit: audit(),
    ...overrides,
  };
}

function input(overrides: Partial<RelationshipHealthInput> = {}): RelationshipHealthInput {
  return {
    relationship: relationship(),
    interactions: [],
    commitments: [],
    activeFundingCount: 0,
    historicalFundingCount: 0,
    activePartnershipCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("commitmentState", () => {
  it("derives overdue from the due date rather than storing it", () => {
    expect(commitmentState(commitment({ dueAt: "2026-07-01" }), NOW)).toBe("overdue");
    expect(commitmentState(commitment({ dueAt: "2026-08-01" }), NOW)).toBe("open");
  });

  it("treats a commitment due today as still open, not overdue", () => {
    expect(commitmentState(commitment({ dueAt: "2026-07-21" }), NOW)).toBe("open");
  });

  it("never reports a closed commitment as overdue", () => {
    expect(
      commitmentState(commitment({ dueAt: "2020-01-01", status: "completed" }), NOW),
    ).toBe("completed");
    expect(
      commitmentState(commitment({ dueAt: "2020-01-01", status: "cancelled" }), NOW),
    ).toBe("cancelled");
  });

  it("leaves an open commitment with no due date open", () => {
    expect(commitmentState(commitment({ dueAt: undefined }), NOW)).toBe("open");
  });
});

describe("computeRelationshipHealth", () => {
  it("flags an overdue commitment ahead of every other signal", () => {
    // Everything else about this relationship is healthy: contact yesterday,
    // live funding, a long history. A broken promise still surfaces.
    const health = computeRelationshipHealth(
      input({
        interactions: [interactionAt(daysAgo(1))],
        commitments: [commitment({ dueAt: "2026-07-01" })],
        activeFundingCount: 1,
        historicalFundingCount: 3,
      }),
    );

    expect(health.state).toBe("needs_attention");
    expect(health.reason).toMatch(/past the agreed date/);
    expect(health.overdueCommitments).toBe(1);
  });

  it("flags live work that has gone quiet", () => {
    const health = computeRelationshipHealth(
      input({ interactions: [interactionAt(daysAgo(150))], activeFundingCount: 1 }),
    );

    expect(health.state).toBe("needs_attention");
    expect(health.reason).toMatch(/no contact for 150 days/);
  });

  it("does not flag a quiet relationship when there is no live work", () => {
    const health = computeRelationshipHealth(
      input({ interactions: [interactionAt(daysAgo(150))] }),
    );

    expect(health.state).not.toBe("needs_attention");
  });

  it("flags a missed next action", () => {
    const health = computeRelationshipHealth(
      input({
        relationship: relationship({
          nextAction: "Send the renewal proposal",
          nextActionAt: "2026-07-10",
        }),
        interactions: [interactionAt(daysAgo(5))],
      }),
    );

    expect(health.state).toBe("needs_attention");
    expect(health.reason).toMatch(/next action is 11 days overdue/);
  });

  it("reports established when there is a track record across engagements", () => {
    const health = computeRelationshipHealth(
      input({
        interactions: [interactionAt(daysAgo(40))],
        activeFundingCount: 1,
        historicalFundingCount: 1,
      }),
    );

    expect(health.state).toBe("established");
    expect(health.signals.map((s) => s.key)).toContain("historical_funding");
  });

  it("reports active for live work with recent contact", () => {
    const health = computeRelationshipHealth(
      input({ interactions: [interactionAt(daysAgo(5))], activeFundingCount: 1 }),
    );

    expect(health.state).toBe("active");
  });

  it("reports developing for a new relationship with no track record", () => {
    const health = computeRelationshipHealth(
      input({ interactions: [interactionAt(daysAgo(45))] }),
    );

    expect(health.state).toBe("developing");
  });

  it("reports dormant after a long silence with nothing live", () => {
    const health = computeRelationshipHealth(
      input({ interactions: [interactionAt(daysAgo(400))] }),
    );

    expect(health.state).toBe("dormant");
    expect(health.reason).toMatch(/no live funding or partnership/);
  });

  it("reports dormant when nothing has ever been recorded", () => {
    const health = computeRelationshipHealth(input());

    expect(health.state).toBe("dormant");
    expect(health.lastInteractionAt).toBeUndefined();
    expect(health.signals.find((s) => s.key === "recency")?.detail).toBe(
      "No interaction recorded",
    );
  });

  it("treats a former relationship as dormant regardless of history", () => {
    const health = computeRelationshipHealth(
      input({
        relationship: relationship({ status: "former" }),
        interactions: [interactionAt(daysAgo(1))],
        activeFundingCount: 2,
      }),
    );

    expect(health.state).toBe("dormant");
  });

  it("counts only the last year for interaction frequency", () => {
    const health = computeRelationshipHealth(
      input({
        interactions: [
          interactionAt(daysAgo(10), "a"),
          interactionAt(daysAgo(100), "b"),
          interactionAt(daysAgo(400), "c"),
        ],
      }),
    );

    expect(health.interactionsLastYear).toBe(2);
    expect(health.lastInteractionAt).toBe(daysAgo(10));
    expect(health.daysSinceLastInteraction).toBe(10);
  });

  it("lets a human override the state, and keeps the computed signals visible", () => {
    const health = computeRelationshipHealth(
      input({
        relationship: relationship({
          healthOverride: {
            state: "established",
            reason: "Chair has a standing relationship not captured here.",
            setBy: "user-amara",
            setAt: "2026-07-01T00:00:00Z",
          },
        }),
        interactions: [interactionAt(daysAgo(400))],
      }),
    );

    expect(health.state).toBe("established");
    expect(health.overridden).toBe(true);
    expect(health.reason).toMatch(/Chair has a standing relationship/);
    // The evidence that argued for dormant is still shown, so the override can
    // be reviewed rather than taken on trust.
    expect(health.signals.find((s) => s.key === "recency")?.effect).toBe("negative");
  });

  it("returns a signal for every input that influenced the state", () => {
    const health = computeRelationshipHealth(
      input({
        interactions: [interactionAt(daysAgo(5))],
        commitments: [commitment({ dueAt: "2026-09-01" })],
        activeFundingCount: 1,
        historicalFundingCount: 2,
        activePartnershipCount: 1,
      }),
    );

    const keys = health.signals.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "recency",
        "frequency",
        "active_funding",
        "historical_funding",
        "active_partnership",
        "open_commitments",
      ]),
    );
    // No opaque number is produced anywhere in the result.
    expect(health).not.toHaveProperty("score");
  });
});
