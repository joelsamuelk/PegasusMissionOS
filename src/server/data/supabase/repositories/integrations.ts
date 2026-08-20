import type { IntegrationRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createIntegrationRepository(q: Query, deps: Deps): IntegrationRepository {
  return {
    async connections(ctx) {
      return notImplemented("integrations", "connections");
    },
    async getConnection(ctx, id) {
      return notImplemented("integrations", "getConnection");
    },
    async connect(ctx, input) {
      return notImplemented("integrations", "connect");
    },
    async setSemantics(ctx, connectionId, semantics) {
      return notImplemented("integrations", "setSemantics");
    },
    async disconnect(ctx, connectionId) {
      return notImplemented("integrations", "disconnect");
    },
    async mappings(ctx, connectionId) {
      return notImplemented("integrations", "mappings");
    },
    async saveMapping(ctx, input) {
      return notImplemented("integrations", "saveMapping");
    },
    async identities(ctx, connectionId) {
      return notImplemented("integrations", "identities");
    },
    async resolveExternal(ctx, connectionId, externalId, externalType) {
      return notImplemented("integrations", "resolveExternal");
    },
    async runs(ctx, connectionId) {
      return notImplemented("integrations", "runs");
    },
    async conflicts(ctx, options) {
      return notImplemented("integrations", "conflicts");
    },
    async resolveConflict(ctx, conflictId, resolution, note) {
      return notImplemented("integrations", "resolveConflict");
    },
    async applyIncoming(ctx, connectionId, resource, records) {
      return notImplemented("integrations", "applyIncoming");
    },
    async recordWebhook(ctx, connectionId, input) {
      return notImplemented("integrations", "recordWebhook");
    },
    async webhooks(ctx, connectionId) {
      return notImplemented("integrations", "webhooks");
    },
  };
}
