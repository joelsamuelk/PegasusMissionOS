import type { GraphRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createGraphRepository(q: Query, deps: Deps): GraphRepository {
  return {
    async list(ctx) {
      return notImplemented("graph", "list");
    },
    async from(ctx, entity, kind) {
      return notImplemented("graph", "from");
    },
    async to(ctx, entity, kind) {
      return notImplemented("graph", "to");
    },
    async connect(ctx, init) {
      return notImplemented("graph", "connect");
    },
    async disconnect(ctx, id) {
      return notImplemented("graph", "disconnect");
    },
    async reach(ctx, from, kind, options) {
      return notImplemented("graph", "reach");
    },
    async connectionsFor(ctx, entity) {
      return notImplemented("graph", "connectionsFor");
    },
  };
}
