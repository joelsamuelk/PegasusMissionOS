import type { SupabaseClient } from "@supabase/supabase-js";
import type { ControlRepository } from "./repository";
import type { InternalUser, StoredInternalAuditEvent } from "./types";

type Row = Record<string, unknown>;

function mapUser(row: Row): InternalUser {
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    name: String(row.name ?? row.email ?? "Internal user"),
    role: row.role as InternalUser["role"],
    status: row.status as InternalUser["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAudit(row: Row): StoredInternalAuditEvent {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    organisationId: row.organisation_id ? String(row.organisation_id) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    before: row.before_metadata as Record<string, unknown> | undefined,
    after: row.after_metadata as Record<string, unknown> | undefined,
    supportSessionId: row.support_session_id ? String(row.support_session_id) : undefined,
    requestId: String(row.request_id),
    occurredAt: String(row.occurred_at),
  };
}

export function createSupabaseControlRepository(client: SupabaseClient): ControlRepository {
  return {
    name: "supabase",
    users: {
      async current(ctx) {
        const { data, error } = await client
          .from("internal_users")
          .select("*")
          .eq("id", ctx.internalUserId)
          .eq("status", "active")
          .maybeSingle();
        if (error) throw new Error(`Could not read internal identity: ${error.message}`);
        if (!data) return null;
        return mapUser(data);
      },
      async list() {
        const { data, error } = await client
          .from("internal_users")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw new Error(`Could not list internal users: ${error.message}`);
        return (data ?? []).map(mapUser);
      },
      async changeRole(_ctx, id, role, event) {
        const { error } = await client.rpc("change_internal_user_role", {
          target_user_id: id,
          new_role: role,
          change_reason: event.reason,
          correlation_id: event.requestId,
        });
        if (error) throw new Error(`Could not update internal role: ${error.message}`);
      },
      async changeStatus(_ctx, id, status, event) {
        const { error } = await client.rpc("change_internal_user_status", {
          target_user_id: id,
          new_status: status,
          change_reason: event.reason,
          correlation_id: event.requestId,
        });
        if (error) throw new Error(`Could not update internal user: ${error.message}`);
      },
    },
    audit: {
      async append(_ctx, event) {
        const { error } = await client.from("internal_audit_events").insert({
          actor_id: event.actorId,
          action: event.action,
          target_type: event.targetType,
          target_id: event.targetId,
          organisation_id: event.organisationId,
          reason: event.reason,
          before_metadata: event.before,
          after_metadata: event.after,
          support_session_id: event.supportSessionId,
          request_id: event.requestId,
          occurred_at: event.occurredAt,
        });
        if (error) throw new Error(`Could not append internal audit: ${error.message}`);
      },
      async list() {
        const { data, error } = await client
          .from("internal_audit_events")
          .select("*")
          .order("occurred_at", { ascending: false });
        if (error) throw new Error(`Could not list internal audit: ${error.message}`);
        return (data ?? []).map(mapAudit);
      },
    },
  };
}
