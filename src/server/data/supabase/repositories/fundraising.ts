import type { FundraisingRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFundraisingRepository(_q: Query, _deps: Deps): FundraisingRepository {
  return {
    async campaigns(_ctx) {
      return notImplemented("fundraising", "campaigns");
    },
    async getCampaign(_ctx, _id) {
      return notImplemented("fundraising", "getCampaign");
    },
    async appeals(_ctx, _campaignId) {
      return notImplemented("fundraising", "appeals");
    },
    async donations(_ctx, _options) {
      return notImplemented("fundraising", "donations");
    },
    async getDonation(_ctx, _id) {
      return notImplemented("fundraising", "getDonation");
    },
    async recurringCommitments(_ctx) {
      return notImplemented("fundraising", "recurringCommitments");
    },
    async recordDonation(_ctx, _init) {
      return notImplemented("fundraising", "recordDonation");
    },
    async markThanked(_ctx, _donationId) {
      return notImplemented("fundraising", "markThanked");
    },
    async supporterProfiles(_ctx) {
      return notImplemented("fundraising", "supporterProfiles");
    },
    async getSupporterProfile(_ctx, _party) {
      return notImplemented("fundraising", "getSupporterProfile");
    },
    async saveSupporterProfile(_ctx, _input) {
      return notImplemented("fundraising", "saveSupporterProfile");
    },
    async giftAidDeclarations(_ctx, _personId) {
      return notImplemented("fundraising", "giftAidDeclarations");
    },
    async recordGiftAidDeclaration(_ctx, _input) {
      return notImplemented("fundraising", "recordGiftAidDeclaration");
    },
    async assembleGiftAidClaim(_ctx, _periodStart, _periodEnd) {
      return notImplemented("fundraising", "assembleGiftAidClaim");
    },
    async giftAidClaims(_ctx) {
      return notImplemented("fundraising", "giftAidClaims");
    },
  };
}
