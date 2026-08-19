"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_MODE_COOKIE, demoCookieOptions } from "@/lib/control-plane/demo-mode";
import { authoriseControl as authorise } from "./authorise";
import { resetControlSandbox } from "@/server/control-plane";

/**
 * Entering and leaving a demonstration.
 *
 * Gated on `control:access`, the capability every internal role holds: any
 * operator who may open the Control Plane may demonstrate it, because a
 * demonstration reaches nothing real. The gate still matters — it is what
 * stops an unauthenticated request setting the cookie.
 */
export async function enterDemoModeAction(): Promise<void> {
  await authorise("control:access");
  // Fresh every time: a demonstration never opens on the last one's leftovers.
  resetControlSandbox();
  (await cookies()).set(demoCookieOptions);
  // Redirect rather than revalidate: a revalidation in the same action drops
  // the Set-Cookie header, and the demonstration would silently not start.
  redirect("/control");
}

export async function exitDemoModeAction(): Promise<void> {
  await authorise("control:access");
  (await cookies()).delete(DEMO_MODE_COOKIE);
  // Discard the sandbox on the way out rather than leaving it in memory.
  resetControlSandbox();
  redirect("/control");
}

export async function resetDemoDataAction(): Promise<void> {
  const ctx = await authorise("control:access");
  if (!ctx.demoMode) return;
  resetControlSandbox();
  revalidatePath("/control", "layout");
}
