import {
  assessStewardship,
  computeCampaignPerformance,
  isBehindTarget,
  needsAttention,
  type CampaignPerformance,
  type StewardshipAssessment,
} from "@/lib/fundraising";
import type {
  Campaign,
  Donation,
  ExternalOrganisation,
  Person,
  SupporterProfile,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";

/**
 * Supporter 360, assembled.
 *
 * The brief asks for identity, relationships, donations, campaigns,
 * communications, events, volunteering, commitments, preferences, consent,
 * Gift Aid, engagement and next action. Most of those already exist elsewhere
 * in the graph, which is the point: this joins them rather than storing them
 * again, and the record it does own — `SupporterProfile` — holds a steward, a
 * stage and a recognition preference and nothing else.
 *
 * `engagement` is deliberately absent from the return. What replaces it is the
 * stewardship assessment, which is a named stage with the signals that
 * produced it.
 */

export interface SupporterView {
  profile: SupporterProfile | null;
  person: Person | null;
  organisation: ExternalOrganisation | null;
  displayName: string;
  donations: { donation: Donation; amountMinorUnits: number }[];
  totalMinorUnits: number;
  stewardship: StewardshipAssessment;
  giftAid: { declared: boolean; claimable: boolean; reason?: string };
  needsAttention: boolean;
}

/**
 * How much a gift has to be to count as major here.
 *
 * Derived rather than configured, because no organisation would set it and a
 * hardcoded figure would call somebody a major donor on this product's opinion
 * rather than on the charity's. Ten per cent of the largest active award is a
 * crude proxy and is stated as one wherever it is used.
 *
 * Returns undefined where there is nothing to derive it from, so no supporter
 * is called major on no evidence.
 */
export async function deriveMajorGiftThreshold(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<number | undefined> {
  const grants = (await repo.grants.list(ctx)).filter((grant) => grant.status === "active");
  if (grants.length === 0) return undefined;
  const largest = Math.max(...grants.map((grant) => grant.awardValue));
  return Math.round(largest * 100 * 0.1);
}

export async function buildSupporterViews(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<SupporterView[]> {
  const [profiles, people, organisations, donations, transactions, commitments, declarations] =
    await Promise.all([
      repo.fundraising.supporterProfiles(ctx),
      repo.relationships.listPeople(ctx),
      repo.relationships.listOrganisations(ctx),
      repo.fundraising.donations(ctx),
      repo.finance.transactions(ctx),
      repo.fundraising.recurringCommitments(ctx),
      repo.fundraising.giftAidDeclarations(ctx),
    ]);

  const threshold = await deriveMajorGiftThreshold(ctx, repo);
  const amountOf = (donation: Donation) =>
    transactions.find((transaction) => transaction.id === donation.transactionId)?.amount
      .minorUnits ?? 0;

  /**
   * Every party who has given, whether or not somebody made them a profile.
   *
   * A supporter who gave once and has no profile is exactly the supporter most
   * likely to be forgotten, so the list is built from the gifts rather than
   * from the profiles.
   */
  const parties = new Map<string, { personId?: string; externalOrganisationId?: string }>();
  for (const profile of profiles) {
    const key = profile.personId ?? profile.externalOrganisationId;
    if (key) parties.set(key, { personId: profile.personId, externalOrganisationId: profile.externalOrganisationId });
  }
  for (const donation of donations) {
    const key = donation.personId ?? donation.externalOrganisationId;
    if (!key) continue;
    if (!parties.has(key)) {
      parties.set(key, {
        personId: donation.personId,
        externalOrganisationId: donation.externalOrganisationId,
      });
    }
  }

  const views: SupporterView[] = [];

  for (const [, party] of parties) {
    const profile =
      profiles.find(
        (candidate) =>
          (party.personId !== undefined && candidate.personId === party.personId) ||
          (party.externalOrganisationId !== undefined &&
            candidate.externalOrganisationId === party.externalOrganisationId),
      ) ?? null;

    const person = party.personId
      ? (people.find((candidate) => candidate.id === party.personId) ?? null)
      : null;
    const organisation = party.externalOrganisationId
      ? (organisations.find((candidate) => candidate.id === party.externalOrganisationId) ?? null)
      : null;

    const theirs = donations.filter(
      (donation) =>
        (party.personId !== undefined && donation.personId === party.personId) ||
        (party.externalOrganisationId !== undefined &&
          donation.externalOrganisationId === party.externalOrganisationId),
    );
    const withAmounts = theirs.map((donation) => ({
      donation,
      amountMinorUnits: amountOf(donation),
    }));

    const stewardship = assessStewardship({
      profile: profile ?? undefined,
      donations: withAmounts,
      commitments: commitments.filter(
        (commitment) =>
          (party.personId !== undefined && commitment.personId === party.personId) ||
          (party.externalOrganisationId !== undefined &&
            commitment.externalOrganisationId === party.externalOrganisationId),
      ),
      isOrganisation: Boolean(party.externalOrganisationId),
      majorGiftThresholdMinorUnits: threshold,
      now: ctx.now(),
    });

    const declaration = declarations.find(
      (candidate) => candidate.personId === party.personId && !candidate.cancelledOn,
    );

    views.push({
      profile,
      person,
      organisation,
      displayName:
        organisation?.name ??
        (person ? `${person.preferredName ?? person.firstName} ${person.lastName}` : "A supporter"),
      donations: withAmounts,
      totalMinorUnits: withAmounts.reduce((sum, entry) => sum + entry.amountMinorUnits, 0),
      stewardship,
      giftAid: {
        declared: Boolean(declaration),
        claimable: Boolean(declaration) && !party.externalOrganisationId,
        reason: party.externalOrganisationId
          ? "Gift Aid applies to individuals. A corporate gift is deductible for the company instead."
          : declaration
            ? undefined
            : "No Gift Aid declaration is on file for this supporter.",
      },
      needsAttention: needsAttention(stewardship),
    });
  }

  // Ordered by what needs attention, then by name. Deliberately not by value:
  // a list ordered by how much somebody gave tells a fundraiser to ignore
  // small donors.
  return views.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export interface CampaignView extends CampaignPerformance {
  campaign: Campaign;
  behind: { behind: boolean; reason: string } | null;
}

export async function buildCampaignViews(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<CampaignView[]> {
  const [campaigns, transactions] = await Promise.all([
    repo.fundraising.campaigns(ctx),
    repo.finance.transactions(ctx),
  ]);

  const views: CampaignView[] = [];
  for (const campaign of campaigns) {
    const [appeals, donations] = await Promise.all([
      repo.fundraising.appeals(ctx, campaign.id),
      repo.fundraising.donations(ctx, { campaignId: campaign.id }),
    ]);

    const performance = computeCampaignPerformance({
      campaign,
      appeals,
      donations: donations.map((donation) => ({
        donation,
        amountMinorUnits:
          transactions.find((transaction) => transaction.id === donation.transactionId)?.amount
            .minorUnits ?? 0,
      })),
    });

    views.push({
      ...performance,
      campaign,
      behind: isBehindTarget(performance, campaign, ctx.now()),
    });
  }

  return views;
}
