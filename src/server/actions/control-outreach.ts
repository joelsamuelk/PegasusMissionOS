"use server";
import { revalidatePath } from "next/cache";
import { getControlRepository } from "@/server/control-plane";
import {
  approveOutreach,
  createOutreachDraft,
  createOutreachSequence,
  createOutreachTemplate,
  enrollInSequence,
  recordContactCompliance,
  suppressContact,
  sendApprovedOutreach,
} from "@/server/control-plane/outreach-service";
import { authoriseControl as authorise } from "./authorise";
export async function createOutreachTemplateAction(f: FormData) {
  const c = await authorise("prospect:update");
  await createOutreachTemplate(c, await getControlRepository(c), {
    name: String(f.get("name") ?? ""),
    subject: String(f.get("subject") ?? ""),
    body: String(f.get("body") ?? ""),
  });
  revalidatePath("/control/outreach");
}
export async function createOutreachDraftAction(f: FormData) {
  const c = await authorise("prospect:update");
  await createOutreachDraft(c, await getControlRepository(c), {
    personId: String(f.get("personId") ?? ""),
    subject: String(f.get("subject") ?? ""),
    body: String(f.get("body") ?? ""),
    idempotencyKey: crypto.randomUUID(),
  });
  revalidatePath("/control/outreach");
}
export async function approveOutreachAction(f: FormData) {
  const c = await authorise("outreach:send");
  await approveOutreach(c, await getControlRepository(c), String(f.get("requestId")));
  revalidatePath("/control/outreach");
}
export async function sendOutreachAction(f: FormData) {
  const c = await authorise("outreach:send");
  await sendApprovedOutreach(c, await getControlRepository(c), String(f.get("requestId")));
  revalidatePath("/control/outreach");
}
export async function createOutreachSequenceAction(f: FormData) {
  const c = await authorise("prospect:update");
  await createOutreachSequence(c, await getControlRepository(c), {
    name: String(f.get("name") ?? ""),
    templateId: String(f.get("templateId") ?? ""),
    delayDays: Number(f.get("delayDays") ?? 0),
  });
  revalidatePath("/control/outreach");
}
export async function enrollInSequenceAction(f: FormData) {
  const c = await authorise("prospect:update");
  await enrollInSequence(c, await getControlRepository(c), {
    sequenceId: String(f.get("sequenceId") ?? ""),
    personId: String(f.get("personId") ?? ""),
  });
  revalidatePath("/control/outreach");
}
export async function recordContactComplianceAction(f: FormData) {
  const c = await authorise("outreach:send");
  const lawfulBasis = String(f.get("lawfulBasis")) as
    "consent" | "legitimate_interests" | "contract" | "none_recorded";
  await recordContactCompliance(c, await getControlRepository(c), {
    prospectPersonId: String(f.get("personId")),
    contactSourceUrl: String(f.get("sourceUrl") ?? ""),
    contactSourceRetrievedAt: String(
      f.get("sourceRetrievedAt") ?? new Date().toISOString(),
    ),
    lawfulBasis,
    lawfulBasisNote: String(f.get("lawfulBasisNote") ?? "") || undefined,
    consentRecordedAt: String(f.get("consentRecordedAt") ?? "") || undefined,
    doNotContact: false,
  });
  revalidatePath("/control/outreach");
}
export async function suppressContactAction(f: FormData) {
  const c = await authorise("outreach:send");
  await suppressContact(
    c,
    await getControlRepository(c),
    String(f.get("personId")),
    String(f.get("reason") ?? ""),
  );
  revalidatePath("/control/outreach");
}
