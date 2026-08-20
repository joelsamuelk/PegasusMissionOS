import type { OnboardingRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createOnboardingRepository(_q: Query, _deps: Deps): OnboardingRepository {
  return {
    async runs(_ctx) {
      return notImplemented("onboarding", "runs");
    },
    async getRun(_ctx, _id) {
      return notImplemented("onboarding", "getRun");
    },
    async latestRun(_ctx) {
      return notImplemented("onboarding", "latestRun");
    },
    async startRun(_ctx, _input) {
      return notImplemented("onboarding", "startRun");
    },
    async updateRun(_ctx, _id, _patch) {
      return notImplemented("onboarding", "updateRun");
    },
    async sources(_ctx, _runId) {
      return notImplemented("onboarding", "sources");
    },
    async saveSources(_ctx, _runId, _sources) {
      return notImplemented("onboarding", "saveSources");
    },
    async candidates(_ctx, _runId) {
      return notImplemented("onboarding", "candidates");
    },
    async getCandidate(_ctx, _id) {
      return notImplemented("onboarding", "getCandidate");
    },
    async saveCandidates(_ctx, _runId, _candidates) {
      return notImplemented("onboarding", "saveCandidates");
    },
    async decide(_ctx, _candidateId, _decision, _editedValue) {
      return notImplemented("onboarding", "decide");
    },
    async decisions(_ctx, _runId) {
      return notImplemented("onboarding", "decisions");
    },
  };
}
