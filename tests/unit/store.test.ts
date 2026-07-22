import { describe, expect, it } from "vitest";
import { DEMO_ORG_ID, mutate, q, store } from "@/features/store";

describe("mock store: organisation isolation", () => {
  it("stamps every organisation-owned record with the organisation id", () => {
    const collections = [
      store.opportunities,
      store.applications,
      store.applicationAnswers,
      store.grants,
      store.programmes,
      store.indicators,
      store.evidenceItems,
      store.tasks,
    ];
    for (const collection of collections) {
      for (const record of collection as { organisationId: string }[]) {
        expect(record.organisationId).toBe(DEMO_ORG_ID);
      }
    }
  });

  it("scopes evidence links to their target", () => {
    const linked = q.evidenceForTarget("programme", "prog-youth");
    expect(linked.length).toBeGreaterThan(0);
    expect(q.evidenceForTarget("programme", "does-not-exist")).toHaveLength(0);
  });
});

describe("mock store: mutations", () => {
  it("approving an answer records an audit event", () => {
    const before = q.auditEvents().length;
    mutate.setAnswerStatus("ans-h2", "approved");
    expect(q.answer("ans-h2")?.status).toBe("approved");
    expect(q.auditEvents().length).toBe(before + 1);
  });

  it("converts a successful application into an active grant", () => {
    const grantsBefore = q.grants().length;
    const grantId = mutate.convertApplicationToGrant("app-wellbeing");
    expect(grantId).toBeTruthy();
    expect(q.application("app-wellbeing")?.status).toBe("successful");
    expect(q.grants().length).toBe(grantsBefore + 1);
    const grant = q.grant(grantId!);
    expect(grant?.status).toBe("active");
    expect(grant?.organisationId).toBe(DEMO_ORG_ID);
  });

  it("updates an indicator and logs it", () => {
    mutate.updateIndicator("ind-eet", 63, "Q3");
    expect(q.indicator("ind-eet")?.currentValue).toBe(63);
    expect(q.auditEvents().some((e) => e.action === "indicator.updated")).toBe(true);
  });
});
