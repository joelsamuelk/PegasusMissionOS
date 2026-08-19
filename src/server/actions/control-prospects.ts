"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authoriseControl as authorise } from "./authorise";
import { getControlRepository } from "@/server/control-plane";
import { addProspectPerson, createProspect } from "@/server/control-plane/prospect-service";

export async function createProspectAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:create");
  const id = await createProspect(ctx, await getControlRepository(), { name: String(form.get("name") ?? ""), website: String(form.get("website") ?? "") || undefined, country: String(form.get("country") ?? "") || undefined, organisationType: String(form.get("organisationType") ?? "") || undefined, source: "manual" });
  redirect(`/control/prospects/${id}`);
}
export async function addProspectPersonAction(form: FormData): Promise<void> {
  const ctx = await authorise("prospect:update");
  const prospectId = String(form.get("prospectId") ?? "");
  await addProspectPerson(ctx, await getControlRepository(), { prospectId, name: String(form.get("name") ?? ""), role: String(form.get("role") ?? "") || undefined, email: String(form.get("email") ?? "") || undefined, sourceUrl: String(form.get("sourceUrl") ?? "") || undefined });
  revalidatePath(`/control/prospects/${prospectId}`);
}
