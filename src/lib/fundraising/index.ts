/**
 * Supporters, fundraising and stewardship.
 *
 * Three decisions shape everything here, and all three come from refusing to
 * build a second copy of something that exists:
 *
 * 1. **A donation is not money.** It points at a `FinancialTransaction`, so a
 *    gift reaches the Finance Command Centre, the runway calculation and a
 *    funder report without anybody entering it twice.
 * 2. **There is no donation allocation.** `FinancialAllocation` already
 *    records a method and a basis, which is what makes an attribution
 *    defensible.
 * 3. **A supporter profile holds no identity.** `Person` is canonical. This
 *    layer holds a steward, a stage and a recognition preference.
 */

export {
  ENDURING_BACKDATE_YEARS,
  GIFT_AID_RATIO,
  GiftAidSubmissionUnavailable,
  assembleClaim,
  assessGiftAid,
  maximumBenefit,
  submitGiftAidClaim,
  type ClaimAssembly,
  type GiftAidAssessment,
  type GiftAidInput,
  type GiftAidRefusal,
  type GiftAidSubmissionPort,
} from "./gift-aid";

export {
  STEWARDSHIP_STAGES,
  assessStewardship,
  needsAttention,
  type StewardshipAssessment,
  type StewardshipInput,
  type StewardshipSignal,
} from "./stewardship";

export {
  computeCampaignPerformance,
  isBehindTarget,
  type AppealPerformance,
  type CampaignPerformance,
  type PerformanceInput,
} from "./campaigns";
