"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authoriseControl } from "./authorise";
import { createAnonClient } from "@/server/data/supabase/client";
import { rateLimit } from "@/server/rate-limit";
import { estimateAnnualEffort, type ProcessFrequency } from "@/lib/process-intelligence";

export type IntakeCampaign = {
  campaignId: string;
  campaignName: string;
  organisationName: string;
  welcomeMessage?: string;
  voiceEnabled: boolean;
  identificationRequired: boolean;
  participant?: {
    firstName?: string;
    department?: string;
    team?: string;
    jobTitle?: string;
  } | null;
};
export type ProcessOrganisation = {
  id: string;
  name: string;
  legalName: string;
  type: string;
  campaignCount: number;
  processCount: number;
};

export async function listProcessOrganisations(): Promise<ProcessOrganisation[]> {
  await authoriseControl("organisation:view_metadata");
  const client = await createAnonClient();
  const { data, error } = await client.rpc("control_list_process_organisations");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    legalName: String(r.legal_name),
    type: String(r.type),
    campaignCount: Number(r.campaign_count),
    processCount: Number(r.process_count),
  }));
}
export async function createProcessOrganisationAction(formData: FormData) {
  const ctx = await authoriseControl("organisation:create");
  const input = z
    .object({
      name: z.string().trim().min(2).max(120),
      legalName: z.string().trim().min(2).max(160),
      type: z.string().trim().min(2).max(80),
    })
    .parse({
      name: formData.get("name"),
      legalName: formData.get("legalName"),
      type: formData.get("type"),
    });
  const client = await createAnonClient();
  const { data, error } = await client.rpc("control_create_process_organisation", {
    p_name: input.name,
    p_legal_name: input.legalName,
    p_type: input.type,
    p_request_id: ctx.requestId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/control/organisations");
  redirect(`/control/organisations/${data}/process-intelligence`);
}
export async function createProcessCampaignAction(formData: FormData) {
  const ctx = await authoriseControl("organisation:create");
  const organisationId = String(formData.get("organisationId"));
  const name = String(formData.get("name") ?? "");
  const closes = String(formData.get("closesAt") ?? "");
  const client = await createAnonClient();
  const { data, error } = await client.rpc("control_create_process_campaign", {
    p_organisation_id: organisationId,
    p_name: name,
    p_description: String(formData.get("description") ?? ""),
    p_closes_at: closes ? new Date(`${closes}T23:59:59Z`).toISOString() : null,
    p_anonymous_allowed: formData.get("anonymousAllowed") === "on",
    p_identification_required: formData.get("identificationRequired") === "on",
    p_request_id: ctx.requestId,
  });
  if (error) throw new Error(error.message);
  redirect(
    `/control/organisations/${organisationId}/process-intelligence?token=${encodeURIComponent(String(data.token))}`,
  );
}

// @public-action Token resolution exposes an intentionally narrow projection.
export async function loadProcessIntake(
  token: string,
): Promise<{ ok: true; campaign: IntakeCampaign } | { ok: false; error: string }> {
  if (!/^[a-f0-9]{64}$/i.test(token))
    return { ok: false, error: "This intake link is invalid." };
  const client = await createAnonClient();
  const { data, error } = await client.rpc("resolve_process_intake_token", {
    p_token: token,
  });
  if (error || !data)
    return { ok: false, error: "This intake link is invalid, expired, or closed." };
  return {
    ok: true,
    campaign: {
      campaignId: String(data.campaignId),
      campaignName: String(data.campaignName),
      organisationName: String(data.organisationName),
      welcomeMessage: data.welcomeMessage ? String(data.welcomeMessage) : undefined,
      voiceEnabled: Boolean(data.voiceEnabled),
      identificationRequired: Boolean(data.identificationRequired),
      participant: data.participant ?? null,
    },
  };
}
const frequencyMap: Record<string, ProcessFrequency> = {
  "multiple times per day": "multiple_daily",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annually",
  "ad hoc": "ad_hoc",
  custom: "custom",
};
// @public-action Writes only through a token-scoped database function and is rate limited.
export async function submitProcessIntake(
  token: string,
  identity: Record<string, string>,
  draft: Record<string, string>,
) {
  const h = await headers();
  const source = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (
    !rateLimit(`process-intake:${token.slice(0, 12)}:${source}`, {
      limit: 20,
      windowMs: 3_600_000,
    }).allowed
  )
    return { ok: false, error: "Too many submissions. Please try again later." };
  const frequency = frequencyMap[draft.frequency ?? ""] ?? "ad_hoc";
  const effort = estimateAnnualEffort({
    frequency,
    durationMinutes: Number(draft.duration) || 0,
    peopleCount: Number(draft.people) || 1,
  });
  const client = await createAnonClient();
  const { error } = await client.rpc("public_process_submit", {
    p_token: token,
    p_identity: identity,
    p_submission: {
      name: draft.name,
      narrative: draft.narrative,
      frequency,
      durationMinutes: Number(draft.duration) || 0,
      peopleCount: Number(draft.people) || 1,
      systems: (draft.systems ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      friction: draft.friction,
      humanJudgement: draft.judgement,
      sensitiveData:
        draft.sensitive && draft.sensitive !== "none" ? [draft.sensitive] : [],
      magicRemoval: draft.magic,
      annualHours: effort.annualHours,
      effortAssumptions: effort,
    },
  });
  return error
    ? {
        ok: false,
        error: "We could not save this process. Please check the link and try again.",
      }
    : { ok: true };
}
