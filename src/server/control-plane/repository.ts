import type { ControlRequestContext } from "./context";
import type { InternalAuditEvent } from "./audit";
import type { InternalRole } from "@/lib/control-plane/permissions";
import type { InternalUser, InternalUserStatus, StoredInternalAuditEvent } from "./types";

export interface ControlRepository {
  readonly name: "in-memory" | "supabase";
  users: {
    current(ctx: ControlRequestContext): Promise<InternalUser | null>;
    list(ctx: ControlRequestContext): Promise<InternalUser[]>;
    changeRole(
      ctx: ControlRequestContext,
      id: string,
      role: InternalRole,
      event: InternalAuditEvent,
    ): Promise<void>;
    changeStatus(
      ctx: ControlRequestContext,
      id: string,
      status: InternalUserStatus,
      event: InternalAuditEvent,
    ): Promise<void>;
  };
  audit: {
    append(ctx: ControlRequestContext, event: InternalAuditEvent): Promise<void>;
    list(ctx: ControlRequestContext): Promise<StoredInternalAuditEvent[]>;
  };
}
