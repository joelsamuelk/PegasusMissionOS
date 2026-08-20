import type { IntegrationRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createIntegrationRepository(_q: Query, _deps: Deps): IntegrationRepository {
  return {
    async connections(_ctx) {
      return notImplemented("integrations", "connections");
    },
    async getConnection(_ctx, _id) {
      return notImplemented("integrations", "getConnection");
    },
    async connect(_ctx, _input) {
      return notImplemented("integrations", "connect");
    },
    async setSemantics(_ctx, _connectionId, _semantics) {
      return notImplemented("integrations", "setSemantics");
    },
    async disconnect(_ctx, _connectionId) {
      return notImplemented("integrations", "disconnect");
    },
    async mappings(_ctx, _connectionId) {
      return notImplemented("integrations", "mappings");
    },
    async saveMapping(_ctx, _input) {
      return notImplemented("integrations", "saveMapping");
    },
    async identities(_ctx, _connectionId) {
      return notImplemented("integrations", "identities");
    },
    async resolveExternal(_ctx, _connectionId, _externalId, _externalType) {
      return notImplemented("integrations", "resolveExternal");
    },
    async runs(_ctx, _connectionId) {
      return notImplemented("integrations", "runs");
    },
    async conflicts(_ctx, _options) {
      return notImplemented("integrations", "conflicts");
    },
    async resolveConflict(_ctx, _conflictId, _resolution, _note) {
      return notImplemented("integrations", "resolveConflict");
    },
    async applyIncoming(_ctx, _connectionId, _resource, _records) {
      return notImplemented("integrations", "applyIncoming");
    },
    async recordWebhook(_ctx, _connectionId, _input) {
      return notImplemented("integrations", "recordWebhook");
    },
    async webhooks(_ctx, _connectionId) {
      return notImplemented("integrations", "webhooks");
    },
  };
}
