import type { ClaimRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createClaimRepository(q: Query, deps: Deps): ClaimRepository {
  return {
    async list(ctx) {
      return notImplemented("claims", "list");
    },
    async get(ctx, id) {
      return notImplemented("claims", "get");
    },
    async forSubject(ctx, subject) {
      return notImplemented("claims", "forSubject");
    },
    async current(ctx, subject, predicate) {
      return notImplemented("claims", "current");
    },
    async create(ctx, init) {
      return notImplemented("claims", "create");
    },
    async supersede(ctx, previousId, next) {
      return notImplemented("claims", "supersede");
    },
    async supportChain(ctx, id) {
      return notImplemented("claims", "supportChain");
    },
    async recordUsage(ctx, usage) {
      return notImplemented("claims", "recordUsage");
    },
    async usages(ctx, claimId) {
      return notImplemented("claims", "usages");
    },
    async usedIn(ctx, entity) {
      return notImplemented("claims", "usedIn");
    },
    async conflicts(ctx) {
      return notImplemented("claims", "conflicts");
    },
    async recordConflict(ctx, conflict) {
      return notImplemented("claims", "recordConflict");
    },
  };
}
