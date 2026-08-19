/** Control Plane roles are deliberately unrelated to Mission OS tenant roles. */
export type InternalRole =
  | "super_admin"
  | "operations"
  | "sales"
  | "customer_success"
  | "support"
  | "product"
  | "finance"
  | "read_only";

export const CONTROL_CAPABILITIES = [
  "control:access",
  "internal_user:manage",
  "organisation:create",
  "organisation:view_metadata",
  "organisation:suspend",
  "prospect:create",
  "prospect:update",
  "outreach:send",
  "support:request_access",
  "support:read_customer_data",
  "support:elevated_access",
  "billing:view",
  "billing:manage",
  "feature_flag:manage",
  "ai_trace:view",
  "audit:view",
] as const;

export type ControlCapability = (typeof CONTROL_CAPABILITIES)[number];

const all = new Set<ControlCapability>(CONTROL_CAPABILITIES);
const metadata: ControlCapability[] = ["control:access", "organisation:view_metadata"];

const ROLE_CAPABILITIES: Record<InternalRole, ReadonlySet<ControlCapability>> = {
  super_admin: all,
  operations: new Set([
    ...metadata,
    "organisation:create",
    "organisation:suspend",
    "prospect:create",
    "prospect:update",
    "support:request_access",
    "feature_flag:manage",
    "audit:view",
  ]),
  sales: new Set([
    ...metadata,
    "prospect:create",
    "prospect:update",
    "outreach:send",
  ]),
  customer_success: new Set([
    ...metadata,
    "prospect:update",
    "support:request_access",
  ]),
  support: new Set([
    ...metadata,
    "support:request_access",
    "support:read_customer_data",
  ]),
  product: new Set([...metadata, "ai_trace:view", "feature_flag:manage"]),
  finance: new Set([...metadata, "billing:view", "billing:manage"]),
  read_only: new Set(metadata),
};

export function controlCapabilitiesFor(role: InternalRole): ControlCapability[] {
  return [...ROLE_CAPABILITIES[role]];
}

export function canControl(role: InternalRole, capability: ControlCapability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export class ControlAuthorisationError extends Error {
  constructor(capability: ControlCapability) {
    super(`Internal user lacks required capability: ${capability}`);
    this.name = "ControlAuthorisationError";
  }
}

export function requireControlCapability(
  role: InternalRole,
  capability: ControlCapability,
): void {
  if (!canControl(role, capability)) throw new ControlAuthorisationError(capability);
}
