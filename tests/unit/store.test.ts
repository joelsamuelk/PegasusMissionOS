import { beforeEach, describe, expect, it } from "vitest";
import { createTwoTenantHarness, ORG_A, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * Seeded-workspace behaviour, asserted through the repository.
 *
 * These tests previously drove the `q` / `mutate` shim directly. That shim was
 * single-tenant by construction and has been deleted, so the same behaviours
 * are asserted here against the data boundary every caller now uses.
 */
describe("seeded workspace: organisation ownership", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("stamps every organisation-owned record with the organisation id", async () => {
    const { repo, ctxA } = h;

    const collections = await Promise.all([
      repo.funding.listOpportunities(ctxA),
      repo.applications.list(ctxA),
      repo.grants.list(ctxA),
      repo.programmes.list(ctxA),
      repo.programmes.allIndicators(ctxA),
      repo.evidence.list(ctxA),
      repo.workspace.tasks(ctxA),
    ]);

    for (const collection of collections) {
      expect(collection.length).toBeGreaterThan(0);
      for (const record of collection as { organisationId: string }[]) {
        expect(record.organisationId).toBe(ORG_A);
      }
    }
  });

  it("scopes evidence links to their target", async () => {
    const { repo, ctxA } = h;

    const linked = await repo.evidence.forTarget(ctxA, "programme", "prog-youth");
    expect(linked.length).toBeGreaterThan(0);

    const missing = await repo.evidence.forTarget(ctxA, "programme", "does-not-exist");
    expect(missing).toHaveLength(0);
  });
});

describe("seeded workspace: mutations", () => {
  let h: TwoTenantHarness;

  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("approving an answer records an audit event", async () => {
    const { repo, ctxA } = h;

    const before = (await repo.audit.list(ctxA)).length;
    await repo.applications.setAnswerStatus(ctxA, "ans-h2", "approved");

    const answer = await repo.applications.getAnswer(ctxA, "ans-h2");
    expect(answer?.status).toBe("approved");
    expect((await repo.audit.list(ctxA)).length).toBe(before + 1);
  });

  it("converts a successful application into an active grant", async () => {
    const { repo, ctxA } = h;

    const grantsBefore = (await repo.grants.list(ctxA)).length;
    const grantId = await repo.applications.convertToGrant(ctxA, "app-wellbeing");
    expect(grantId).toBeTruthy();

    const application = await repo.applications.get(ctxA, "app-wellbeing");
    expect(application?.status).toBe("successful");
    expect((await repo.grants.list(ctxA)).length).toBe(grantsBefore + 1);

    const grant = await repo.grants.get(ctxA, grantId!);
    expect(grant?.status).toBe("active");
    expect(grant?.organisationId).toBe(ORG_A);
  });

  it("updates an indicator and logs it", async () => {
    const { repo, ctxA } = h;

    await repo.programmes.updateIndicator(ctxA, "ind-eet", 63, "Q3");

    const indicator = await repo.programmes.getIndicator(ctxA, "ind-eet");
    expect(indicator?.currentValue).toBe(63);

    const audit = await repo.audit.list(ctxA);
    expect(audit.some((e) => e.action === "indicator.updated")).toBe(true);
  });
});
