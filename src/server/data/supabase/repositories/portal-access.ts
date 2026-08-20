import type { PortalAccessRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPortalAccessRepository(_q: Query, _deps: Deps): PortalAccessRepository {
  return {
    async resolvePortal(_slug) {
      return notImplemented("portalAccess", "resolvePortal");
    },
    async resolveMembership(_slug, _email) {
      return notImplemented("portalAccess", "resolveMembership");
    },
    async index(_slug, _email) {
      return notImplemented("portalAccess", "index");
    },
    async read(_slug, _email, _entity) {
      return notImplemented("portalAccess", "read");
    },
    async submit(_slug, _email, _input) {
      return notImplemented("portalAccess", "submit");
    },
    async message(_slug, _email, _body) {
      return notImplemented("portalAccess", "message");
    },
  };
}
