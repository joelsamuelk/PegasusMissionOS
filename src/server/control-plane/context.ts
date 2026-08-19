import type { InternalRole } from "@/lib/control-plane/permissions";
import { cookies, headers } from "next/headers";
import { appConfig } from "@/lib/config";
import { DEMO_MODE_COOKIE, isDemoCookie } from "@/lib/control-plane/demo-mode";
import { createAnonClient } from "@/server/data/supabase/client";

/** Identity for an internal request. It intentionally contains no tenant role. */
export interface ControlRequestContext {
  internalUserId: string;
  role: InternalRole;
  requestId: string;
  /**
   * True while this session is demonstrating.
   *
   * Resolved once, here. Every surface that can render curated example content
   * reads it, and the repository reads it to hand back a sandbox, so no page
   * can decide to show or write demonstration data on its own.
   */
  demoMode: boolean;
  now(): Date;
  /** Present only during an explicitly established support session. */
  supportSession?: {
    id: string;
    organisationId: string;
    scope: "read_only" | "troubleshooting" | "elevated";
    expiresAt: Date;
  };
}

export function createControlRequestContext(
  init: Omit<ControlRequestContext, "now" | "demoMode"> & {
    now?: () => Date;
    demoMode?: boolean;
  },
): ControlRequestContext {
  return {
    ...init,
    demoMode: init.demoMode ?? false,
    now: init.now ?? (() => new Date()),
  };
}

export function activeSupportSession(
  ctx: ControlRequestContext,
  organisationId: string,
): NonNullable<ControlRequestContext["supportSession"]> | null {
  const session = ctx.supportSession;
  if (!session || session.organisationId !== organisationId) return null;
  return session.expiresAt.getTime() > ctx.now().getTime() ? session : null;
}

export class ControlNotAuthenticatedError extends Error {
  constructor() {
    super("No active internal session.");
    this.name = "ControlNotAuthenticatedError";
  }
}

export class ControlMembershipError extends Error {
  constructor() {
    super("This account is not an active Pegasus internal user.");
    this.name = "ControlMembershipError";
  }
}

export async function resolveControlRequestContext(): Promise<ControlRequestContext> {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id") ?? crypto.randomUUID();

  // Read before authentication: a demonstration is entered by a signed-in
  // operator, but the flag itself is session state rather than identity.
  const demoMode = isDemoCookie((await cookies()).get(DEMO_MODE_COOKIE)?.value);

  if (appConfig.control.mockEnabled) {
    // Local development against the mock store. The demonstration cookie still
    // decides which views render, so both can be worked on without Supabase.
    return createControlRequestContext({
      internalUserId: "internal-demo",
      role: "super_admin",
      requestId,
      demoMode,
    });
  }
  if (appConfig.isMockData) throw new ControlNotAuthenticatedError();

  const client = await createAnonClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new ControlNotAuthenticatedError();

  const { data, error } = await client
    .from("internal_users")
    .select("id, role, status")
    .eq("id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new ControlMembershipError();

  return createControlRequestContext({
    internalUserId: data.id,
    role: data.role as InternalRole,
    requestId,
    demoMode,
  });
}
