import { describe, expect, it } from "vitest";
import type {
  Application,
  Commitment,
  Grant,
  GrantPayment,
  GrantReport,
  Interaction,
  Relationship,
} from "@/types/domain";
import {
  buildRelationshipTimeline,
  type TimelineInput,
} from "@/lib/logic/relationship-timeline";

const NOW = new Date("2026-07-21T10:00:00Z");

function audit(createdAt = "2025-01-01", updatedAt = createdAt) {
  return { createdAt, updatedAt, archivedAt: null };
}

const relationship: Relationship = {
  id: "rel-1",
  organisationId: "org-1",
  externalOrganisationId: "xorg-1",
  status: "active",
  roles: ["funder"],
  startedAt: "2022-01-18",
  tags: [],
  audit: audit(),
};

const grant: Grant = {
  id: "grant-1",
  organisationId: "org-1",
  funderId: "fnd-1",
  title: "Youth Futures programme grant",
  awardValue: 95000,
  currency: "GBP",
  restricted: true,
  startDate: "2025-04-01",
  endDate: "2027-03-31",
  spentToDate: 41000,
  conditions: [],
  status: "active",
  audit: audit(),
};

const interaction: Interaction = {
  id: "int-1",
  organisationId: "org-1",
  type: "email",
  direction: "inbound",
  occurredAt: "2026-06-11T09:12:00Z",
  subject: "Request for the updated evaluation",
  summary: "Daniel asked for the 2026 interim evaluation.",
  personIds: ["per-1"],
  externalOrganisationIds: ["xorg-1"],
  participantUserIds: [],
  links: [],
  source: "manual",
  audit: audit(),
};

function input(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    relationship,
    interactions: [],
    grants: [],
    payments: [],
    grantReports: [],
    applications: [],
    impactReports: [],
    commitments: [],
    tasks: [],
    now: NOW,
    ...overrides,
  };
}

