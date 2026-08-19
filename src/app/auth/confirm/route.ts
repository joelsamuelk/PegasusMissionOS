import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { safeNextPath } from "@/lib/validation/auth";
import { createAnonClient } from "@/server/data/supabase/client";

function loginRedirect(request: NextRequest, error: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (appConfig.isMockData) return loginRedirect(request, "not_configured");

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createAnonClient();

  let error: { message: string } | null = null;
  if (tokenHash && type === "email") {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    return loginRedirect(request, "invalid_link");
  }

  if (error) return loginRedirect(request, "invalid_link");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return loginRedirect(request, "invalid_link");

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  if (membershipError || !memberships?.length) {
    await supabase.auth.signOut();
    return loginRedirect(request, "no_membership");
  }

  const destination = new URL(next, request.nextUrl.origin);
  return NextResponse.redirect(destination);
}
