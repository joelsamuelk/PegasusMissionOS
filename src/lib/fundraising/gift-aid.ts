import type { Donation, GiftAidDeclaration } from "@/types/domain";

/**
 * UK Gift Aid.
 *
 * *Model UK Gift Aid properly. Design for future HMRC integration behind a
 * provider port. Do not fake live HMRC submission.* All three, and the third
 * is the one this file takes most seriously: nothing here submits anything,
 * and `GiftAidClaim.hmrcReference` is filled in by a person who filed it
 * through HMRC's own service.
 *
 * The rules below are HMRC's, not a simplification of them. Each one
 * disqualifies gifts that a naïve implementation would happily claim, and a
 * claim on a disqualified gift is money the charity has to repay:
 *
 * - Gift Aid applies to **individuals**, not companies. A corporate donation
 *   is deductible for the company and carries no Gift Aid.
 * - The declaration needs a **name, a home address and a taxpayer
 *   confirmation**. A tick box with no address cannot be matched by HMRC.
 * - An **enduring** declaration covers the four years before it and everything
 *   after. A single-donation declaration covers exactly one gift.
 * - A **benefit** to the donor above the threshold disqualifies the gift.
 * - A gift made **after cancellation** is not covered, whatever the
 *   declaration's original scope.
 */

/** 25p per £1, the basic rate relationship. Expressed as a ratio, not a rate. */
export const GIFT_AID_RATIO = 0.25;

/** How far back an enduring declaration reaches. HMRC: four years. */
export const ENDURING_BACKDATE_YEARS = 4;

/**
 * HMRC's benefit limits, in minor units, by band.
 *
 * Under the post-2019 rules: 25% of the first £100, plus 5% of anything above
 * it, capped at £2,500 in total benefit.
 */
export function maximumBenefit(donationMinorUnits: number): number {
  const firstBand = Math.min(donationMinorUnits, 10_000);
  const remainder = Math.max(0, donationMinorUnits - 10_000);
  return Math.min(250_000, Math.floor(firstBand * 0.25 + remainder * 0.05));
}

export type GiftAidRefusal =
  | "no_declaration"
  | "not_an_individual"
  | "declaration_incomplete"
  | "taxpayer_not_confirmed"
  | "outside_declaration_scope"
  | "declaration_cancelled"
  | "benefit_too_high"
  | "already_claimed";

export interface GiftAidAssessment {
  eligible: boolean;
  refusal?: GiftAidRefusal;
  /** Why, in words a fundraiser can act on. */
  reason?: string;
  /** What could be reclaimed, in minor units. Zero where ineligible. */
  claimableMinorUnits: number;
  /** The arithmetic, so a claim can be checked before it is filed. */
  workings?: string;
}

const ineligible = (refusal: GiftAidRefusal, reason: string): GiftAidAssessment => ({
  eligible: false,
  refusal,
  reason,
  claimableMinorUnits: 0,
});

export interface GiftAidInput {
  donation: Donation;
  /** The gift's value in minor units, from its transaction. */
  amountMinorUnits: number;
  declaration?: GiftAidDeclaration;
}

