import type { WorkspaceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createWorkspaceRepository(q: Query, deps: Deps): WorkspaceRepository {
  return {
    async tasks(ctx) {
      return notImplemented("workspace", "tasks");
    },
    async openTasks(ctx) {
      return notImplemented("workspace", "openTasks");
    },
    async notifications(ctx) {
      return notImplemented("workspace", "notifications");
    },
    async activity(ctx) {
      return notImplemented("workspace", "activity");
    },
    async toggleTask(ctx, taskId) {
      return notImplemented("workspace", "toggleTask");
    },
    async createTask(ctx, input) {
      return notImplemented("workspace", "createTask");
    },
    async notify(ctx, input) {
      return notImplemented("workspace", "notify");
    },
  };
}
