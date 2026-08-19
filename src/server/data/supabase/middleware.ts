import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";

/** Refresh an SSR auth session and copy rotated cookies onto the final response. */
export async function refreshAuthSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (appConfig.isMockData) return response;

  const supabase = createServerClient(
    appConfig.supabase.url,
    appConfig.supabase.anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser validates and refreshes the token; getSession alone trusts the cookie.
  await supabase.auth.getUser();
  return response;
}
