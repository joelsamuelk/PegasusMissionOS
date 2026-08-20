import type { AutomationRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createAutomationRepository(q: Query, deps: Deps): AutomationRepository {
  return {
    async list(ctx) {
      return notImplemented("automation", "list");
    },
    async get(ctx, id) {
      return notImplemented("automation", "get");
    },
    async activeFor(ctx, kind) {
      return notImplemented("automation", "activeFor");
    },
    async save(ctx, input) {
      return notImplemented("automation", "save");
    },
    async setStatus(ctx, id, status) {
      return notImplemented("automation", "setStatus");
    },
    async recordEvent(ctx, event) {
      return notImplemented("automation", "recordEvent");
    },
    async events(ctx, options) {
      return notImplemented("automation", "events");
    },
    async markEventProcessed(ctx, eventId) {
      return notImplemented("automation", "markEventProcessed");
    },
    async runs(ctx, options) {
      return notImplemented("automation", "runs");
    },
    async getRun(ctx, runId) {
      return notImplemented("automation", "getRun");
    },
    async steps(ctx, runId) {
      return notImplemented("automation", "steps");
    },
    async failures(ctx, runId) {
      return notImplemented("automation", "failures");
    },
    async recordRun(ctx, run, steps) {
      return notImplemented("automation", "recordRun");
    },
    async updateStep(ctx, stepId, patch) {
      return notImplemented("automation", "updateStep");
    },
    async completeRun(ctx, runId, outcome, finishedAt) {
      return notImplemented("automation", "completeRun");
    },
    async approveRun(ctx, runId) {
      return notImplemented("automation", "approveRun");
    },
    async recordFailure(ctx, failure) {
      return notImplemented("automation", "recordFailure");
    },
    async scheduleJob(ctx, job) {
      return notImplemented("automation", "scheduleJob");
    },
    async dueJobs(ctx, now) {
      return notImplemented("automation", "dueJobs");
    },
    async completeJob(ctx, jobId, status, error) {
      return notImplemented("automation", "completeJob");
    },
  };
}
