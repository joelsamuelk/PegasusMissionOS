import type { Appeal, Campaign, Donation } from "@/types/domain";

/**
 * Campaign performance.
 *
 * The brief asks a campaign to track *target, raised, donors, channels,
 * restricted fund, programme, appeal, cost, and net income*. Two of those are
 * the reason this is a computation rather than columns.
 *
 * **`raised` is derived, never stored.** A stored total is a second source of
 * truth that goes stale the moment a donation is corrected, refunded or
 * reattributed. It is the sum of the donations pointing at the campaign, which
 * is one query and is always right.
 *
 * **`net` is reported alongside `raised`, not instead of it.** A campaign that
 * raised £40,000 at a cost of £34,000 is a different thing from one that
 * raised £40,000 at a cost of £2,000, and a fundraising report that shows only
 * the gross figure is the one that gets repeated in a trustee meeting.
 */

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  currency: string;
  targetMinorUnits?: number;
  raisedMinorUnits: number;
  costMinorUnits: number;
  netMinorUnits: number;
  /** Distinct givers, not gifts. */
  donorCount: number;
  giftCount: number;
  /** Mean gift, in minor units. Undefined where there are no gifts. */
  averageGiftMinorUnits?: number;
  /** 0..100, one decimal. Undefined where no target was set. */
  percentOfTarget?: number;
  /** Gifts by channel, so a fundraiser can see what worked. */
  byChannel: { channel: string; giftCount: number; raisedMinorUnits: number }[];
  appeals: AppealPerformance[];
  /** The arithmetic, written so a trustee can check it. */
  workings: string;
}

export interface AppealPerformance {
  appealId: string;
  name: string;
  channel: string;
  audienceSize?: number;
  giftCount: number;
  raisedMinorUnits: number;
  costMinorUnits: number;
  netMinorUnits: number;
  /**
   * Responses per hundred asked, one decimal.
   *
   * Undefined where the audience size was not recorded — which is common, and
   * is why it is undefined rather than zero. A response rate computed against
   * an unknown denominator is a number that looks like information.
   */
  responseRatePercent?: number;
  /** Cost per pound raised, to two decimals. Undefined where nothing was raised. */
  costPerPound?: number;
}

export interface PerformanceInput {
  campaign: Campaign;
  appeals: Appeal[];
  /** Donations attributed to this campaign, with their amounts resolved. */
  donations: { donation: Donation; amountMinorUnits: number }[];
}

export function computeCampaignPerformance(input: PerformanceInput): CampaignPerformance {
  const { campaign, appeals, donations } = input;

  const raised = donations.reduce((sum, entry) => sum + entry.amountMinorUnits, 0);
  const appealCost = appeals.reduce((sum, appeal) => sum + (appeal.costMinorUnits ?? 0), 0);
  const cost = (campaign.costMinorUnits ?? 0) + appealCost;

  const donors = new Set(
    donations.map(
      (entry) =>
        entry.donation.personId ??
        entry.donation.externalOrganisationId ??
        // An anonymous gift with no identity is one donor per gift. Counting
        // them all as a single "anonymous" donor would understate the number
        // of people who gave, which is the figure a trustee reads.
        `anonymous:${entry.donation.id}`,
    ),
  );

  const byChannelMap = new Map<string, { giftCount: number; raisedMinorUnits: number }>();
  for (const entry of donations) {
    const current = byChannelMap.get(entry.donation.channel) ?? {
      giftCount: 0,
      raisedMinorUnits: 0,
    };
    byChannelMap.set(entry.donation.channel, {
      giftCount: current.giftCount + 1,
      raisedMinorUnits: current.raisedMinorUnits + entry.amountMinorUnits,
    });
  }

  const appealPerformance: AppealPerformance[] = appeals.map((appeal) => {
    const forAppeal = donations.filter((entry) => entry.donation.appealId === appeal.id);
    const appealRaised = forAppeal.reduce((sum, entry) => sum + entry.amountMinorUnits, 0);
    const appealCostValue = appeal.costMinorUnits ?? 0;
    return {
      appealId: appeal.id,
      name: appeal.name,
      channel: appeal.channel,
      audienceSize: appeal.audienceSize,
      giftCount: forAppeal.length,
      raisedMinorUnits: appealRaised,
      costMinorUnits: appealCostValue,
      netMinorUnits: appealRaised - appealCostValue,
      responseRatePercent:
        appeal.audienceSize && appeal.audienceSize > 0
          ? Math.round((forAppeal.length / appeal.audienceSize) * 1000) / 10
          : undefined,
      costPerPound:
        appealRaised > 0 ? Math.round((appealCostValue / appealRaised) * 100) / 100 : undefined,
    };
  });

  return {
    campaignId: campaign.id,
    name: campaign.name,
    currency: campaign.currency,
    targetMinorUnits: campaign.targetMinorUnits,
    raisedMinorUnits: raised,
    costMinorUnits: cost,
    netMinorUnits: raised - cost,
    donorCount: donors.size,
    giftCount: donations.length,
    averageGiftMinorUnits:
      donations.length > 0 ? Math.round(raised / donations.length) : undefined,
    percentOfTarget:
      campaign.targetMinorUnits && campaign.targetMinorUnits > 0
        ? Math.round((raised / campaign.targetMinorUnits) * 1000) / 10
        : undefined,
    byChannel: [...byChannelMap.entries()]
      .map(([channel, totals]) => ({ channel, ...totals }))
      .sort((a, b) => b.raisedMinorUnits - a.raisedMinorUnits),
    appeals: appealPerformance,
    workings: `${donations.length} gifts from ${donors.size} donors totalling ${(raised / 100).toFixed(2)}, less ${(cost / 100).toFixed(2)} of campaign and appeal costs, leaving ${((raised - cost) / 100).toFixed(2)} net.`,
  };
}

/**
 * Whether a campaign is behind where it should be.
 *
 * Compared against elapsed time, and only where the campaign has both a target
 * and an end date. "Behind target" without a period is meaningless, and
 * reporting it anyway would flag every open-ended appeal forever.
 */
export function isBehindTarget(
  performance: CampaignPerformance,
  campaign: Campaign,
  now: Date,
): { behind: boolean; reason: string } | null {
  if (!campaign.targetMinorUnits || !campaign.endsOn) return null;

  const start = Date.parse(campaign.startsOn);
  const end = Date.parse(campaign.endsOn);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const elapsed = Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100));
  const achieved = performance.percentOfTarget ?? 0;
  const gap = elapsed - achieved;

  return {
    behind: gap >= 20,
    reason: `${achieved}% of target raised with ${Math.round(elapsed)}% of the campaign period elapsed.`,
  };
}
