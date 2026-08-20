import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { appConfig } from "@/lib/config";

/**
 * Supabase clients. **Server-side only.**
 *
 * Two clients, and the difference between them is a security boundary rather
 * than a convenience:
 *
 * - `createAnonClient()` carries the caller's session. Postgres sees a real
 *   `auth.uid()`, so row level security applies. This is the client every
 *   request path uses.
 * - `createServiceClient()` uses the service role key, which **bypasses RLS
 *   entirely**. It exists for migration and seeding only.
 *
 * Defence in depth means the adapter filters by `organisation_id` *and* RLS
 * enforces it independently. A service-role client removes the second layer, so
 * using one to serve a request would silently reduce two protections to one —
 * and the tests would still pass, because adapter filtering would carry it.
 */

function requireConfig(): { url: string; anonKey: string } {
  const { url, anonKey } = appConfig.supabase;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, or leave them unset to run on the " +
        "in-memory adapter.",
    );
  }
  return { url, anonKey };
}

/**
 * A client bound to the caller's session, so RLS applies.
 *
 * Memoised per request. The repository resolves a client for every query
 * rather than holding one, because a client carries the caller's session and
 * the repository is a process-lifetime singleton — so without this, a page
 * making twenty reads would read cookies and construct a client twenty times.
 * `cache()` is request-scoped, which is exactly the lifetime a session has:
 * shared across one request, never across two.
 *
 * Cookie writes are tolerated failing: Next forbids setting cookies from a
 * server component, and Supabase's session refresh attempts one. Middleware is
 * the supported place to refresh, so swallowing here is correct rather than
 * lazy — but only for the write path, never the read.
 */
export const createAnonClient = cache(async function createAnonClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component. Session refresh happens in
          // middleware; this call is the one that cannot write, and failing it
          // silently is the documented Supabase pattern.
        }
      },
    },
  });
});

/**
 * A client that bypasses row level security.
 *
 * Never use this to serve a request. It is for migration, seeding and
 * administrative scripts, where there is no session to act on behalf of.
 */
export async function createServiceClient(): Promise<SupabaseClient> {
  const { url } = requireConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for administrative operations.",
    );
  }
  // Imported lazily so the RLS-bypassing path is not pulled into any module
  // that only needs the request-scoped client.
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
