import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Donation,
  RecurringCommitment,
  StewardshipStage,
  StewardshipStageKey,
  SupporterProfile,
} from "@/types/domain";

/**
 * Stewardship, without an engagement score.
 *
 * *Do not create manipulative engagement scoring. Use explainable relationship
 * signals.* The instruction is easy to agree with and easy to violate by
 * accident, because a score is the obvious implementation and it is one line.
 *
 * The reason it is wrong is not squeamishness about metrics. A score compresses
 * several genuinely different situations into one number and then invites
 * somebody to act on the number. A supporter who gave once last month and has
 * not been thanked, and a supporter who gave for six years and stopped, are
 * different problems requiring opposite responses, and "engagement 34" says
 * neither. A **named stage with the signals that produced it** says both.
 *
 * Every stage below therefore carries a suggested action, because a stage with
 * no action is a label, and labels are what scores turn into.
 */

export const STEWARDSHIP_STAGES: Record<StewardshipStageKey, StewardshipStage> = {
  new: {
    key: "new",
    label: "New supporter",
    description: "They have given for the first time and have not been thanked.",
    suggestedAction: "Thank them within a week, and say what their gift will do.",
  },
  thanked: {
    key: "thanked",
    label: "Thanked",
    description: "A first gift, acknowledged. Nothing further has happened.",
    suggestedAction: "Tell them what happened as a result, before asking again.",
  },
  regular: {
    key: "regular",
    label: "Regular donor",
    description: "They give repeatedly, or by a standing arrangement.",
    suggestedAction: "Report on impact at least once a year. Do not only make contact to ask.",
  },
  major: {
    key: "major",
    label: "Major donor",
    description: "Their giving is significant relative to this organisation's income.",
    suggestedAction:
      "A named relationship owner and a conversation, not a mailing. Agree how they want to hear from you.",
  },
  lapsing: {
    key: "lapsing",
    label: "Lapsing",
    description: "They gave regularly and the pattern has broken.",
    suggestedAction:
      "Ask why before asking again. A lapse is usually a circumstance rather than a decision.",
  },
  lapsed: {
    key: "lapsed",
    label: "Lapsed",
    description: "They have not given for a long time.",
    suggestedAction:
      "Decide deliberately whether to re-approach them or to stop contacting them.",
  },
  corporate: {
    key: "corporate",
    label: "Corporate supporter",
    description: "A company rather than an individual. No Gift Aid applies.",
    suggestedAction: "Confirm what recognition they expect and what reporting they need.",
  },
  trust_or_foundation: {
    key: "trust_or_foundation",
    label: "Trust or foundation",
    description: "An institutional funder giving outside a formal grant.",
    suggestedAction: "Treat this as a funder relationship, with reporting to match.",
  },
  potential_major: {
    key: "potential_major",
    label: "Potential major donor",
    description:
      "Their giving has grown, or a single gift stands well above their usual level.",
    suggestedAction:
      "A conversation, not an upgrade ask. Find out what they care about before proposing anything.",
  },
};

/**
 * One reason a supporter is where they are.
 *
 * The same shape as `RelationshipSignal`, deliberately. A fundraiser reading a
 * supporter page and a relationship manager reading a funder page should be
 * looking at the same kind of evidence, and two shapes would eventually mean
 * two vocabularies.
 */
export interface StewardshipSignal {
  key: string;
  label: string;
  detail: string;
  effect: "positive" | "negative" | "neutral";
}

export interface StewardshipAssessment {
  stage: StewardshipStageKey;
  /** The rule that decided it, shown verbatim. */
  reason: string;
  signals: StewardshipSignal[];
  /** True where a human overrode the derived stage. */
  overridden: boolean;
  giftCount: number;
  totalMinorUnits: number;
  daysSinceLastGift?: number;
  suggestedAction: string;
}

export interface StewardshipInput {
  profile?: SupporterProfile;
  /** Gifts from this supporter, with their amounts resolved. */
  donations: { donation: Donation; amountMinorUnits: number }[];
  commitments: RecurringCommitment[];
  isOrganisation: boolean;
  /**
   * What counts as major here.
   *
   * Passed in rather than hardcoded, because £5,000 is transformational to one
   * charity and a routine gift to another. Absent means the question cannot be
   * answered and no supporter is called major.
   */
  majorGiftThresholdMinorUnits?: number;
  now: Date;
}

/** A regular giver who has been silent for this long is lapsing. */
const LAPSING_DAYS = 400;
/** And this long is lapsed. */
const LAPSED_DAYS = 730;

