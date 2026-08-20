import type { RequirementRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createRequirementRepository(_q: Query, _deps: Deps): RequirementRepository {
  return {
    async list(_ctx) {
      return notImplemented("requirements", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("requirements", "get");
    },
    async forGrant(_ctx, _grantId) {
      return notImplemented("requirements", "forGrant");
    },
    async requires(_ctx, _requirementId) {
      return notImplemented("requirements", "requires");
    },
  };
}