export function assessGiftAid(input: GiftAidInput): GiftAidAssessment {
  const { donation, amountMinorUnits, declaration } = input;

  if (donation.giftAidClaimed) {
    return ineligible(
      "already_claimed",
      "Gift Aid has already been claimed on this donation.",
    );
  }

  // A company cannot make a Gift Aid declaration. Corporate giving is
  // deductible for the company instead, and claiming on one is a repayment.
  if (!donation.personId || donation.externalOrganisationId) {
    return ineligible(
      "not_an_individual",
      "Gift Aid applies to gifts from individuals. A corporate donation is deductible for the company and carries no Gift Aid.",
    );
  }

  if (!declaration) {
    return ineligible(
      "no_declaration",
      "No Gift Aid declaration covers this donor. Ask for one before claiming.",
    );
  }
  if (declaration.personId !== donation.personId) {
    return ineligible(
      "no_declaration",
      "The declaration belongs to a different person.",
    );
  }

  const missing = [
    declaration.fullName.trim() ? null : "a full name",
    declaration.addressLine.trim() ? null : "a home address",
    declaration.postcode.trim() ? null : "a postcode",
  ].filter((item): item is string => item !== null);
  if (missing.length > 0) {
    return ineligible(
      "declaration_incomplete",
      `HMRC matches a claim on the donor's details, and this declaration is missing ${missing.join(" and ")}.`,
    );
  }
  if (!declaration.taxpayerConfirmed) {
    return ineligible(
      "taxpayer_not_confirmed",
      "The donor has not confirmed they pay enough UK tax to cover what every charity will reclaim.",
    );
  }

  if (declaration.cancelledOn && donation.receivedOn >= declaration.cancelledOn) {
    return ineligible(
      "declaration_cancelled",
      `The declaration was cancelled on ${declaration.cancelledOn}, before this gift was received.`,
    );
  }

  if (declaration.scope === "single_donation") {
    if (declaration.donationId !== donation.id) {
      return ineligible(
        "outside_declaration_scope",
        "This is a single-donation declaration covering a different gift.",
      );
    }
  } else {
    const earliest = new Date(declaration.declaredOn);
    earliest.setFullYear(earliest.getFullYear() - ENDURING_BACKDATE_YEARS);
    if (donation.receivedOn < earliest.toISOString().slice(0, 10)) {
      return ineligible(
        "outside_declaration_scope",
        `An enduring declaration reaches back ${ENDURING_BACKDATE_YEARS} years, to ${earliest.toISOString().slice(0, 10)}. This gift is older.`,
      );
    }
  }

  const benefit = donation.benefitValueMinorUnits ?? 0;
  const limit = maximumBenefit(amountMinorUnits);
  if (benefit > limit) {
    return ineligible(
      "benefit_too_high",
      `The donor received a benefit worth more than HMRC allows on a gift of this size. The limit here is ${(limit / 100).toFixed(2)} and the benefit was ${(benefit / 100).toFixed(2)}.`,
    );
  }

  const claimable = Math.floor(amountMinorUnits * GIFT_AID_RATIO);
  return {
    eligible: true,
    claimableMinorUnits: claimable,
    workings: `${(amountMinorUnits / 100).toFixed(2)} at ${GIFT_AID_RATIO * 100}% is ${(claimable / 100).toFixed(2)}, under ${declaration.scope === "enduring" ? "an enduring" : "a single-donation"} declaration made on ${declaration.declaredOn}.`,
  };
}

export interface ClaimAssembly {
  eligible: { donationId: string; claimableMinorUnits: number; workings: string }[];
  /** Refused gifts, with the reason. Never silently omitted from a claim run. */
  refused: { donationId: string; refusal: GiftAidRefusal; reason: string }[];
  totalClaimableMinorUnits: number;
}

/**
 * Assemble a claim from a period's donations.
 *
 * Reports the refusals alongside the eligible gifts, and that is the point: a
 * claim run that silently dropped forty gifts would look like a small claim
 * rather than like a data problem, and the charity would never find out that
 * forty donors have no declaration on file.
 */
export function assembleClaim(
  entries: { donation: Donation; amountMinorUnits: number; declaration?: GiftAidDeclaration }[],
): ClaimAssembly {
  const eligible: ClaimAssembly["eligible"] = [];
  const refused: ClaimAssembly["refused"] = [];

  for (const entry of entries) {
    const assessment = assessGiftAid(entry);
    if (assessment.eligible) {
      eligible.push({
        donationId: entry.donation.id,
        claimableMinorUnits: assessment.claimableMinorUnits,
        workings: assessment.workings!,
      });
    } else {
      refused.push({
        donationId: entry.donation.id,
        refusal: assessment.refusal!,
        reason: assessment.reason!,
      });
    }
  }

  return {
    eligible,
    refused,
    totalClaimableMinorUnits: eligible.reduce(
      (sum, entry) => sum + entry.claimableMinorUnits,
      0,
    ),
  };
}

/**
 * The port a future HMRC integration implements.
 *
 * Declared and deliberately unimplemented. The brief says not to fake live
 * submission, and the honest form of that is an interface with no
 * implementation and a function that refuses, rather than a mock that returns
 * a plausible reference number somebody might believe.
 */
export interface GiftAidSubmissionPort {
  readonly name: string;
  submit(claim: {
    periodStart: string;
    periodEnd: string;
    donationIds: string[];
    totalClaimableMinorUnits: number;
  }): Promise<{ reference: string }>;
}

export class GiftAidSubmissionUnavailable extends Error {
  constructor() {
    super(
      "Pegasus does not file Gift Aid claims. Assemble the claim here, check the workings, then file it through HMRC's own service and record the reference. A submission that looked as though it had been filed and had not would be discovered by HMRC rather than by you.",
    );
    this.name = "GiftAidSubmissionUnavailable";
  }
}

export function submitGiftAidClaim(): never {
  throw new GiftAidSubmissionUnavailable();
}
