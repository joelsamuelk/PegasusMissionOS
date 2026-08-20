import type { StrategyRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createStrategyRepository(_q: Query, _deps: Deps): StrategyRepository {
  return {
    async priorities(_ctx) {
      return notImplemented("strategy", "priorities");
    },
    async getPriority(_ctx, _id) {
      return notImplemented("strategy", "getPriority");
    },
    async programmesFor(_ctx, _priorityId) {
      return notImplemented("strategy", "programmesFor");
    },
  };
}
