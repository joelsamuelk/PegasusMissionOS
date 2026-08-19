"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Commitment, Interaction } from "@/types/domain";
import { can, type Capability } from "@/lib/permissions";
import { resolveRequestContext, type RequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

/**
 * Relationship server actions.
 *
 * These are the first actions in the codebase to **enforce** the capability
 * model rather than treat it as advisory (architecture audit §4.5). A caller
 * without the capability gets a refusal, not a silent success — a mutation
 * that quietly does nothing is indistinguishable from one that worked.
 *
 * Tenant scoping is still the repository's job: the context organisation is
 * the only one an action can reach, whatever ids are supplied.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function authorise(capability: Capability): Promise<
  { ok: true; ctx: RequestContext } | { ok: false; result: ActionResult }
> {
  const ctx = await resolveRequestContext();
  if (!can(ctx.role, capability)) {
    return {
      ok: false,
      result: {
        ok: false,
        message: `Your role does not have permission to ${capability.replace(":", " ")}.`,
      },
    };
  }
  return { ok: true, ctx };
}

const logInteractionSchema = z.object({
  externalOrganisationId: z.string().min(1),
  personId: z.string().optional(),
  type: z.enum([
    "email",
    "meeting",
    "call",
    "message",
    "event",
    "introduction",
    "note",
    "proposal",
    "visit",
    "other",
  ]),
  direction: z.enum(["inbound", "outbound", "internal"]),
  occurredAt: z.string().min(4),
  subject: z.string().trim().min(3, "Add a short subject.").max(200),
  summary: z.string().trim().max(2000).optional(),
});

/**
 * Record something that happened.
 *
 * Manual capture is the foundation the email integration later builds on: if
 * the model cannot hold a hand-entered call correctly, syncing a mailbox into
 * it will not help.
 */
export async function logInteraction(formData: FormData): Promise<ActionResult> {
  const auth = await authorise("relationships:manage");
  if (!auth.ok) return auth.result;
  const { ctx } = auth;

  const parsed = logInteractionSchema.safeParse({
    externalOrganisationId: formData.get("externalOrganisationId"),
    personId: formData.get("personId") || undefined,
    type: formData.get("type"),
    direction: formData.get("direction"),
    occurredAt: formData.get("occurredAt"),
    subject: formData.get("subject"),
    summary: formData.get("summary") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const repo = getRepository();
  const organisation = await repo.relationships.getOrganisation(
    ctx,
    parsed.data.externalOrganisationId,
  );
  if (!organisation) return { ok: false, message: "That organisation was not found." };

  const input: Omit<Interaction, "id" | "organisationId" | "audit" | "recordedBy"> = {
    type: parsed.data.type,
    direction: parsed.data.direction,
    channel: parsed.data.type === "email" ? "email" : parsed.data.type === "call" ? "phone" : undefined,
    // A date-only value is normalised to an instant so timeline ordering is
    // total rather than clustering everything logged on the same day.
    occurredAt: normaliseOccurredAt(parsed.data.occurredAt),
    subject: parsed.data.subject,
    summary: parsed.data.summary,
    personIds: parsed.data.personId ? [parsed.data.personId] : [],
    externalOrganisationIds: [organisation.id],
    participantUserIds: [ctx.userId],
    links: [],
    source: "manual",
  };

  await repo.relationships.logInteraction(ctx, input);
  revalidatePath(`/relationships/${organisation.id}`);
  revalidatePath("/relationships");
  return { ok: true, message: "Interaction recorded." };
}

function normaliseOccurredAt(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
}

export async function setCommitmentStatus(
  commitmentId: string,
  status: Commitment["status"],
): Promise<ActionResult> {
  const auth = await authorise("commitments:manage");
  if (!auth.ok) return auth.result;

  const repo = getRepository();
  const before = (await repo.relationships.listCommitments(auth.ctx)).find(
    (c) => c.id === commitmentId,
  );
  if (!before) return { ok: false, message: "That commitment was not found." };

  await repo.relationships.setCommitmentStatus(auth.ctx, commitmentId, status);

  if (before.externalOrganisationId) {
    revalidatePath(`/relationships/${before.externalOrganisationId}`);
  }
  if (before.personId) revalidatePath(`/relationships/people/${before.personId}`);
  revalidatePath("/relationships");
  revalidatePath("/dashboard");
  return { ok: true, message: `Commitment marked ${status}.` };
}

const createCommitmentSchema = z.object({
  externalOrganisationId: z.string().min(1),
  title: z.string().trim().min(3, "Describe the commitment.").max(200),
  direction: z.enum(["we_owe", "they_owe", "mutual"]),
  dueAt: z.string().optional(),
});

export async function createCommitment(formData: FormData): Promise<ActionResult> {
  const auth = await authorise("commitments:manage");
  if (!auth.ok) return auth.result;
  const { ctx } = auth;

  const parsed = createCommitmentSchema.safeParse({
    externalOrganisationId: formData.get("externalOrganisationId"),
    title: formData.get("title"),
    direction: formData.get("direction"),
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const repo = getRepository();
  const organisation = await repo.relationships.getOrganisation(
    ctx,
    parsed.data.externalOrganisationId,
  );
  if (!organisation) return { ok: false, message: "That organisation was not found." };

  await repo.relationships.createCommitment(ctx, {
    title: parsed.data.title,
    direction: parsed.data.direction,
    externalOrganisationId: organisation.id,
    ownerId: parsed.data.direction === "they_owe" ? undefined : ctx.userId,
    dueAt: parsed.data.dueAt,
    status: "open",
    // Recorded by a human here. AI-extracted candidates go through a separate
    // confirmation path and carry `confirmedBy` — they never land as open
    // commitments without one.
    confirmedBy: ctx.userId,
  });

  revalidatePath(`/relationships/${organisation.id}`);
  revalidatePath("/relationships");
  return { ok: true, message: "Commitment recorded." };
}
