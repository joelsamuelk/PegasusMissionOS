import type { PublicFormRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createPublicFormRepository(q: Query, deps: Deps): PublicFormRepository {
  return {
    async resolveBySlug(slug) {
      return notImplemented("publicForms", "resolveBySlug");
    },
    async fields(slug) {
      return notImplemented("publicForms", "fields");
    },
    async submit(slug, init) {
      return notImplemented("publicForms", "submit");
    },
  };
}
