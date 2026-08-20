import type { DocumentRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createDocumentRepository(q: Query, deps: Deps): DocumentRepository {
  return {
    async list(ctx) {
      return notImplemented("documents", "list");
    },
    async get(ctx, id) {
      return notImplemented("documents", "get");
    },
    async versions(ctx, documentId) {
      return notImplemented("documents", "versions");
    },
    async currentVersion(ctx, documentId) {
      return notImplemented("documents", "currentVersion");
    },
    async sources(ctx, documentId) {
      return notImplemented("documents", "sources");
    },
    async create(ctx, input) {
      return notImplemented("documents", "create");
    },
    async addVersion(ctx, documentId, version) {
      return notImplemented("documents", "addVersion");
    },
    async extractedClaims(ctx, documentId) {
      return notImplemented("documents", "extractedClaims");
    },
    async saveExtractedClaims(ctx, claims) {
      return notImplemented("documents", "saveExtractedClaims");
    },
    async setExtractedClaimStatus(ctx, id, status, claimId) {
      return notImplemented("documents", "setExtractedClaimStatus");
    },
  };
}
