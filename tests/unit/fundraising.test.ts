import { beforeEach, describe, expect, it } from "vitest";
import {
  GIFT_AID_RATIO,
  GiftAidSubmissionUnavailable,
  STEWARDSHIP_STAGES,
  assembleClaim,
  assessGiftAid,
  assessStewardship,
  computeCampaignPerformance,
  isBehindTarget,
  maximumBenefit,
  needsAttention,
  submitGiftAidClaim,
} from "@/lib/fundraising";
import { loadFinancePosition } from "@/server/finance/position-service";
import type { Donation, GiftAidDeclaration } from "@/types/domain";
import { createTwoTenantHarness, ORG_A, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-10 — Supporters, fundraising and stewardship.
 *
 * Two instructions pull against each other and resolving them is the phase.
 * *DO NOT create a second CRM* and *a donation touches supporter, fund,
 * finance, programme, campaign, reporting, impact and stewardship; if it lives
 * in a fundraising table, §11 has been violated.*
 *
 * The acceptance block below is the whole answer: a gift becomes a
 * transaction, lands in a fund, moves the finance position, and appears in a
 * campaign total, with one record of the amount.
 */

const NOW = new Date("2026-07-21T10:00:00Z");

const donation = (overrides: Partial<Donation> = {}): Donation => ({
  id: "don-x",
  organisationId: ORG_A,
  transactionId: "txn-x",
  personId: "per-rowan",
  kind: "one_off",
  channel: "card",
  receivedOn: "2026-04-02",
  anonymous: false,
  restricted: false,
  giftAidClaimed: false,
  audit: { createdAt: "2026-04-02", updatedAt: "2026-04-02" },
  ...overrides,
});

const declaration = (overrides: Partial<GiftAidDeclaration> = {}): GiftAidDeclaration => ({
  id: "gad-x",
  organisationId: ORG_A,
  personId: "per-rowan",
  fullName: "Rowan Whitfield",
  addressLine: "14 Cardigan Road",
  postcode: "LS6 1LJ",
  taxpayerConfirmed: true,
  declaredOn: "2026-03-14",
  scope: "enduring",
  audit: { createdAt: "2026-03-14", updatedAt: "2026-03-14" },
  ...overrides,
});

describe("the acceptance chain", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * *Person → Relationship → Donation → Fund → Finance → Programme where
   * restricted → Reporting → Stewardship, without duplicate records.*
   */
  it("records one amount, once, and it reaches finance", async () => {
    const before = await loadFinancePosition(h.ctxA, h.repo);
    const beforeCash = before.cash.known ? before.cash.amount!.minorUnits : 0;
    const beforeTransactions = (await h.repo.finance.transactions(h.ctxA)).length;

    const result = await h.repo.fundraising.recordDonation(h.ctxA, {
      personId: "per-rowan",
      amountMinorUnits: 100_000,
      currency: "GBP",
      receivedOn: "2026-06-01",
      channel: "card",
      fundId: "fund-general",
      campaignId: "camp-spring-2026",
    });

    expect(result.ok).toBe(true);
    expect(result.transactionId).toBeTruthy();

    // Exactly one new record of the money.
    const transactions = await h.repo.finance.transactions(h.ctxA);
    expect(transactions.length).toBe(beforeTransactions + 1);

    // And the donation carries no amount of its own, so there is nothing to
    // disagree with it.
    const gift = await h.repo.fundraising.getDonation(h.ctxA, result.donationId!);
    expect(gift).not.toBeNull();
    expect(Object.keys(gift!)).not.toContain("amountMinorUnits");
    expect(gift!.transactionId).toBe(result.transactionId);

    // The finance position moved by exactly the gift.
    const after = await loadFinancePosition(h.ctxA, h.repo);
    expect(after.cash.known && after.cash.amount!.minorUnits).toBe(beforeCash + 100_000);
  });

  it("attributes a restricted gift to what it was restricted to", async () => {
    const result = await h.repo.fundraising.recordDonation(h.ctxA, {
      personId: "per-rowan",
      amountMinorUnits: 2_500_000,
      currency: "GBP",
      receivedOn: "2026-06-01",
      channel: "bank_transfer",
      fundId: "fund-henderson-youth",
      restricted: true,
      restrictionPurpose: "Youth Futures mentoring",
      programmeId: "prog-youth",
    });

    expect(result.allocationId).toBeTruthy();
    const allocations = await h.repo.finance.allocationsFor(h.ctxA, {
      type: "programme",
      id: "prog-youth",
    });
    expect(
      allocations.some((allocation) => allocation.transactionId === result.transactionId),
    ).toBe(true);
  });

  /**
   * Core income forced onto a programme is the apportionment fiction MG-8
   * exists to avoid. An unrestricted gift stays unallocated on purpose.
   */
  it("does not attribute an unrestricted gift to a programme", async () => {
    const result = await h.repo.fundraising.recordDonation(h.ctxA, {
      personId: "per-rowan",
      amountMinorUnits: 50_000,
      currency: "GBP",
      receivedOn: "2026-06-01",
      channel: "card",
      fundId: "fund-general",
      programmeId: "prog-youth",
    });
    expect(result.allocationId).toBeUndefined();
  });

  it("refuses a restricted gift whose restriction is unstated", async () => {
    const result = await h.repo.fundraising.recordDonation(h.ctxA, {
      personId: "per-rowan",
      amountMinorUnits: 50_000,
      currency: "GBP",
      receivedOn: "2026-06-01",
      channel: "card",
      fundId: "fund-general",
      restricted: true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot be honoured/);
  });

  it("creates a supporter profile so a first gift does not need one set up first", async () => {
    const result = await h.repo.fundraising.recordDonation(h.ctxA, {
      personId: "per-nadia",
      amountMinorUnits: 5_000,
      currency: "GBP",
      receivedOn: "2026-06-01",
      channel: "card",
      fundId: "fund-general",
    });

    expect(result.supporterProfileId).toBeTruthy();
    const profile = await h.repo.fundraising.getSupporterProfile(h.ctxA, {
      personId: "per-nadia",
    });
    // Holds no identity. Name and email stay on the person.
    expect(profile).not.toBeNull();
    expect(Object.keys(profile!)).not.toContain("email");
    expect(Object.keys(profile!)).not.toContain("firstName");
  });

  it("refuses a gift from another tenant's person or into another tenant's fund", async () => {
    expect(
      (
        await h.repo.fundraising.recordDonation(h.ctxA, {
          personId: "per-beacon-1",
          amountMinorUnits: 1_000,
          currency: "GBP",
          receivedOn: "2026-06-01",
          channel: "card",
          fundId: "fund-general",
        })
      ).ok,
    ).toBe(false);

    expect(
      (
        await h.repo.fundraising.recordDonation(h.ctxB, {
          amountMinorUnits: 1_000,
          currency: "GBP",
          receivedOn: "2026-06-01",
          channel: "card",
          fundId: "fund-general",
        })
      ).ok,
    ).toBe(false);
  });

  it("keeps one tenant's fundraising out of the other's", async () => {
    expect(await h.repo.fundraising.campaigns(h.ctxB)).toEqual([]);
    expect(await h.repo.fundraising.donations(h.ctxB)).toEqual([]);
    expect(await h.repo.fundraising.supporterProfiles(h.ctxB)).toEqual([]);
    expect(await h.repo.fundraising.giftAidDeclarations(h.ctxB)).toEqual([]);
  });
});

describe("Gift Aid is modelled against what HMRC requires", () => {
  it("claims 25% of a qualifying gift and shows the arithmetic", () => {
    const assessment = assessGiftAid({
      donation: donation(),
      amountMinorUnits: 50_000,
      declaration: declaration(),
    });

    expect(assessment.eligible).toBe(true);
    expect(assessment.claimableMinorUnits).toBe(50_000 * GIFT_AID_RATIO);
    expect(assessment.workings).toMatch(/enduring declaration/);
  });

  /**
   * Each refusal below is a gift a naïve implementation would claim, and a
   * claim on a disqualified gift is money the charity has to repay.
   */
  it("refuses a company, because Gift Aid applies to individuals", () => {
    const assessment = assessGiftAid({
      donation: donation({ personId: undefined, externalOrganisationId: "xorg-henderson" }),
      amountMinorUnits: 50_000,
      declaration: declaration(),
    });
    expect(assessment.refusal).toBe("not_an_individual");
    expect(assessment.reason).toMatch(/deductible for the company/);
  });

  it("refuses a declaration with no address, because HMRC matches on it", () => {
    expect(
      assessGiftAid({
        donation: donation(),
        amountMinorUnits: 50_000,
        declaration: declaration({ addressLine: "  " }),
      }).refusal,
    ).toBe("declaration_incomplete");
  });

  it("refuses where the donor has not confirmed they pay enough tax", () => {
    expect(
      assessGiftAid({
        donation: donation(),
        amountMinorUnits: 50_000,
        declaration: declaration({ taxpayerConfirmed: false }),
      }).refusal,
    ).toBe("taxpayer_not_confirmed");
  });

  it("refuses a gift made after the declaration was cancelled", () => {
    expect(
      assessGiftAid({
        donation: donation({ receivedOn: "2026-05-01" }),
        amountMinorUnits: 50_000,
        declaration: declaration({ cancelledOn: "2026-04-01" }),
      }).refusal,
    ).toBe("declaration_cancelled");
  });

  it("honours the four-year reach of an enduring declaration, and no further", () => {
    expect(
      assessGiftAid({
        donation: donation({ receivedOn: "2023-01-01" }),
        amountMinorUnits: 50_000,
        declaration: declaration({ declaredOn: "2026-03-14" }),
      }).eligible,
    ).toBe(true);

    expect(
      assessGiftAid({
        donation: donation({ receivedOn: "2021-01-01" }),
        amountMinorUnits: 50_000,
        declaration: declaration({ declaredOn: "2026-03-14" }),
      }).refusal,
    ).toBe("outside_declaration_scope");
  });

  it("scopes a single-donation declaration to exactly one gift", () => {
    const single = declaration({ scope: "single_donation", donationId: "don-other" });
    expect(assessGiftAid({ donation: donation(), amountMinorUnits: 50_000, declaration: single }).refusal).toBe(
      "outside_declaration_scope",
    );
    expect(
      assessGiftAid({
        donation: donation({ id: "don-other" }),
        amountMinorUnits: 50_000,
        declaration: declaration({ scope: "single_donation", donationId: "don-other" }),
      }).eligible,
    ).toBe(true);
  });

  it("applies HMRC's benefit limits by band", () => {
    // 25% of the first £100, then 5%, capped at £2,500.
    expect(maximumBenefit(10_000)).toBe(2_500);
    expect(maximumBenefit(100_000)).toBe(7_000);
    expect(maximumBenefit(100_000_000)).toBe(250_000);

    expect(
      assessGiftAid({
        donation: donation({ benefitValueMinorUnits: 9_000 }),
        amountMinorUnits: 10_000,
        declaration: declaration(),
      }).refusal,
    ).toBe("benefit_too_high");
  });

  /**
   * A claim run that silently dropped forty gifts would look like a small
   * claim rather than like a data problem, and the charity would never find
   * out that forty donors have no declaration on file.
   */
  it("reports the refusals alongside the eligible gifts", () => {
    const assembly = assembleClaim([
      { donation: donation({ id: "a" }), amountMinorUnits: 50_000, declaration: declaration() },
      { donation: donation({ id: "b" }), amountMinorUnits: 20_000 },
      {
        donation: donation({ id: "c", personId: undefined, externalOrganisationId: "x" }),
        amountMinorUnits: 100_000,
      },
    ]);

    expect(assembly.eligible).toHaveLength(1);
    expect(assembly.refused).toHaveLength(2);
    expect(assembly.refused.map((entry) => entry.refusal)).toEqual([
      "no_declaration",
      "not_an_individual",
    ]);
    expect(assembly.totalClaimableMinorUnits).toBe(12_500);
  });

  /**
   * *Do not fake live HMRC submission.* A mock returning a plausible
   * reference number is the version somebody would believe.
   */
  it("refuses to submit, and says why", () => {
    expect(() => submitGiftAidClaim()).toThrow(GiftAidSubmissionUnavailable);
    try {
      submitGiftAidClaim();
    } catch (error) {
      expect((error as Error).message).toMatch(/discovered by HMRC rather than by you/);
    }
  });

  it("assembles a claim and never files it", async () => {
    const h = createTwoTenantHarness();
    const result = await h.repo.fundraising.assembleGiftAidClaim(
      h.ctxA,
      "2026-01-01",
      "2026-12-31",
    );

    expect(result.claimableMinorUnits).toBeGreaterThan(0);
    // Two seeded gifts have no declaration: one anonymous, one from a funder
    // contact who has not made one.
    expect(result.refused).toBeGreaterThan(0);

    const [claim] = await h.repo.fundraising.giftAidClaims(h.ctxA);
    expect(claim!.status).toBe("ready");
    expect(claim!.hmrcReference).toBeUndefined();
  });
});

describe("stewardship is a stage, not a score", () => {
  const gift = (receivedOn: string, amount: number, thanked = true) => ({
    donation: donation({ id: `d-${receivedOn}`, receivedOn, thankedAt: thanked ? receivedOn : undefined }),
    amountMinorUnits: amount,
  });

  it("gives every stage a suggested action, because a stage with none is a label", () => {
    for (const stage of Object.values(STEWARDSHIP_STAGES)) {
      expect(stage.suggestedAction.trim(), stage.key).not.toBe("");
      expect(stage.description.trim(), stage.key).not.toBe("");
    }
  });

  it("never produces a score", () => {
    const assessment = assessStewardship({
      donations: [gift("2026-04-02", 50_000)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });
    expect(Object.keys(assessment)).not.toContain("score");
    expect(Object.keys(assessment)).not.toContain("engagement");
    expect(assessment.reason).toBeTruthy();
  });

  it("distinguishes an unthanked first gift from a lapsed regular", () => {
    const first = assessStewardship({
      donations: [gift("2026-07-01", 5_000, false)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });
    expect(first.stage).toBe("new");
    expect(first.signals.some((signal) => signal.key === "unthanked_gift")).toBe(true);

    const lapsed = assessStewardship({
      donations: [gift("2020-01-01", 5_000), gift("2021-01-01", 5_000)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });
    expect(lapsed.stage).toBe("lapsed");
    // Two different problems requiring opposite responses. A score says
    // neither.
    expect(first.suggestedAction).not.toBe(lapsed.suggestedAction);
  });

  /**
   * £5,000 is transformational to one charity and routine to another, so the
   * threshold is the organisation's rather than this product's.
   */
  it("calls nobody a major donor without a threshold from the organisation", () => {
    const without = assessStewardship({
      donations: [gift("2026-06-01", 5_000_000)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });
    expect(without.stage).not.toBe("major");

    const with_ = assessStewardship({
      donations: [gift("2026-06-01", 5_000_000)],
      commitments: [],
      isOrganisation: false,
      majorGiftThresholdMinorUnits: 1_000_000,
      now: NOW,
    });
    expect(with_.stage).toBe("major");
  });

  it("lets a person override the stage, with a reason", () => {
    const assessment = assessStewardship({
      profile: {
        id: "sup-1",
        organisationId: ORG_A,
        personId: "per-rowan",
        stage: "regular",
        stageOverride: {
          stage: "lapsing",
          reason: "They told us they are unwell and asked for a pause.",
          setAt: "2026-06-01",
        },
        doNotSolicit: false,
        audit: { createdAt: "2026-01-01", updatedAt: "2026-06-01" },
      },
      donations: [gift("2026-07-01", 5_000)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });

    expect(assessment.overridden).toBe(true);
    expect(assessment.stage).toBe("lapsing");
    expect(assessment.reason).toMatch(/unwell/);
  });

  it("treats an organisation as a relationship rather than a supporter journey", () => {
    const assessment = assessStewardship({
      donations: [gift("2026-06-01", 500_000)],
      commitments: [],
      isOrganisation: true,
      now: NOW,
    });
    expect(assessment.stage).toBe("corporate");
  });

  /**
   * A list ordered by how much somebody gave tells a fundraiser to ignore
   * small donors, and the signals that matter apply regardless of amount.
   */
  it("flags what needs attention without reference to value", () => {
    const smallUnthanked = assessStewardship({
      donations: [gift("2026-07-01", 500, false)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });
    const largeThanked = assessStewardship({
      donations: [gift("2026-07-01", 500_000), gift("2026-06-01", 500_000)],
      commitments: [],
      isOrganisation: false,
      now: NOW,
    });

    expect(needsAttention(smallUnthanked)).toBe(true);
    expect(needsAttention(largeThanked)).toBe(false);
  });

  it("reads the seeded workspace correctly", async () => {
    const h = createTwoTenantHarness();
    const donations = await h.repo.fundraising.donations(h.ctxA, { personId: "per-rowan" });
    const transactions = await h.repo.finance.transactions(h.ctxA);

    const assessment = assessStewardship({
      profile: await h.repo.fundraising.getSupporterProfile(h.ctxA, { personId: "per-rowan" }) ?? undefined,
      donations: donations.map((gift) => ({
        donation: gift,
        amountMinorUnits:
          transactions.find((t) => t.id === gift.transactionId)?.amount.minorUnits ?? 0,
      })),
      commitments: (await h.repo.fundraising.recurringCommitments(h.ctxA)).filter(
        (commitment) => commitment.personId === "per-rowan",
      ),
      isOrganisation: false,
      now: NOW,
    });

    expect(assessment.giftCount).toBe(2);
    expect(assessment.totalMinorUnits).toBe(75_000);
    expect(assessment.signals.some((signal) => signal.key === "recurring")).toBe(true);
  });
});

describe("campaign performance", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const performanceFor = async (harness: TwoTenantHarness) => {
    const campaign = (await harness.repo.fundraising.getCampaign(harness.ctxA, "camp-spring-2026"))!;
    const appeals = await harness.repo.fundraising.appeals(harness.ctxA, campaign.id);
    const donations = await harness.repo.fundraising.donations(harness.ctxA, {
      campaignId: campaign.id,
    });
    const transactions = await harness.repo.finance.transactions(harness.ctxA);
    return computeCampaignPerformance({
      campaign,
      appeals,
      donations: donations.map((gift) => ({
        donation: gift,
        amountMinorUnits:
          transactions.find((t) => t.id === gift.transactionId)?.amount.minorUnits ?? 0,
      })),
    });
  };

  it("derives the total from the donations rather than storing one", async () => {
    const performance = await performanceFor(h);
    expect(performance.raisedMinorUnits).toBe(190_000);
    expect(performance.giftCount).toBe(4);
    expect(performance.workings).toMatch(/4 gifts from 3 donors/);
  });

  /**
   * A campaign that raised £40,000 at a cost of £34,000 is a different thing
   * from one that raised £40,000 at a cost of £2,000, and a report showing
   * only the gross figure is the one repeated in a trustee meeting.
   */
  it("reports net alongside gross", async () => {
    const performance = await performanceFor(h);
    expect(performance.costMinorUnits).toBe(240_000);
    expect(performance.netMinorUnits).toBe(190_000 - 240_000);
    // This appeal lost money, and the figure says so rather than being hidden.
    expect(performance.netMinorUnits).toBeLessThan(0);
  });

  it("counts donors rather than gifts, and counts an anonymous giver as one person", async () => {
    const performance = await performanceFor(h);
    // Rowan gave twice; Nadia once; one anonymous gift. Three donors.
    expect(performance.donorCount).toBe(3);
  });

  it("computes a response rate only where the audience was recorded", async () => {
    const performance = await performanceFor(h);
    for (const appeal of performance.appeals) {
      expect(appeal.responseRatePercent).toBeDefined();
      expect(appeal.responseRatePercent!).toBeGreaterThan(0);
    }

    const noAudience = computeCampaignPerformance({
      campaign: (await h.repo.fundraising.getCampaign(h.ctxA, "camp-spring-2026"))!,
      appeals: [
        {
          id: "a1",
          organisationId: ORG_A,
          campaignId: "camp-spring-2026",
          name: "Untracked",
          channel: "card",
          audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        },
      ],
      donations: [],
    });
    // A rate against an unknown denominator is a number that merely looks
    // like information.
    expect(noAudience.appeals[0]!.responseRatePercent).toBeUndefined();
  });

  it("says nothing about being behind target without a target and an end date", async () => {
    const campaign = (await h.repo.fundraising.getCampaign(h.ctxA, "camp-spring-2026"))!;
    const performance = await performanceFor(h);

    expect(isBehindTarget(performance, campaign, NOW)).not.toBeNull();
    expect(isBehindTarget(performance, { ...campaign, endsOn: undefined }, NOW)).toBeNull();
    expect(
      isBehindTarget(performance, { ...campaign, targetMinorUnits: undefined }, NOW),
    ).toBeNull();
  });
});
