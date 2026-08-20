import type { ReportRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createReportRepository(_q: Query, _deps: Deps): ReportRepository {
  return {
    async list(_ctx) {
      return notImplemented("reports", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("reports", "get");
    },
    async definitions(_ctx) {
      return notImplemented("reports", "definitions");
    },
    async getDefinition(_ctx, _id) {
      return notImplemented("reports", "getDefinition");
    },
    async requirements(_ctx, _definitionId) {
      return notImplemented("reports", "requirements");
    },
    async saveDefinition(_ctx, _definition, _requirements) {
      return notImplemented("reports", "saveDefinition");
    },
    async create(_ctx, _init) {
      return notImplemented("reports", "create");
    },
    async versions(_ctx, _reportId) {
      return notImplemented("reports", "versions");
    },
    async getSnapshot(_ctx, _snapshotId) {
      return notImplemented("reports", "getSnapshot");
    },
    async cutVersion(_ctx, _reportId, _reason, _note) {
      return notImplemented("reports", "cutVersion");
    },
    async contributors(_ctx, _reportId) {
      return notImplemented("reports", "contributors");
    },
    async addContributor(_ctx, _input) {
      return notImplemented("reports", "addContributor");
    },
    async approvals(_ctx, _reportId) {
      return notImplemented("reports", "approvals");
    },
    async recordApproval(_ctx, _input) {
      return notImplemented("reports", "recordApproval");
    },
    async ingestions(_ctx) {
      return notImplemented("reports", "ingestions");
    },
    async getIngestion(_ctx, _id) {
      return notImplemented("reports", "getIngestion");
    },
    async saveIngestion(_ctx, _ingestion) {
      return notImplemented("reports", "saveIngestion");
    },
    async saveSection(_ctx, _reportId, _sectionKey, _content, _provenance) {
      return notImplemented("reports", "saveSection");
    },
    async setStatus(_ctx, _reportId, _status) {
      return notImplemented("reports", "setStatus");
    },
  };
}
