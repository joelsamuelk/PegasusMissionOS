import type { DocumentRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createDocumentRepository(_q: Query, _deps: Deps): DocumentRepository {
  return {
    async list(_ctx) {
      return notImplemented("documents", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("documents", "get");
    },
    async versions(_ctx, _documentId) {
      return notImplemented("documents", "versions");
    },
    async currentVersion(_ctx, _documentId) {
      return notImplemented("documents", "currentVersion");
    },
    async sources(_ctx, _documentId) {
      return notImplemented("documents", "sources");
    },
    async create(_ctx, _input) {
      return notImplemented("documents", "create");
    },
    async addVersion(_ctx, _documentId, _version) {
      return notImplemented("documents", "addVersion");
    },
    async extractedClaims(_ctx, _documentId) {
      return notImplemented("documents", "extractedClaims");
    },
    async saveExtractedClaims(_ctx, _claims) {
      return notImplemented("documents", "saveExtractedClaims");
    },
    async setExtractedClaimStatus(_ctx, _id, _status, _claimId) {
      return notImplemented("documents", "setExtractedClaimStatus");
    },
  };
}
