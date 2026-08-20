import type { AIGeneration, AuditEvent } from "@/types/domain";
import type { AuditRepository } from "../../types";
import { arrayFrom, type Row } from "../mapping";
import type { Query } from "../query";

function mapEvent(row: Row): AuditEvent {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.actor_id ? { actorId: String(row.actor_id) } : {}),
    actorName: String(row.actor_name ?? "System"),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    summary: String(row.summary ?? ""),
    createdAt: String(row.created_at),
  };
}

function mapGeneration(row: Row): AIGeneration {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    feature: String(row.feature),
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    ...(row.user_id ? { userId: String(row.user_id) } : {}),
    inputRefs: arrayFrom(row.input_refs),
    outputPreview: String(row.output_preview ?? ""),
    approvalStatus: row.approval_status as AIGeneration["approvalStatus"],
    createdAt: String(row.created_at),
  };
}

export function createAuditRepository(q: Query): AuditRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "audit_events", {}, { order: { column: "created_at", ascending: false } });
      return rows.map(mapEvent);
    },

    async record(ctx, event) {
      // `actor_name` is denormalised on purpose: an audit trail that resolves
      // the actor by join reads differently after the user is renamed or
      // removed, which is precisely when it is being read.
      const actor = await q.maybeOne(ctx, "organisation_members", { user_id: ctx.userId });
      const user = actor
        ? await (await q.client()).from("users").select("name").eq("id", ctx.userId).maybeSingle()
        : null;

      await q.insert(
        ctx,
        "audit_events",
        {
          actorId: ctx.userId,
          actorName: (user?.data?.name as string | undefined) ?? "System",
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          summary: event.summary,
          createdAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
    },

    async recordAiGeneration(ctx, generation) {
      const row = await q.insert(
        ctx,
        "ai_generations",
        {
          feature: generation.feature,
          model: generation.model,
          promptVersion: generation.promptVersion,
          userId: ctx.userId,
          inputRefs: generation.inputRefs,
          outputPreview: generation.outputPreview,
          approvalStatus: generation.approvalStatus,
          createdAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
      return mapGeneration(row);
    },

    async aiGenerations(ctx) {
      const rows = await q.many(ctx, "ai_generations", {}, { order: { column: "created_at", ascending: false } });
      return rows.map(mapGeneration);
    },
  };
}
