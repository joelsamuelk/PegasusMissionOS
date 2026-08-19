"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appConfig } from "@/lib/config";
import { magicLinkSchema, type MagicLinkState } from "@/lib/validation/auth";
import { rateLimit } from "@/server/rate-limit";
import { createAnonClient } from "@/server/data/supabase/client";

/**
 * `@public-action` — authentication must be reachable before a session exists.
 * Input validation, invite-only account creation and per-IP throttling protect
 * the public action from being used to enumerate users or flood inboxes.
 */

const MAGIC_LINK_LIMIT = 5;
const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;

async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  return `magic-link:${ip}`;
}

export async function requestMagicLink(
  _previousState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check your email address and try again.",
      errors: { email: parsed.error.flatten().fieldErrors.email?.[0] },
    };
  }

  if (appConfig.isMockData) {
    return {
      status: "error",
      message:
        "Email sign-in is not configured yet. Continue to the demonstration workspace.",
    };
  }

  const limit = rateLimit(await clientKey(), {
    limit: MAGIC_LINK_LIMIT,
    windowMs: MAGIC_LINK_WINDOW_MS,
  });
  if (!limit.allowed) {
    return {
      status: "error",
      message:
        "Too many sign-in links were requested. Please wait 15 minutes and try again.",
    };
  }

  const supabase = await createAnonClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appConfig.appUrl}/auth/confirm?next=/dashboard`,
    },
  });

  // Do not reveal whether an email is registered. Supabase intentionally uses
  // similarly opaque responses; keep the application boundary opaque too.
  if (error) console.error("Magic-link request failed", { code: error.code });

  return {
    status: "success",
    message:
      "If that email belongs to an active Pegasus account, a secure sign-in link is on its way.",
  };
}

export async function signOut(): Promise<never> {
  if (!appConfig.isMockData) {
    const supabase = await createAnonClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
