import type { ControlRepository } from "./repository";
import type { InternalUser, StoredInternalAuditEvent } from "./types";

export interface ControlMemoryState {
  users: InternalUser[];
  audit: StoredInternalAuditEvent[];
}

export function createInMemoryControlRepository(state: ControlMemoryState): ControlRepository {
  return {
    name: "in-memory",
    users: {
      async current(ctx) {
        return state.users.find((user) => user.id === ctx.internalUserId) ?? null;
      },
      async list() {
        return state.users.map((user) => ({ ...user }));
      },
      async changeRole(ctx, id, role, event) {
        const user = state.users.find((candidate) => candidate.id === id);
        if (!user) throw new Error("Internal user not found.");
        user.role = role;
        user.updatedAt = ctx.now().toISOString();
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
      async changeStatus(ctx, id, status, event) {
        const user = state.users.find((candidate) => candidate.id === id);
        if (!user) throw new Error("Internal user not found.");
        user.status = status;
        user.updatedAt = ctx.now().toISOString();
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
    },
    audit: {
      async append(_ctx, event) {
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
      async list() {
        return state.audit
          .map((event) => ({ ...event }))
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      },
    },
  };
}