describe("buildRelationshipTimeline", () => {
  it("returns nothing when there is nothing to project", () => {
    const events = buildRelationshipTimeline(
      input({ relationship: { ...relationship, startedAt: undefined } }),
    );
    expect(events).toEqual([]);
  });

  it("orders events newest first", () => {
    const events = buildRelationshipTimeline(
      input({ interactions: [interaction], grants: [grant] }),
    );

    expect(events.map((e) => e.kind)).toEqual([
      "interaction",
      "grant_awarded",
      "relationship_started",
    ]);
    const dates = events.map((e) => e.at);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it("carries provenance back to the record each event came from", () => {
    const events = buildRelationshipTimeline(
      input({ interactions: [interaction], grants: [grant] }),
    );

    expect(events.find((e) => e.kind === "interaction")?.source).toEqual({
      type: "interaction",
      id: "int-1",
    });
    expect(events.find((e) => e.kind === "grant_awarded")?.source).toEqual({
      type: "grant",
      id: "grant-1",
    });
    // Every event is traceable — none is a free-floating narrative line.
    expect(events.every((e) => Boolean(e.source.id))).toBe(true);
  });

  it("projects only payments that were actually received", () => {
    const payments: GrantPayment[] = [
      { id: "pay-1", grantId: "grant-1", organisationId: "org-1", label: "Year 1", amount: 47500, dueDate: "2025-04-15", received: true },
      { id: "pay-2", grantId: "grant-1", organisationId: "org-1", label: "Year 3", amount: 47500, dueDate: "2027-04-15", received: false },
    ];

    const events = buildRelationshipTimeline(input({ grants: [grant], payments }));
    const paymentEvents = events.filter((e) => e.kind === "grant_payment");

    // A scheduled payment is a plan, not a thing that happened.
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0]?.detail).toContain("£47,500");
  });

  it("projects only submitted reports", () => {
    const reports: GrantReport[] = [
      { id: "rep-1", grantId: "grant-1", organisationId: "org-1", title: "Six-monthly report", dueDate: "2026-02-01", status: "submitted" },
      { id: "rep-2", grantId: "grant-1", organisationId: "org-1", title: "Next report", dueDate: "2026-08-01", status: "drafting" },
    ];

    const events = buildRelationshipTimeline(input({ grantReports: reports }));
    const reportEvents = events.filter((e) => e.kind === "grant_report");

    expect(reportEvents).toHaveLength(1);
    expect(reportEvents[0]?.detail).toBe("Six-monthly report");
  });

  it("distinguishes a submitted application from one still being written", () => {
    const applications: Application[] = [
      {
        id: "app-1",
        organisationId: "org-1",
        opportunityId: "opp-1",
        title: "Submitted bid",
        status: "successful",
        contributorIds: [],
        reviewerIds: [],
        requiredDocuments: [],
        submissionChecklist: [],
        audit: audit("2026-01-01", "2026-03-01"),
      },
      {
        id: "app-2",
        organisationId: "org-1",
        opportunityId: "opp-2",
        title: "Draft bid",
        status: "in_progress",
        contributorIds: [],
        reviewerIds: [],
        requiredDocuments: [],
        submissionChecklist: [],
        audit: audit("2026-06-01", "2026-07-01"),
      },
    ];

    const events = buildRelationshipTimeline(input({ applications }));

    expect(events.find((e) => e.detail === "Submitted bid")?.title).toBe(
      "Application submitted",
    );
    expect(events.find((e) => e.detail === "Draft bid")?.title).toBe("Application started");
    // The submitted bid is dated when it moved, not when it was created.
    expect(events.find((e) => e.detail === "Submitted bid")?.at).toBe("2026-03-01");
  });

  it("marks overdue commitments as needing attention and completed ones as positive", () => {
    const commitments: Commitment[] = [
      {
        id: "com-1",
        organisationId: "org-1",
        title: "Send the evaluation",
        direction: "we_owe",
        dueAt: "2026-07-01",
        status: "open",
        audit: audit("2026-06-11"),
      },
      {
        id: "com-2",
        organisationId: "org-1",
        title: "Share case studies",
        direction: "we_owe",
        dueAt: "2026-05-16",
        status: "completed",
        completedAt: "2026-05-09",
        audit: audit("2026-04-22", "2026-05-09"),
      },
    ];

    const events = buildRelationshipTimeline(input({ commitments }));

    expect(events.find((e) => e.detail === "Send the evaluation")?.tone).toBe("attention");
    const completed = events.find((e) => e.detail === "Share case studies");
    expect(completed?.tone).toBe("positive");
    // Dated when it was completed, not when it was created.
    expect(completed?.at).toBe("2026-05-09");
  });

  it("shows direction on an outstanding commitment", () => {
    const events = buildRelationshipTimeline(
      input({
        commitments: [
          {
            id: "com-3",
            organisationId: "org-1",
            title: "Confirm the payment schedule",
            direction: "they_owe",
            dueAt: "2026-09-15",
            status: "open",
            audit: audit("2026-06-11"),
          },
        ],
      }),
    );

    expect(events[0]?.title).toBe("They committed");
  });

  it("labels email direction so a received email is not confused with a sent one", () => {
    const events = buildRelationshipTimeline(
      input({
        interactions: [
          interaction,
          { ...interaction, id: "int-2", direction: "outbound", occurredAt: "2026-06-12T09:00:00Z" },
        ],
      }),
    );

    expect(events.find((e) => e.source.id === "int-1")?.title).toBe("Email received");
    expect(events.find((e) => e.source.id === "int-2")?.title).toBe("Email sent");
  });

  it("produces a stable order when two events share a timestamp", () => {
    const a = { ...interaction, id: "int-a", occurredAt: "2026-06-11T09:12:00Z" };
    const b = { ...interaction, id: "int-b", occurredAt: "2026-06-11T09:12:00Z" };

    const first = buildRelationshipTimeline(input({ interactions: [a, b] }));
    const second = buildRelationshipTimeline(input({ interactions: [b, a] }));

    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
  });
});
