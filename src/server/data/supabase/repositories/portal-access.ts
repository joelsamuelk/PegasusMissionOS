import type { PortalAccessRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPortalAccessRepository(q: Query, deps: Deps): PortalAccessRepository {
  return {
    async resolvePortal(slug) {
      return notImplemented("portalAccess", "resolvePortal");
    },
    async resolveMembership(slug, email) {
      return notImplemented("portalAccess", "resolveMembership");
    },
    async index(slug, email) {
      return notImplemented("portalAccess", "index");
    },
    async read(slug, email, entity) {
      return notImplemented("portalAccess", "read");
    },
    async submit(slug, email, input) {
      return notImplemented("portalAccess", "submit");
    },
    async message(slug, email, body) {
      return notImplemented("portalAccess", "message");
    },
  };
}
