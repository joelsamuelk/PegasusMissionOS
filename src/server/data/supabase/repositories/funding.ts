import type { FundingRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFundingRepository(q: Query, deps: Deps): FundingRepository {
  return {
    async listOpportunities(ctx) {
      return notImplemented("funding", "listOpportunities");
    },
    async getOpportunity(ctx, id) {
      return notImplemented("funding", "getOpportunity");
    },
    async opportunityQuestions(ctx, opportunityId) {
      return notImplemented("funding", "opportunityQuestions");
    },
    async listFunders(ctx) {
      return notImplemented("funding", "listFunders");
    },
    async getFunder(ctx, id) {
      return notImplemented("funding", "getFunder");
    },
    async moveStage(ctx, id, stage) {
      return notImplemented("funding", "moveStage");
    },
    async toggleSaved(ctx, id) {
      return notImplemented("funding", "toggleSaved");
    },
    async getFitAssessment(ctx, opportunityId) {
      return notImplemented("funding", "getFitAssessment");
    },
    async saveFitAssessment(ctx, assessment) {
      return notImplemented("funding", "saveFitAssessment");
    },
  };
}
