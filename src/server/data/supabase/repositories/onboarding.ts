import type { OnboardingRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createOnboardingRepository(q: Query, deps: Deps): OnboardingRepository {
  return {
    async runs(ctx) {
      return notImplemented("onboarding", "runs");
    },
    async getRun(ctx, id) {
      return notImplemented("onboarding", "getRun");
    },
    async latestRun(ctx) {
      return notImplemented("onboarding", "latestRun");
    },
    async startRun(ctx, input) {
      return notImplemented("onboarding", "startRun");
    },
    async updateRun(ctx, id, patch) {
      return notImplemented("onboarding", "updateRun");
    },
    async sources(ctx, runId) {
      return notImplemented("onboarding", "sources");
    },
    async saveSources(ctx, runId, sources) {
      return notImplemented("onboarding", "saveSources");
    },
    async candidates(ctx, runId) {
      return notImplemented("onboarding", "candidates");
    },
    async getCandidate(ctx, id) {
      return notImplemented("onboarding", "getCandidate");
    },
    async saveCandidates(ctx, runId, candidates) {
      return notImplemented("onboarding", "saveCandidates");
    },
    async decide(ctx, candidateId, decision, editedValue) {
      return notImplemented("onboarding", "decide");
    },
    async decisions(ctx, runId) {
      return notImplemented("onboarding", "decisions");
    },
  };
}
