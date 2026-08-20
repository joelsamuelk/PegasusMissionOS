import type { FormRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFormRepository(_q: Query, _deps: Deps): FormRepository {
  return {
    async list(_ctx) {
      return notImplemented("forms", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("forms", "get");
    },
    async getBySlug(_ctx, _slug) {
      return notImplemented("forms", "getBySlug");
    },
    async versions(_ctx, _formId) {
      return notImplemented("forms", "versions");
    },
    async getVersion(_ctx, _versionId) {
      return notImplemented("forms", "getVersion");
    },
    async fields(_ctx, _versionId) {
      return notImplemented("forms", "fields");
    },
    async mappings(_ctx, _formId) {
      return notImplemented("forms", "mappings");
    },
    async saveDraft(_ctx, _input) {
      return notImplemented("forms", "saveDraft");
    },
    async publish(_ctx, _versionId) {
      return notImplemented("forms", "publish");
    },
    async submit(_ctx, _init) {
      return notImplemented("forms", "submit");
    },
    async submissions(_ctx, _formId) {
      return notImplemented("forms", "submissions");
    },
    async getSubmission(_ctx, _id) {
      return notImplemented("forms", "getSubmission");
    },
    async answers(_ctx, _submissionId) {
      return notImplemented("forms", "answers");
    },
    async consent(_ctx, _submissionId) {
      return notImplemented("forms", "consent");
    },
    async reviewSubmission(_ctx, _submissionId, _status, _note) {
      return notImplemented("forms", "reviewSubmission");
    },
    async withdrawConsent(_ctx, _consentId) {
      return notImplemented("forms", "withdrawConsent");
    },
    async redactExpired(_ctx) {
      return notImplemented("forms", "redactExpired");
    },
  };
}
