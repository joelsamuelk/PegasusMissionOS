import type { InternalRole } from "@/lib/control-plane/permissions";
import type { InternalAuditEvent } from "./audit";

export type InternalUserStatus = "invited" | "active" | "suspended";

export interface InternalUser {
  id: string;
  email: string;
  name: string;
  role: InternalRole;
  status: InternalUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredInternalAuditEvent extends InternalAuditEvent {
  id: string;
}
