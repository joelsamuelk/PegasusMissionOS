import type { GrantRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createGrantRepository(q: Query, deps: Deps): GrantRepository {
  return {
    async list(ctx) {
      return notImplemented("grants", "list");
    },
    async get(ctx, id) {
      return notImplemented("grants", "get");
    },
    async payments(ctx, grantId) {
      return notImplemented("grants", "payments");
    },
    async deliverables(ctx, grantId) {
      return notImplemented("grants", "deliverables");
    },
    async reports(ctx, grantId) {
      return notImplemented("grants", "reports");
    },
    async allReports(ctx) {
      return notImplemented("grants", "allReports");
    },
  };
}
