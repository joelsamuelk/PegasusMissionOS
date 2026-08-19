"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { appConfig } from "@/lib/config";
import { rateLimit } from "@/server/rate-limit";
import { createAnonClient } from "@/server/data/supabase/client";
type State = { status: "idle" | "success" | "error"; message?: string };
const schema = z.string().trim().email().max(254);
export async function requestControlMagicLink(
  _state: State,
  formData: FormData,
): Promise<State> {
  const parsed = schema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid work email." };
  if (appConfig.isMockData)
    return { status: "error", message: "Internal sign-in is not configured." };
  const requestHeaders = await headers(),
    ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      "unknown";
  if (
    !rateLimit(`control-magic-link:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 }).allowed
  )
    return { status: "error", message: "Too many requests. Please wait 15 minutes." };
  const client = await createAnonClient();
  const { error } = await client.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      // The shared Supabase template appends the token hash with `&`, so
      // every callback destination deliberately includes a query string.
      emailRedirectTo: `${appConfig.controlUrl}/control-auth/confirm?next=/control`,
    },
  });
  if (error) console.error("Control magic-link request failed", { code: error.code });
  return {
    status: "success",
    message:
      "If that email belongs to an active internal account, a secure link is on its way.",
  };
}
