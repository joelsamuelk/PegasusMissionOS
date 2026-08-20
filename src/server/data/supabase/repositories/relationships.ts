import type { RelationshipRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createRelationshipRepository(_q: Query, _deps: Deps): RelationshipRepository {
  return {
    async listOrganisations(_ctx) {
      return notImplemented("relationships", "listOrganisations");
    },
    async getOrganisation(_ctx, _id) {
      return notImplemented("relationships", "getOrganisation");
    },
    async listPeople(_ctx) {
      return notImplemented("relationships", "listPeople");
    },
    async upsertPersonByEmail(_ctx, _input) {
      return notImplemented("relationships", "upsertPersonByEmail");
    },
    async getPerson(_ctx, _id) {
      return notImplemented("relationships", "getPerson");
    },
    async peopleForOrganisation(_ctx, _externalOrganisationId) {
      return notImplemented("relationships", "peopleForOrganisation");
    },
    async list(_ctx) {
      return notImplemented("relationships", "list");
    },
    async get(_ctx, _id) {
      return notImplemented("relationships", "get");
    },
    async forOrganisation(_ctx, _externalOrganisationId) {
      return notImplemented("relationships", "forOrganisation");
    },
    async forPerson(_ctx, _personId) {
      return notImplemented("relationships", "forPerson");
    },
    async links(_ctx, _relationshipId) {
      return notImplemented("relationships", "links");
    },
    async linksForEntity(_ctx, _entity) {
      return notImplemented("relationships", "linksForEntity");
    },
    async listInteractions(_ctx) {
      return notImplemented("relationships", "listInteractions");
    },
    async interactionsFor(_ctx, _party) {
      return notImplemented("relationships", "interactionsFor");
    },
    async logInteraction(_ctx, _input) {
      return notImplemented("relationships", "logInteraction");
    },
    async listCommitments(_ctx) {
      return notImplemented("relationships", "listCommitments");
    },
    async commitmentsFor(_ctx, _party) {
      return notImplemented("relationships", "commitmentsFor");
    },
    async createCommitment(_ctx, _input) {
      return notImplemented("relationships", "createCommitment");
    },
    async setCommitmentStatus(_ctx, _commitmentId, _status) {
      return notImplemented("relationships", "setCommitmentStatus");
    },
    async organisationForFunder(_ctx, _funderId) {
      return notImplemented("relationships", "organisationForFunder");
    },
    async funderForOrganisation(_ctx, _externalOrganisationId) {
      return notImplemented("relationships", "funderForOrganisation");
    },
  };
}
