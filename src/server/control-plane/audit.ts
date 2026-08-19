import type { ControlRequestContext } from "./context";

export const REASON_REQUIRED_ACTIONS = [
  "organisation.provision",
  "organisation.suspend",
  "internal_role.change",
  "support_access.start",
  "customer_data.read",
  "feature_flag.override",
  "billing.change",
  "internal_user.disable",
  "customer_health.override",
] as const;

export type HighRiskControlAction = (typeof REASON_REQUIRED_ACTIONS)[number];

export interface InternalAuditEvent {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  organisationId?: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  supportSessionId?: string;
  requestId: string;
  occurredAt: string;
}

export interface InternalAuditRepository {
  append(event: InternalAuditEvent): Promise<void>;
}

export function createInternalAuditEvent(
  ctx: ControlRequestContext,
  input: Omit<InternalAuditEvent, "actorId" | "requestId" | "occurredAt" | "supportSessionId">,
): InternalAuditEvent {
  if (
    (REASON_REQUIRED_ACTIONS as readonly string[]).includes(input.action) &&
    !input.reason?.trim()
  ) {
    throw new Error(`Audit reason is required for ${input.action}`);
  }
  return {
    ...input,
    actorId: ctx.internalUserId,
    requestId: ctx.requestId,
    supportSessionId: ctx.supportSession?.id,
    occurredAt: ctx.now().toISOString(),
  };
}