export function assessStewardship(input: StewardshipInput): StewardshipAssessment {
  const { donations, commitments, now } = input;
  const signals: StewardshipSignal[] = [];

  const total = donations.reduce((sum, entry) => sum + entry.amountMinorUnits, 0);
  const dates = donations
    .map((entry) => entry.donation.receivedOn)
    .sort()
    .reverse();
  const lastGift = dates[0];
  const daysSince = lastGift
    ? Math.max(0, differenceInCalendarDays(now, parseISO(lastGift)))
    : undefined;

  const activeCommitment = commitments.some((commitment) => commitment.status === "active");
  const unthanked = donations.filter((entry) => !entry.donation.thankedAt).length;

  const base = {
    signals,
    overridden: false,
    giftCount: donations.length,
    totalMinorUnits: total,
    daysSinceLastGift: daysSince,
  };

  const decide = (
    stage: StewardshipStageKey,
    reason: string,
  ): StewardshipAssessment => ({
    ...base,
    stage,
    reason,
    suggestedAction: STEWARDSHIP_STAGES[stage].suggestedAction,
  });

  /**
   * A human's judgement beats the derived stage, and it requires a reason.
   *
   * The same rule as `RelationshipHealthOverride`. A fundraiser who knows the
   * supporter is in hospital should be able to say so, and an override with no
   * reason is not auditable by whoever picks the relationship up next.
   */
  if (input.profile?.stageOverride) {
    const override = input.profile.stageOverride;
    signals.push({
      key: "stage_overridden",
      label: "Set by a person",
      detail: `${override.reason} (set ${override.setAt.slice(0, 10)})`,
      effect: "neutral",
    });
    return {
      ...base,
      stage: override.stage,
      reason: override.reason,
      overridden: true,
      suggestedAction: STEWARDSHIP_STAGES[override.stage].suggestedAction,
    };
  }

  if (donations.length === 0 && !activeCommitment) {
    return decide(
      input.isOrganisation ? "corporate" : "new",
      "No gift has been recorded from this supporter.",
    );
  }

  if (input.isOrganisation) {
    signals.push({
      key: "organisation",
      label: "An organisation",
      detail: "A company or institution rather than an individual. No Gift Aid applies.",
      effect: "neutral",
    });
    return decide(
      "corporate",
      "This supporter is an organisation, so their stewardship is a relationship rather than a supporter journey.",
    );
  }

  if (unthanked > 0) {
    signals.push({
      key: "unthanked_gift",
      label: "Not thanked",
      detail: `${unthanked} gift${unthanked === 1 ? " has" : "s have"} no record of a thank you.`,
      effect: "negative",
    });
  }

  if (activeCommitment) {
    signals.push({
      key: "recurring",
      label: "Gives regularly",
      detail: "There is an active standing arrangement.",
      effect: "positive",
    });
  }

  if (daysSince !== undefined) {
    signals.push({
      key: "last_gift",
      label: "Last gift",
      detail: `${daysSince} days ago, on ${lastGift}.`,
      effect: daysSince > LAPSING_DAYS ? "negative" : "positive",
    });
  }

  // Major, only where the organisation said what major means. Inventing a
  // threshold would call somebody a major donor on this product's opinion
  // rather than on the charity's.
  const threshold = input.majorGiftThresholdMinorUnits;
  const largest = Math.max(0, ...donations.map((entry) => entry.amountMinorUnits));
  if (threshold !== undefined && total >= threshold) {
    signals.push({
      key: "major_giving",
      label: "Significant giving",
      detail: `${(total / 100).toFixed(2)} given in total, against a major gift threshold of ${(threshold / 100).toFixed(2)}.`,
      effect: "positive",
    });
    return decide("major", "Their total giving is at or above this organisation's major gift threshold.");
  }

  if (donations.length === 1 && unthanked > 0) {
    return decide("new", "A first gift, with no thank you recorded.");
  }
  if (donations.length === 1) {
    return decide("thanked", "A first gift, acknowledged, with nothing since.");
  }

  if (daysSince !== undefined && daysSince > LAPSED_DAYS) {
    return decide("lapsed", `They gave ${donations.length} times and last gave ${daysSince} days ago.`);
  }
  if (daysSince !== undefined && daysSince > LAPSING_DAYS && !activeCommitment) {
    return decide(
      "lapsing",
      `They gave ${donations.length} times and the pattern has broken: ${daysSince} days since the last gift.`,
    );
  }

  /**
   * Growth, not a prediction.
   *
   * Reported where the largest gift stands well above the average, which is a
   * fact about what they have already done. A model predicting capacity to
   * give would be the manipulative version of this, and would rest on data the
   * organisation has no basis to hold.
   */
  if (threshold !== undefined && largest >= threshold / 2 && donations.length > 1) {
    signals.push({
      key: "growing",
      label: "Giving has grown",
      detail: `Their largest gift is ${(largest / 100).toFixed(2)}, above half the major gift threshold.`,
      effect: "positive",
    });
    return decide(
      "potential_major",
      "A single gift stands well above their usual level, which is worth a conversation.",
    );
  }

  return decide("regular", `They have given ${donations.length} times.`);
}

/**
 * Supporters who need attention, and why.
 *
 * Deliberately not ranked by value. A list ordered by how much somebody has
 * given is a list that tells a fundraiser to ignore small donors, and the
 * signals that matter here — an unthanked gift, a broken pattern — apply
 * regardless of amount.
 */
export function needsAttention(assessment: StewardshipAssessment): boolean {
  return (
    assessment.stage === "new" ||
    assessment.stage === "lapsing" ||
    assessment.signals.some((signal) => signal.key === "unthanked_gift")
  );
}
