import type { PublicFormRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPublicFormRepository(_q: Query, _deps: Deps): PublicFormRepository {
  return {
    async resolveBySlug(_slug) {
      return notImplemented("publicForms", "resolveBySlug");
    },
    async fields(_slug) {
      return notImplemented("publicForms", "fields");
    },
    async submit(_slug, _init) {
      return notImplemented("publicForms", "submit");
    },
  };
}
