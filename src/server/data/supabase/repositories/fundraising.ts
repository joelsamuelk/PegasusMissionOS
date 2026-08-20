import type { FundraisingRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFundraisingRepository(q: Query, deps: Deps): FundraisingRepository {
  return {
    async campaigns(ctx) {
      return notImplemented("fundraising", "campaigns");
    },
    async getCampaign(ctx, id) {
      return notImplemented("fundraising", "getCampaign");
    },
    async appeals(ctx, campaignId) {
      return notImplemented("fundraising", "appeals");
    },
    async donations(ctx, options) {
      return notImplemented("fundraising", "donations");
    },
    async getDonation(ctx, id) {
      return notImplemented("fundraising", "getDonation");
    },
    async recurringCommitments(ctx) {
      return notImplemented("fundraising", "recurringCommitments");
    },
    async recordDonation(ctx, init) {
      return notImplemented("fundraising", "recordDonation");
    },
    async markThanked(ctx, donationId) {
      return notImplemented("fundraising", "markThanked");
    },
    async supporterProfiles(ctx) {
      return notImplemented("fundraising", "supporterProfiles");
    },
    async getSupporterProfile(ctx, party) {
      return notImplemented("fundraising", "getSupporterProfile");
    },
    async saveSupporterProfile(ctx, input) {
      return notImplemented("fundraising", "saveSupporterProfile");
    },
    async giftAidDeclarations(ctx, personId) {
      return notImplemented("fundraising", "giftAidDeclarations");
    },
    async recordGiftAidDeclaration(ctx, input) {
      return notImplemented("fundraising", "recordGiftAidDeclaration");
    },
    async assembleGiftAidClaim(ctx, periodStart, periodEnd) {
      return notImplemented("fundraising", "assembleGiftAidClaim");
    },
    async giftAidClaims(ctx) {
      return notImplemented("fundraising", "giftAidClaims");
    },
  };
}
