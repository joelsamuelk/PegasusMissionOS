import type { RelationshipRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createRelationshipRepository(q: Query, deps: Deps): RelationshipRepository {
  return {
    async listOrganisations(ctx) {
      return notImplemented("relationships", "listOrganisations");
    },
    async getOrganisation(ctx, id) {
      return notImplemented("relationships", "getOrganisation");
    },
    async listPeople(ctx) {
      return notImplemented("relationships", "listPeople");
    },
    async upsertPersonByEmail(ctx, input) {
      return notImplemented("relationships", "upsertPersonByEmail");
    },
    async getPerson(ctx, id) {
      return notImplemented("relationships", "getPerson");
    },
    async peopleForOrganisation(ctx, externalOrganisationId) {
      return notImplemented("relationships", "peopleForOrganisation");
    },
    async list(ctx) {
      return notImplemented("relationships", "list");
    },
    async get(ctx, id) {
      return notImplemented("relationships", "get");
    },
    async forOrganisation(ctx, externalOrganisationId) {
      return notImplemented("relationships", "forOrganisation");
    },
    async forPerson(ctx, personId) {
      return notImplemented("relationships", "forPerson");
    },
    async links(ctx, relationshipId) {
      return notImplemented("relationships", "links");
    },
    async linksForEntity(ctx, entity) {
      return notImplemented("relationships", "linksForEntity");
    },
    async listInteractions(ctx) {
      return notImplemented("relationships", "listInteractions");
    },
    async interactionsFor(ctx, party) {
      return notImplemented("relationships", "interactionsFor");
    },
    async logInteraction(ctx, input) {
      return notImplemented("relationships", "logInteraction");
    },
    async listCommitments(ctx) {
      return notImplemented("relationships", "listCommitments");
    },
    async commitmentsFor(ctx, party) {
      return notImplemented("relationships", "commitmentsFor");
    },
    async createCommitment(ctx, input) {
      return notImplemented("relationships", "createCommitment");
    },
    async setCommitmentStatus(ctx, commitmentId, status) {
      return notImplemented("relationships", "setCommitmentStatus");
    },
    async organisationForFunder(ctx, funderId) {
      return notImplemented("relationships", "organisationForFunder");
    },
    async funderForOrganisation(ctx, externalOrganisationId) {
      return notImplemented("relationships", "funderForOrganisation");
    },
  };
}
