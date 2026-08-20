import type { StrategyRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createStrategyRepository(q: Query, deps: Deps): StrategyRepository {
  return {
    async priorities(ctx) {
      return notImplemented("strategy", "priorities");
    },
    async getPriority(ctx, id) {
      return notImplemented("strategy", "getPriority");
    },
    async programmesFor(ctx, priorityId) {
      return notImplemented("strategy", "programmesFor");
    },
  };
}
