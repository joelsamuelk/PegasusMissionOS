import { describe, expect, it } from "vitest";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import type { Grant, GrantDeliverable, GrantReport } from "@/types/domain";

const NOW = new Date("2026-07-21T10:00:00Z");

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: "g-1",
    organisationId: "org-1",
    funderId: "f-1",
    title: "Test grant",
    awardValue: 100000,
    currency: "GBP",
    restricted: true,
    startDate: "2025-04-01",
    endDate: "2027-03-31",
    spentToDate: 40000,
    conditions: [],
    status: "active",
    audit: { createdAt: "2025-03-01", updatedAt: "2025-03-01", archivedAt: null },
    ...overrides,
  };
}

function deliverable(status: GrantDeliverable["status"], dueDate: string): GrantDeliverable {
  return { id: "d", grantId: "g-1", organisationId: "org-1", title: "d", dueDate, status };
}
function report(status: GrantReport["status"], dueDate: string): GrantReport {
  return { id: "r", grantId: "g-1", organisationId: "org-1", title: "r", dueDate, status };
}

describe("computeGrantHealth", () => {
  it("is on track when deliverables, spend and reporting are healthy", () => {
    const result = computeGrantHealth({
      grant: grant(),
      deliverables: [deliverable("complete", "2026-06-30")],
      reports: [report("submitted", "2026-06-01")],
      linkedEvidenceCount: 3,
      now: NOW,
    });
    expect(result.state).toBe("on_track");
  });

  it("flags at risk when reports and deliverables are overdue", () => {
    const result = computeGrantHealth({
      grant: grant(),
      deliverables: [deliverable("overdue", "2026-07-01"), deliverable("in_progress", "2026-06-01")],
      reports: [report("not_started", "2026-07-01")],
      linkedEvidenceCount: 0,
      now: NOW,
    });
    expect(result.state).toBe("at_risk");
    expect(result.overdueReports).toBe(1);
  });

  it("returns completed for a closed grant", () => {
    const result = computeGrantHealth({
      grant: grant({ status: "completed" }),
      deliverables: [],
      reports: [],
      linkedEvidenceCount: 0,
      now: NOW,
    });
    expect(result.state).toBe("completed");
  });

  it("warns when spend runs well ahead of the timeline", () => {
    const result = computeGrantHealth({
      grant: grant({ spentToDate: 95000 }),
      deliverables: [],
      reports: [],
      linkedEvidenceCount: 2,
      now: NOW,
    });
    expect(result.budgetUsedPercent).toBeGreaterThan(result.timeElapsedPercent);
    expect(["attention", "at_risk"]).toContain(result.state);
  });
});
