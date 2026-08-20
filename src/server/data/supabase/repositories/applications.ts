import type { ApplicationRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createApplicationRepository(q: Query, deps: Deps): ApplicationRepository {
  return {
    async list(ctx) {
      return notImplemented("applications", "list");
    },
    async get(ctx, id) {
      return notImplemented("applications", "get");
    },
    async answers(ctx, applicationId) {
      return notImplemented("applications", "answers");
    },
    async getAnswer(ctx, answerId) {
      return notImplemented("applications", "getAnswer");
    },
    async saveAnswer(ctx, answerId, draft, provenance) {
      return notImplemented("applications", "saveAnswer");
    },
    async setAnswerStatus(ctx, answerId, status) {
      return notImplemented("applications", "setAnswerStatus");
    },
    async convertToGrant(ctx, applicationId) {
      return notImplemented("applications", "convertToGrant");
    },
  };
}
