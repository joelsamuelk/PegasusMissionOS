import { requireControlCapability, type InternalRole } from "@/lib/control-plane/permissions";
import { createInternalAuditEvent } from "./audit";
import type { ControlRequestContext } from "./context";
import type { ControlRepository } from "./repository";
import type { InternalUserStatus } from "./types";

export async function changeInternalRole(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: { userId: string; role: InternalRole; reason: string },
): Promise<void> {
  requireControlCapability(ctx.role, "internal_user:manage");
  const user = (await repo.users.list(ctx)).find((candidate) => candidate.id === input.userId);
  if (!user) throw new Error("Internal user not found.");
  if (!input.reason.trim()) throw new Error("A reason is required to change an internal role.");
  if (user.id === ctx.internalUserId && user.role === "super_admin" && input.role !== "super_admin") {
    const superAdmins = (await repo.users.list(ctx)).filter(
      (candidate) => candidate.status === "active" && candidate.role === "super_admin",
    );
    if (superAdmins.length === 1) throw new Error("The final active super admin cannot remove their own role.");
  }

  const event = createInternalAuditEvent(ctx, {
      action: "internal_role.change",
      targetType: "internal_user",
      targetId: user.id,
      reason: input.reason,
      before: { role: user.role },
      after: { role: input.role },
  });
  await repo.users.changeRole(ctx, user.id, input.role, event);
}

export async function changeInternalUserStatus(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  input: { userId: string; status: InternalUserStatus; reason: string },
): Promise<void> {
  requireControlCapability(ctx.role, "internal_user:manage");
  if (input.userId === ctx.internalUserId && input.status !== "active") {
    throw new Error("You cannot suspend your own internal account.");
  }
  if (!input.reason.trim()) throw new Error("A reason is required to change user status.");
  const user = (await repo.users.list(ctx)).find((candidate) => candidate.id === input.userId);
  if (!user) throw new Error("Internal user not found.");
  const event = createInternalAuditEvent(ctx, {
      action: input.status === "suspended" ? "internal_user.disable" : "internal_user.status_change",
      targetType: "internal_user",
      targetId: user.id,
      reason: input.reason,
      before: { status: user.status },
      after: { status: input.status },
  });
  await repo.users.changeStatus(ctx, user.id, input.status, event);
}
