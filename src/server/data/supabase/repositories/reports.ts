import type { ReportRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createReportRepository(q: Query, deps: Deps): ReportRepository {
  return {
    async list(ctx) {
      return notImplemented("reports", "list");
    },
    async get(ctx, id) {
      return notImplemented("reports", "get");
    },
    async definitions(ctx) {
      return notImplemented("reports", "definitions");
    },
    async getDefinition(ctx, id) {
      return notImplemented("reports", "getDefinition");
    },
    async requirements(ctx, definitionId) {
      return notImplemented("reports", "requirements");
    },
    async saveDefinition(ctx, definition, requirements) {
      return notImplemented("reports", "saveDefinition");
    },
    async create(ctx, init) {
      return notImplemented("reports", "create");
    },
    async versions(ctx, reportId) {
      return notImplemented("reports", "versions");
    },
    async getSnapshot(ctx, snapshotId) {
      return notImplemented("reports", "getSnapshot");
    },
    async cutVersion(ctx, reportId, reason, note) {
      return notImplemented("reports", "cutVersion");
    },
    async contributors(ctx, reportId) {
      return notImplemented("reports", "contributors");
    },
    async addContributor(ctx, input) {
      return notImplemented("reports", "addContributor");
    },
    async approvals(ctx, reportId) {
      return notImplemented("reports", "approvals");
    },
    async recordApproval(ctx, input) {
      return notImplemented("reports", "recordApproval");
    },
    async ingestions(ctx) {
      return notImplemented("reports", "ingestions");
    },
    async getIngestion(ctx, id) {
      return notImplemented("reports", "getIngestion");
    },
    async saveIngestion(ctx, ingestion) {
      return notImplemented("reports", "saveIngestion");
    },
    async saveSection(ctx, reportId, sectionKey, content, provenance) {
      return notImplemented("reports", "saveSection");
    },
    async setStatus(ctx, reportId, status) {
      return notImplemented("reports", "setStatus");
    },
  };
}
