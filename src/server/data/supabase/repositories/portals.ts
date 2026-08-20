import type { PortalRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPortalRepository(_q: Query, _deps: Deps): PortalRepository {
  return {
    async list(_ctx) {
      return notImplemented("portals", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("portals", "get");
    },
    async identities(_ctx) {
      return notImplemented("portals", "identities");
    },
    async memberships(_ctx, _portalId) {
      return notImplemented("portals", "memberships");
    },
    async grantsFor(_ctx, _membershipId) {
      return notImplemented("portals", "grantsFor");
    },
    async invite(_ctx, _input) {
      return notImplemented("portals", "invite");
    },
    async share(_ctx, _input) {
      return notImplemented("portals", "share");
    },
    async unshare(_ctx, _grantId) {
      return notImplemented("portals", "unshare");
    },
    async revokeMembership(_ctx, _membershipId, _reason) {
      return notImplemented("portals", "revokeMembership");
    },
    async submissions(_ctx, _portalId) {
      return notImplemented("portals", "submissions");
    },
    async messages(_ctx, _membershipId) {
      return notImplemented("portals", "messages");
    },
    async reply(_ctx, _membershipId, _body) {
      return notImplemented("portals", "reply");
    },
  };
}
