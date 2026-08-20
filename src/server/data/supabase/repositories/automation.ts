import type { AutomationRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createAutomationRepository(_q: Query, _deps: Deps): AutomationRepository {
  return {
    async list(_ctx) {
      return notImplemented("automation", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("automation", "get");
    },
    async activeFor(_ctx, _kind) {
      return notImplemented("automation", "activeFor");
    },
    async save(_ctx, _input) {
      return notImplemented("automation", "save");
    },
    async setStatus(_ctx, _id, _status) {
      return notImplemented("automation", "setStatus");
    },
    async recordEvent(_ctx, _event) {
      return notImplemented("automation", "recordEvent");
    },
    async events(_ctx, _options) {
      return notImplemented("automation", "events");
    },
    async markEventProcessed(_ctx, _eventId) {
      return notImplemented("automation", "markEventProcessed");
    },
    async runs(_ctx, _options) {
      return notImplemented("automation", "runs");
    },
    async getRun(_ctx, _runId) {
      return notImplemented("automation", "getRun");
    },
    async steps(_ctx, _runId) {
      return notImplemented("automation", "steps");
    },
    async failures(_ctx, _runId) {
      return notImplemented("automation", "failures");
    },
    async recordRun(_ctx, _run, _steps) {
      return notImplemented("automation", "recordRun");
    },
    async updateStep(_ctx, _stepId, _patch) {
      return notImplemented("automation", "updateStep");
    },
    async completeRun(_ctx, _runId, _outcome, _finishedAt) {
      return notImplemented("automation", "completeRun");
    },
    async approveRun(_ctx, _runId) {
      return notImplemented("automation", "approveRun");
    },
    async recordFailure(_ctx, _failure) {
      return notImplemented("automation", "recordFailure");
    },
    async scheduleJob(_ctx, _job) {
      return notImplemented("automation", "scheduleJob");
    },
    async dueJobs(_ctx, _now) {
      return notImplemented("automation", "dueJobs");
    },
    async completeJob(_ctx, _jobId, _status, _error) {
      return notImplemented("automation", "completeJob");
    },
  };
}
