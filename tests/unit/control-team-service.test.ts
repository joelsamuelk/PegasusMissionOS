import { describe, expect, it } from "vitest";
import { createControlRequestContext } from "@/server/control-plane/context";
import { createInMemoryControlRepository, type ControlMemoryState } from "@/server/control-plane/in-memory";
import { changeInternalRole, changeInternalUserStatus } from "@/server/control-plane/team-service";

const timestamp = "2026-08-19T10:00:00.000Z";

function fixture(): ControlMemoryState {
  return {
    users: [
      { id: "admin-1", email: "admin@pegasus.test", name: "Admin One", role: "super_admin", status: "active", createdAt: timestamp, updatedAt: timestamp },
      { id: "sales-1", email: "sales@pegasus.test", name: "Sales One", role: "sales", status: "active", createdAt: timestamp, updatedAt: timestamp },
    ],
    audit: [],
    prospects: [],
    prospectPeople: [],
    prospectSources: [],
    prospectFacts: [],
    salesOpportunities: [],
    prospectQualifications: [],
    internalTasks: [],
    outreachTemplates: [], outreachSequences: [], sequenceSteps: [], sequenceEnrollments: [], contactCompliance: [], outreachSendRequests: [], customerAccounts: [], customerConversions: [], provisioningRuns: [], onboardingPlans: [], onboardingSteps: [], activationCriteria: [], customerValueEvents: [], activationSnapshots: [], customerMetadata: [], customerHealthSnapshots: [], supportSessions: [], supportAccessEvents: [], usageEvents: [], customerFeedback: [], featureFlags: [], featureTargets: [], aiTraces: [], systemStatuses: [],
  };
}

const adminContext = createControlRequestContext({
  internalUserId: "admin-1",
  role: "super_admin",
  requestId: "request-1",
  now: () => new Date(timestamp),
});

describe("Control team service", () => {
  it("changes a role and appends its required audit event", async () => {
    const state = fixture();
    const repo = createInMemoryControlRepository(state);
    await changeInternalRole(adminContext, repo, {
      userId: "sales-1",
      role: "customer_success",
      reason: "Responsibilities changed",
    });
    expect(state.users[1]!.role).toBe("customer_success");
    expect(state.audit[0]).toMatchObject({
      action: "internal_role.change",
      actorId: "admin-1",
      reason: "Responsibilities changed",
      before: { role: "sales" },
      after: { role: "customer_success" },
    });
  });

  it("rejects role changes by users without management capability", async () => {
    const state = fixture();
    const repo = createInMemoryControlRepository(state);
    const salesContext = createControlRequestContext({
      internalUserId: "sales-1", role: "sales", requestId: "request-2",
    });
    await expect(changeInternalRole(salesContext, repo, {
      userId: "admin-1", role: "read_only", reason: "Escalation attempt",
    })).rejects.toThrow("lacks required capability");
    expect(state.audit).toHaveLength(0);
  });

  it("requires a reason before mutating", async () => {
    const state = fixture();
    const repo = createInMemoryControlRepository(state);
    await expect(changeInternalRole(adminContext, repo, {
      userId: "sales-1", role: "support", reason: " ",
    })).rejects.toThrow("reason is required");
    expect(state.users[1]!.role).toBe("sales");
  });

  it("will not remove the final active super admin", async () => {
    const repo = createInMemoryControlRepository(fixture());
    await expect(changeInternalRole(adminContext, repo, {
      userId: "admin-1", role: "operations", reason: "Role change",
    })).rejects.toThrow("final active super admin");
  });

  it("will not allow an actor to suspend their own account", async () => {
    const repo = createInMemoryControlRepository(fixture());
    await expect(changeInternalUserStatus(adminContext, repo, {
      userId: "admin-1", status: "suspended", reason: "Testing",
    })).rejects.toThrow("cannot suspend your own");
  });
});
