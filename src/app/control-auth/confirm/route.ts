import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { createAnonClient } from "@/server/data/supabase/client";
const failure = (request: NextRequest, error: string) => {
  const url = new URL("/control-login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
};
export async function GET(request: NextRequest) {
  if (appConfig.isMockData) return failure(request, "not_configured");
  const client = await createAnonClient(),
    token = request.nextUrl.searchParams.get("token_hash"),
    type = request.nextUrl.searchParams.get("type"),
    code = request.nextUrl.searchParams.get("code");
  let error: { message: string } | null = null;
  if (token && type === "email")
    ({ error } = await client.auth.verifyOtp({
      token_hash: token,
      type: type as EmailOtpType,
    }));
  else if (code) ({ error } = await client.auth.exchangeCodeForSession(code));
  else return failure(request, "invalid_link");
  if (error) return failure(request, "invalid_link");
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return failure(request, "invalid_link");
  const { data: internal, error: lookupError } = await client
    .from("internal_users")
    .select("id")
    .eq("id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (lookupError || !internal) {
    await client.auth.signOut();
    return failure(request, "not_internal");
  }
  return NextResponse.redirect(new URL("/control", request.url));
}
