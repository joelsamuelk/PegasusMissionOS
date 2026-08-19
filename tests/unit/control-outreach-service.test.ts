import { describe, expect, it } from "vitest";
import { createControlRequestContext } from "@/server/control-plane/context";
import {
  createInMemoryControlRepository,
  type ControlMemoryState,
} from "@/server/control-plane/in-memory";
import {
  approveOutreach,
  createOutreachDraft,
  createOutreachSequence,
  enrollInSequence,
  recordContactCompliance,
  sendApprovedOutreach,
  suppressContact,
} from "@/server/control-plane/outreach-service";
const now = "2026-08-19T10:00:00Z";
const ctx = createControlRequestContext({
  internalUserId: "u1",
  role: "sales",
  requestId: "req",
  now: () => new Date(now),
});
const state = (): ControlMemoryState => ({
  users: [],
  audit: [],
  prospects: [],
  prospectPeople: [],
  prospectSources: [],
  prospectFacts: [],
  salesOpportunities: [],
  prospectQualifications: [],
  internalTasks: [],
  outreachTemplates: [
    {
      id: "t1",
      name: "Intro",
      subject: "Hi",
      body: "Body",
      status: "draft",
      createdBy: "u1",
      createdAt: now,
      updatedAt: now,
    },
  ],
  outreachSequences: [],
  sequenceSteps: [],
  sequenceEnrollments: [],
  contactCompliance: [],
  outreachSendRequests: [],
  customerAccounts: [],
  customerConversions: [],
  provisioningRuns: [],
  onboardingPlans: [],
  onboardingSteps: [],
  activationCriteria: [],
  customerValueEvents: [],
  activationSnapshots: [],
  customerMetadata: [],
  customerHealthSnapshots: [],
  supportSessions: [],
  supportAccessEvents: [],
  usageEvents: [],
  customerFeedback: [],
  featureFlags: [],
  featureTargets: [],
  aiTraces: [],
  systemStatuses: [],
});
describe("CONTROL-4 outreach services", () => {
  it("keeps initial outreach pending approval", async () => {
    const data = state();
    const draft = await createOutreachDraft(ctx, createInMemoryControlRepository(data), {
      personId: "p1",
      subject: "Hi",
      body: "Body",
      idempotencyKey: "one",
    });
    expect(draft.state).toBe("pending_approval");
    expect(draft.approvedBy).toBeUndefined();
  });
  it("blocks approval without lawful basis and audits it", async () => {
    const data = state(),
      repo = createInMemoryControlRepository(data);
    data.contactCompliance.push({
      prospectPersonId: "p1",
      contactSourceUrl: "https://example.com",
      contactSourceRetrievedAt: now,
      lawfulBasis: "none_recorded",
      doNotContact: false,
      updatedAt: now,
    });
    const draft = await createOutreachDraft(ctx, repo, {
      personId: "p1",
      subject: "Hi",
      body: "Body",
      idempotencyKey: "two",
    });
    expect((await approveOutreach(ctx, repo, draft.id)).state).toBe("blocked");
    expect(data.audit.at(-1)?.action).toBe("outreach.block");
  });
  it("approves valid compliance but does not send", async () => {
    const data = state(),
      repo = createInMemoryControlRepository(data);
    await recordContactCompliance(ctx, repo, {
      prospectPersonId: "p1",
      contactSourceUrl: "https://example.com/team",
      contactSourceRetrievedAt: now,
      lawfulBasis: "legitimate_interests",
      lawfulBasisNote: "Relevant professional role",
      doNotContact: false,
    });
    const draft = await createOutreachDraft(ctx, repo, {
      personId: "p1",
      subject: "Hi",
      body: "Body",
      idempotencyKey: "three",
    });
    expect((await approveOutreach(ctx, repo, draft.id)).state).toBe("approved");
  });
  it("sends only after approval and records the provider result", async () => {
    const data = state(),
      repo = createInMemoryControlRepository(data);
    data.prospects.push({
      id: "org1",
      name: "Example Charity",
      focusAreas: [],
      sizeIndicators: [],
      publicFinancialIndicators: [],
      publicProgrammeIndicators: [],
      status: "researched",
      source: "test",
      createdAt: now,
      updatedAt: now,
    });
    data.prospectPeople.push({
      id: "p1",
      prospectOrganisationId: "org1",
      name: "Amina Patel",
      email: "amina@example.org",
      verificationState: "verified",
      createdAt: now,
      updatedAt: now,
    });
    await recordContactCompliance(ctx, repo, {
      prospectPersonId: "p1",
      contactSourceUrl: "https://example.org/team",
      contactSourceRetrievedAt: now,
      lawfulBasis: "legitimate_interests",
      lawfulBasisNote: "Relevant professional role",
      doNotContact: false,
    });
    const draft = await createOutreachDraft(ctx, repo, {
      personId: "p1",
      subject: "A relevant note",
      body: "Hello Amina",
      idempotencyKey: "send-one",
    });
    await approveOutreach(ctx, repo, draft.id);
    const sent = await sendApprovedOutreach(ctx, repo, draft.id, {
      id: "test-provider",
      async send(request) {
        expect(request.to).toEqual(["amina@example.org"]);
        expect(request.approvedByInternalUserId).toBe("u1");
        return { providerMessageId: "msg-1", acceptedAt: now };
      },
    });
    expect(sent.request.state).toBe("sent");
    expect(data.audit.at(-1)?.action).toBe("outreach.send");
  });
  it("creates a sequence step and pending enrolment", async () => {
    const data = state(),
      repo = createInMemoryControlRepository(data);
    const { sequence } = await createOutreachSequence(ctx, repo, {
      name: "Intro sequence",
      templateId: "t1",
      delayDays: 0,
    });
    const enrollment = await enrollInSequence(ctx, repo, {
      sequenceId: sequence.id,
      personId: "p1",
    });
    expect(data.sequenceSteps).toHaveLength(1);
    expect(enrollment.status).toBe("pending_approval");
  });
  it("requires a suppression reason", async () => {
    const data = state(),
      repo = createInMemoryControlRepository(data);
    await expect(suppressContact(ctx, repo, "p1", " ")).rejects.toThrow("reason");
  });
});
