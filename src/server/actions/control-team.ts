"use server";

import { revalidatePath } from "next/cache";
import type { InternalRole } from "@/lib/control-plane/permissions";
import { getControlRepository } from "@/server/control-plane";
import { changeInternalRole, changeInternalUserStatus } from "@/server/control-plane/team-service";
import type { InternalUserStatus } from "@/server/control-plane/types";
import { authoriseControl as authorise } from "./authorise";

export async function updateInternalRole(form: FormData): Promise<void> {
  const ctx = await authorise("internal_user:manage");
  await changeInternalRole(ctx, await getControlRepository(), {
    userId: String(form.get("userId") ?? ""),
    role: String(form.get("role") ?? "") as InternalRole,
    reason: String(form.get("reason") ?? ""),
  });
  revalidatePath("/control/team");
  revalidatePath("/control/audit");
}

export async function updateInternalStatus(form: FormData): Promise<void> {
  const ctx = await authorise("internal_user:manage");
  await changeInternalUserStatus(ctx, await getControlRepository(), {
    userId: String(form.get("userId") ?? ""),
    status: String(form.get("status") ?? "") as InternalUserStatus,
    reason: String(form.get("reason") ?? ""),
  });
  revalidatePath("/control/team");
  revalidatePath("/control/audit");
}
