import type { WorkspaceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createWorkspaceRepository(_q: Query, _deps: Deps): WorkspaceRepository {
  return {
    async tasks(_ctx) {
      return notImplemented("workspace", "tasks");
    },
    async openTasks(_ctx) {
      return notImplemented("workspace", "openTasks");
    },
    async notifications(_ctx) {
      return notImplemented("workspace", "notifications");
    },
    async activity(_ctx) {
      return notImplemented("workspace", "activity");
    },
    async toggleTask(_ctx, _taskId) {
      return notImplemented("workspace", "toggleTask");
    },
    async createTask(_ctx, _input) {
      return notImplemented("workspace", "createTask");
    },
    async notify(_ctx, _input) {
      return notImplemented("workspace", "notify");
    },
  };
}
