import type { EvidenceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createEvidenceRepository(q: Query, deps: Deps): EvidenceRepository {
  return {
    async list(ctx) {
      return notImplemented("evidence", "list");
    },
    async get(ctx, id) {
      return notImplemented("evidence", "get");
    },
    async forTarget(ctx, targetType, targetId) {
      return notImplemented("evidence", "forTarget");
    },
    async forEntity(ctx, entity) {
      return notImplemented("evidence", "forEntity");
    },
    async support(ctx, evidenceId, entity, note) {
      return notImplemented("evidence", "support");
    },
    async add(ctx, item) {
      return notImplemented("evidence", "add");
    },
  };
}
