import { evaluateOutreachCompliance } from "@/lib/control-plane/outreach-policy";
import { requireControlCapability } from "@/lib/control-plane/permissions";
import { createInternalAuditEvent } from "./audit";
import type { ControlRequestContext } from "./context";
import type { ControlRepository } from "./repository";
import type {
  ContactCompliance,
  OutreachSendRequest,
  OutreachSequence,
  OutreachTemplate,
  SequenceEnrollment,
  SequenceStep,
} from "./types";
import {
  getSystemEmailProvider,
  type SystemEmailProvider,
} from "@/server/communications/system-email";
import { approvedOutreachEmail } from "@/lib/email/templates";

export async function createOutreachTemplate(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: { name: string; subject: string; body: string },
) {
  requireControlCapability(ctx.role, "prospect:update");
  if (!input.name.trim() || !input.subject.trim() || !input.body.trim())
    throw new Error("Template name, subject and body are required.");
  const now = ctx.now().toISOString(),
    item: OutreachTemplate = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      status: "draft",
      createdBy: ctx.internalUserId,
      createdAt: now,
      updatedAt: now,
    };
  await repo.outreach.saveTemplate(ctx, item);
  return item;
}
export async function createOutreachDraft(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: {
    personId: string;
    subject: string;
    body: string;
    idempotencyKey: string;
    templateId?: string;
  },
) {
  requireControlCapability(ctx.role, "prospect:update");
  if (!input.subject.trim() || !input.body.trim())
    throw new Error("Subject and body are required.");
  const now = ctx.now().toISOString(),
    item: OutreachSendRequest = {
      id: crypto.randomUUID(),
      prospectPersonId: input.personId,
      templateId: input.templateId,
      subject: input.subject.trim(),
      body: input.body.trim(),
      state: "pending_approval",
      initialOutbound: true,
      idempotencyKey: input.idempotencyKey,
      createdBy: ctx.internalUserId,
      createdAt: now,
      updatedAt: now,
    };
  await repo.outreach.saveSendRequest(ctx, item);
  return item;
}
export async function approveOutreach(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  id: string,
) {
  requireControlCapability(ctx.role, "outreach:send");
  const item = (await repo.outreach.sendRequests(ctx)).find((x) => x.id === id);
  if (!item) throw new Error("Send request not found.");
  const candidate = {
    ...item,
    approvedBy: ctx.internalUserId,
    approvedAt: ctx.now().toISOString(),
  };
  const decision = evaluateOutreachCompliance(
    candidate,
    await repo.outreach.compliance(ctx, item.prospectPersonId),
  );
  const updated: OutreachSendRequest = {
    ...candidate,
    state: decision.allowed ? "approved" : "blocked",
    blockedReason: decision.reasons.join(" ") || undefined,
    updatedAt: ctx.now().toISOString(),
  };
  await repo.outreach.saveSendRequest(ctx, updated);
  await repo.audit.append(
    ctx,
    createInternalAuditEvent(ctx, {
      action: decision.allowed ? "outreach.approve" : "outreach.block",
      targetType: "outreach_send_request",
      targetId: id,
      after: { state: updated.state, reasons: decision.reasons },
    }),
  );
  return updated;
}
export async function sendApprovedOutreach(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  id: string,
  provider: SystemEmailProvider = getSystemEmailProvider(),
) {
  requireControlCapability(ctx.role, "outreach:send");
  const item = (await repo.outreach.sendRequests(ctx)).find((x) => x.id === id);
  if (!item) throw new Error("Send request not found.");
  if ((item.state !== "approved" && item.state !== "failed") || !item.approvedBy)
    throw new Error("Only a human-approved request can be sent.");
  const prospects = await repo.prospects.list(ctx),
    people = (
      await Promise.all(prospects.map((p) => repo.prospects.people(ctx, p.id)))
    ).flat(),
    person = people.find((p) => p.id === item.prospectPersonId);
  if (!person?.email) throw new Error("Recipient has no verified work email.");
  const compliance = await repo.outreach.compliance(ctx, person.id),
    decision = evaluateOutreachCompliance(item, compliance);
  if (!decision.allowed) throw new Error(decision.reasons.join(" "));
  const replyTo =
      process.env.OUTREACH_EMAIL_REPLY_TO ??
      process.env.SYSTEM_EMAIL_REPLY_TO ??
      "hello@pegasus-studio.co",
    message = approvedOutreachEmail({
      recipientName: person.name.split(" ")[0] ?? person.name,
      subject: item.subject,
      preheader: item.subject,
      paragraphs: item.body
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean),
      signature: {
        name: process.env.OUTREACH_SENDER_NAME ?? "Joël Samuel",
        role: process.env.OUTREACH_SENDER_ROLE ?? "Founder",
        organisation: "Pegasus Information Studio",
        email: replyTo,
        website: "pegasus-studio.co",
        location: "United Kingdom",
      },
      compliance: {
        organisationName: "Pegasus Information Studio",
        postalAddress:
          process.env.OUTREACH_POSTAL_ADDRESS ?? "Exeter, Devon, United Kingdom",
        unsubscribeUrl: `mailto:${replyTo}?subject=Unsubscribe`,
        contactSource: compliance?.contactSourceUrl
          ? `Professional contact source: ${compliance.contactSourceUrl}`
          : undefined,
      },
    });
  try {
    const result = await provider.send({
      to: [person.email],
      message,
      replyTo,
      approvedByInternalUserId: item.approvedBy,
      idempotencyKey: item.idempotencyKey,
    });
    const sent: OutreachSendRequest = {
      ...item,
      state: "sent",
      updatedAt: ctx.now().toISOString(),
    };
    await repo.outreach.saveSendRequest(ctx, sent);
    await repo.audit.append(
      ctx,
      createInternalAuditEvent(ctx, {
        action: "outreach.send",
        targetType: "outreach_send_request",
        targetId: id,
        after: {
          state: "sent",
          provider: provider.id,
          providerMessageId: result.providerMessageId,
        },
      }),
    );
    return { request: sent, result };
  } catch (error) {
    const failed: OutreachSendRequest = {
      ...item,
      state: "failed",
      blockedReason: error instanceof Error ? error.message : "Delivery failed.",
      updatedAt: ctx.now().toISOString(),
    };
    await repo.outreach.saveSendRequest(ctx, failed);
    await repo.audit.append(
      ctx,
      createInternalAuditEvent(ctx, {
        action: "outreach.fail",
        targetType: "outreach_send_request",
        targetId: id,
        after: { state: "failed", provider: provider.id, reason: failed.blockedReason },
      }),
    );
    throw error;
  }
}
export async function suppressContact(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  personId: string,
  reason: string,
) {
  requireControlCapability(ctx.role, "outreach:send");
  if (!reason.trim()) throw new Error("A suppression reason is required.");
  const current = await repo.outreach.compliance(ctx, personId);
  if (!current) throw new Error("Contact compliance record not found.");
  await repo.outreach.saveCompliance(ctx, {
    ...current,
    doNotContact: true,
    lawfulBasisNote: [current.lawfulBasisNote, `Suppressed: ${reason.trim()}`]
      .filter(Boolean)
      .join(" "),
    updatedAt: ctx.now().toISOString(),
  });
}
export async function createOutreachSequence(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: { name: string; templateId: string; delayDays: number },
) {
  requireControlCapability(ctx.role, "prospect:update");
  if (!input.name.trim() || !input.templateId)
    throw new Error("Sequence name and template are required.");
  if (!Number.isInteger(input.delayDays) || input.delayDays < 0)
    throw new Error("Delay must be a non-negative whole number.");
  const now = ctx.now().toISOString();
  const sequence: OutreachSequence = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    status: "draft",
    createdBy: ctx.internalUserId,
    createdAt: now,
    updatedAt: now,
  };
  const step: SequenceStep = {
    id: crypto.randomUUID(),
    sequenceId: sequence.id,
    position: 1,
    templateId: input.templateId,
    delayDays: input.delayDays,
  };
  await repo.outreach.saveSequence(ctx, sequence);
  await repo.outreach.saveStep(ctx, step);
  return { sequence, step };
}
export async function enrollInSequence(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: { sequenceId: string; personId: string },
) {
  requireControlCapability(ctx.role, "prospect:update");
  const [sequences, steps, compliance] = await Promise.all([
    repo.outreach.sequences(ctx),
    repo.outreach.steps(ctx, input.sequenceId),
    repo.outreach.compliance(ctx, input.personId),
  ]);
  if (!sequences.some((x) => x.id === input.sequenceId))
    throw new Error("Sequence not found.");
  if (steps.length === 0) throw new Error("Sequence has no steps.");
  const now = ctx.now().toISOString();
  const enrollment: SequenceEnrollment = {
    id: crypto.randomUUID(),
    sequenceId: input.sequenceId,
    prospectPersonId: input.personId,
    status:
      compliance?.doNotContact || compliance?.unsubscribedAt
        ? "suppressed"
        : "pending_approval",
    currentStep: 0,
    enrolledBy: ctx.internalUserId,
    enrolledAt: now,
    updatedAt: now,
  };
  await repo.outreach.saveEnrollment(ctx, enrollment);
  return enrollment;
}
export async function recordContactCompliance(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: Omit<ContactCompliance, "updatedAt">,
) {
  requireControlCapability(ctx.role, "outreach:send");
  if (!input.contactSourceUrl.trim())
    throw new Error("Contact-source provenance is required.");
  if (input.lawfulBasis === "legitimate_interests" && !input.lawfulBasisNote?.trim())
    throw new Error("Legitimate-interests reasoning is required.");
  if (input.lawfulBasis === "consent" && !input.consentRecordedAt)
    throw new Error("Consent timestamp is required.");
  const item = { ...input, updatedAt: ctx.now().toISOString() };
  await repo.outreach.saveCompliance(ctx, item);
  return item;
}
