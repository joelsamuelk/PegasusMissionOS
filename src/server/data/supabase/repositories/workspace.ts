import type { ActivityEvent, Notification, Task } from "@/types/domain";
import type { WorkspaceRepository } from "../../types";
import { auditFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapTask(row: Row): Task {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    status: row.status as Task["status"],
    ...(row.due_date ? { dueDate: String(row.due_date) } : {}),
    ...(row.assignee_id ? { assigneeId: String(row.assignee_id) } : {}),
    ...(row.related_type ? { relatedType: String(row.related_type) } : {}),
    ...(row.related_id ? { relatedId: String(row.related_id) } : {}),
    audit: auditFrom(row),
  };
}

function mapNotification(row: Row): Notification {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    kind: row.kind as Notification["kind"],
    read: Boolean(row.read),
    createdAt: String(row.created_at),
    ...(row.href ? { href: String(row.href) } : {}),
  };
}

function mapActivity(row: Row): ActivityEvent {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.actor_id ? { actorId: String(row.actor_id) } : {}),
    actorName: String(row.actor_name),
    verb: String(row.verb),
    target: String(row.target),
    createdAt: String(row.created_at),
  };
}

export function createWorkspaceRepository(q: Query, _deps: Deps): WorkspaceRepository {
  return {
    async tasks(ctx) {
      const rows = await q.many(ctx, "tasks", {}, { order: { column: "due_date" } });
      return rows.map(mapTask);
    },

    async openTasks(ctx) {
      const rows = await q.many(ctx, "tasks", {}, { order: { column: "due_date" } });
      return rows.map(mapTask).filter((t) => t.status !== "done");
    },

    async notifications(ctx) {
      const rows = await q.many(ctx, "notifications", {}, {
        order: { column: "created_at", ascending: false },
      });
      return rows.map(mapNotification);
    },

    async activity(ctx) {
      const rows = await q.many(ctx, "activity_events", {}, {
        order: { column: "created_at", ascending: false },
      });
      return rows.map(mapActivity);
    },

    async toggleTask(ctx, taskId) {
      const row = await q.maybeOne(ctx, "tasks", { id: taskId });
      if (!row) return;
      await q.update(ctx, "tasks", taskId, {
        status: row.status === "done" ? "todo" : "done",
      });
    },

    async createTask(ctx, input) {
      const row = await q.insert(ctx, "tasks", {
        title: input.title,
        status: input.status ?? "todo",
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      });
      return String(row.id);
    },

    async notify(ctx, input) {
      const row = await q.insert(
        ctx,
        "notifications",
        {
          title: input.title,
          body: input.body,
          kind: input.kind,
          href: input.href,
          read: false,
          createdAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
      return String(row.id);
    },
  };
}
