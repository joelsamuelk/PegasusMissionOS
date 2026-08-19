import { renderPegasusEmail } from "./render";
import type { ComplianceFooter, PersonalSignature, RenderedEmail } from "./types";

export function accountInvitationEmail(input: { name: string; inviteUrl: string; expiresIn: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: "You’re invited to Pegasus", preheader: "Activate your secure Pegasus account.", title: "Your Pegasus account is ready", greeting: `Hello ${input.name},`, sections: [{ paragraphs: ["You have been invited to Pegasus Mission OS. Use the secure link below to set up your account.", `This invitation expires ${input.expiresIn}. If you were not expecting it, you can ignore this email.`] }], action: { label: "Accept invitation", url: input.inviteUrl } });
}

export function passwordResetEmail(input: { name: string; resetUrl: string; expiresIn: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: "Reset your Pegasus password", preheader: "A password reset was requested for your account.", title: "Reset your password", greeting: `Hello ${input.name},`, sections: [{ paragraphs: ["A password reset was requested for your Pegasus account.", `The secure link expires ${input.expiresIn}. If you did not request this, leave your password unchanged and contact support.`] }], action: { label: "Reset password", url: input.resetUrl } });
}

export function securityAlertEmail(input: { name: string; event: string; occurredAt: string; supportUrl: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: "Security activity on your Pegasus account", preheader: input.event, title: "Please review this security activity", greeting: `Hello ${input.name},`, sections: [{ paragraphs: [input.event], items: [`Time: ${input.occurredAt}`] }, { paragraphs: ["If this was you, no action is needed. If not, secure your account and contact Pegasus support immediately."] }], action: { label: "Contact support", url: input.supportUrl } });
}

export function organisationProvisionedEmail(input: { administratorName: string; organisationName: string; workspaceUrl: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: `${input.organisationName} is ready in Pegasus`, preheader: "Your Mission OS workspace has been provisioned.", title: "Your workspace is ready", greeting: `Hello ${input.administratorName},`, sections: [{ paragraphs: [`The ${input.organisationName} workspace has been securely provisioned in Pegasus Mission OS.`], items: ["Review the organisation profile", "Invite your team", "Begin the guided onboarding plan"] }], action: { label: "Open workspace", url: input.workspaceUrl } });
}

export function onboardingReminderEmail(input: { name: string; organisationName: string; nextStep: string; onboardingUrl: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: `Next step for ${input.organisationName}`, preheader: input.nextStep, title: "Continue your Pegasus setup", greeting: `Hello ${input.name},`, sections: [{ paragraphs: ["Your organisation setup is still in progress."], items: [`Recommended next step: ${input.nextStep}`] }], action: { label: "Continue onboarding", url: input.onboardingUrl } });
}

export function supportAccessEmail(input: { name: string; organisationName: string; scope: string; reason: string; expiresAt: string; reviewUrl: string }): RenderedEmail {
  return renderPegasusEmail({ kind: "transactional", subject: `Support access for ${input.organisationName}`, preheader: "A time-bound support session was requested or activated.", title: "Support access notification", greeting: `Hello ${input.name},`, sections: [{ paragraphs: ["Pegasus support access is explicit, scoped and auditable."], items: [`Scope: ${input.scope}`, `Reason: ${input.reason}`, `Expires: ${input.expiresAt}`] }], action: { label: "Review access", url: input.reviewUrl } });
}

export function personalEmail(input: { subject: string; preheader: string; recipientName: string; paragraphs: string[]; signature: PersonalSignature }): RenderedEmail {
  return renderPegasusEmail({ kind: "personal", subject: input.subject, preheader: input.preheader, title: input.subject, greeting: `Hello ${input.recipientName},`, sections: [{ paragraphs: input.paragraphs }], closing: "Best wishes,", signature: input.signature });
}

export function approvedOutreachEmail(input: { subject: string; preheader: string; recipientName: string; paragraphs: string[]; signature: PersonalSignature; compliance: ComplianceFooter }): RenderedEmail {
  return renderPegasusEmail({ kind: "outreach", subject: input.subject, preheader: input.preheader, title: input.subject, greeting: `Hello ${input.recipientName},`, sections: [{ paragraphs: input.paragraphs }], closing: "Best wishes,", signature: input.signature, compliance: input.compliance });
}
