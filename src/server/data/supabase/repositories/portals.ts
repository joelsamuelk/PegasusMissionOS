import type { PortalRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPortalRepository(q: Query, deps: Deps): PortalRepository {
  return {
    async list(ctx) {
      return notImplemented("portals", "list");
    },
    async get(ctx, id) {
      return notImplemented("portals", "get");
    },
    async identities(ctx) {
      return notImplemented("portals", "identities");
    },
    async memberships(ctx, portalId) {
      return notImplemented("portals", "memberships");
    },
    async grantsFor(ctx, membershipId) {
      return notImplemented("portals", "grantsFor");
    },
    async invite(ctx, input) {
      return notImplemented("portals", "invite");
    },
    async share(ctx, input) {
      return notImplemented("portals", "share");
    },
    async unshare(ctx, grantId) {
      return notImplemented("portals", "unshare");
    },
    async revokeMembership(ctx, membershipId, reason) {
      return notImplemented("portals", "revokeMembership");
    },
    async submissions(ctx, portalId) {
      return notImplemented("portals", "submissions");
    },
    async messages(ctx, membershipId) {
      return notImplemented("portals", "messages");
    },
    async reply(ctx, membershipId, body) {
      return notImplemented("portals", "reply");
    },
  };
}
