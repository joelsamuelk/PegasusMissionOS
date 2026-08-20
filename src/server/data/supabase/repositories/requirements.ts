import type { RequirementRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createRequirementRepository(q: Query, deps: Deps): RequirementRepository {
  return {
    async list(ctx) {
      return notImplemented("requirements", "list");
    },
    async get(ctx, id) {
      return notImplemented("requirements", "get");
    },
    async forGrant(ctx, grantId) {
      return notImplemented("requirements", "forGrant");
    },
    async requires(ctx, requirementId) {
      return notImplemented("requirements", "requires");
    },
  };
}
