import type { FormRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFormRepository(q: Query, deps: Deps): FormRepository {
  return {
    async list(ctx) {
      return notImplemented("forms", "list");
    },
    async get(ctx, id) {
      return notImplemented("forms", "get");
    },
    async getBySlug(ctx, slug) {
      return notImplemented("forms", "getBySlug");
    },
    async versions(ctx, formId) {
      return notImplemented("forms", "versions");
    },
    async getVersion(ctx, versionId) {
      return notImplemented("forms", "getVersion");
    },
    async fields(ctx, versionId) {
      return notImplemented("forms", "fields");
    },
    async mappings(ctx, formId) {
      return notImplemented("forms", "mappings");
    },
    async saveDraft(ctx, input) {
      return notImplemented("forms", "saveDraft");
    },
    async publish(ctx, versionId) {
      return notImplemented("forms", "publish");
    },
    async submit(ctx, init) {
      return notImplemented("forms", "submit");
    },
    async submissions(ctx, formId) {
      return notImplemented("forms", "submissions");
    },
    async getSubmission(ctx, id) {
      return notImplemented("forms", "getSubmission");
    },
    async answers(ctx, submissionId) {
      return notImplemented("forms", "answers");
    },
    async consent(ctx, submissionId) {
      return notImplemented("forms", "consent");
    },
    async reviewSubmission(ctx, submissionId, status, note) {
      return notImplemented("forms", "reviewSubmission");
    },
    async withdrawConsent(ctx, consentId) {
      return notImplemented("forms", "withdrawConsent");
    },
    async redactExpired(ctx) {
      return notImplemented("forms", "redactExpired");
    },
  };
}
