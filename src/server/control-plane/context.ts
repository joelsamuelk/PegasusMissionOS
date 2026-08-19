import type { InternalRole } from "@/lib/control-plane/permissions";
import { headers } from "next/headers";
import { appConfig } from "@/lib/config";
import { createAnonClient } from "@/server/data/supabase/client";

/** Identity for an internal request. It intentionally contains no tenant role. */
export interface ControlRequestContext {
  internalUserId: string;
  role: InternalRole;
  requestId: string;
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
  init: Omit<ControlRequestContext, "now"> & { now?: () => Date },
): ControlRequestContext {
  return { ...init, now: init.now ?? (() => new Date()) };
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

  if (appConfig.control.mockEnabled) {
    return createControlRequestContext({
      internalUserId: "internal-demo",
      role: "super_admin",
      requestId,
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
  });
}
