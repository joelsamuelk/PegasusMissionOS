import type { EvidenceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createEvidenceRepository(_q: Query, _deps: Deps): EvidenceRepository {
  return {
    async list(_ctx) {
      return notImplemented("evidence", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("evidence", "get");
    },
    async forTarget(_ctx, _targetType, _targetId) {
      return notImplemented("evidence", "forTarget");
    },
    async forEntity(_ctx, _entity) {
      return notImplemented("evidence", "forEntity");
    },
    async support(_ctx, _evidenceId, _entity, _note) {
      return notImplemented("evidence", "support");
    },
    async add(_ctx, _item) {
      return notImplemented("evidence", "add");
    },
  };
}
