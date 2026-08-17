import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Commitment,
  Interaction,
  Relationship,
  RelationshipHealthState,
} from "@/types/domain";

/**
 * Relationship health: deterministic, explainable, overridable.
 *
 * Two rules govern this module, both from the brief and both non-negotiable:
 *
 * 1. **No mystery score.** There is no 0–100 relationship strength. Every state
 *    comes from a named rule and is returned with the signals that produced it,
 *    exactly as `fit.ts` and `grant-health.ts` already do for their domains.
 *
 * 2. **One measure, not two.** "Strength" and "health" would compete, and two
 *    competing numbers are trusted less than one explained state. The strength
 *    signals the brief lists — recency, frequency, active funding, historical
 *    funding, open commitments — are *inputs* here and are surfaced
 *    individually so a user can see which one moved.
 *
 * A human may override the state, and an override always wins. It requires a
 * reason, because an unexplained override is not auditable.
 */

export type SignalEffect = "positive" | "negative" | "neutral";

export interface RelationshipSignal {
  key: string;
  label: string;
  detail: string;
  effect: SignalEffect;
}

export interface RelationshipHealth {
  state: RelationshipHealthState;
  /** The rule that decided the state. Shown to the user verbatim. */
  reason: string;
  signals: RelationshipSignal[];
  lastInteractionAt?: string;
  daysSinceLastInteraction?: number;
  interactionsLastYear: number;
  openCommitments: number;
  overdueCommitments: number;
  overridden: boolean;
}

export interface RelationshipHealthInput {
  relationship: Relationship;
  /** Interactions already scoped to this relationship's person/organisation. */
  interactions: Interaction[];
  /** Commitments already scoped to this relationship's person/organisation. */
  commitments: Commitment[];
  /** Grants currently running with this party. Count, not amount. */
  activeFundingCount: number;
  /** Grants completed or closed with this party. */
  historicalFundingCount: number;
  /** Programmes this party is linked to as a partner. */
  activePartnershipCount: number;
  now: Date;
}

/** Days a relationship with live work may go quiet before it needs attention. */
const QUIET_WITH_ACTIVE_WORK_DAYS = 120;
/** Days after which a relationship with no live work is dormant. */
const DORMANT_DAYS = 180;
/** Days within which a relationship counts as currently active. */
const RECENT_DAYS = 30;

function daysBetween(from: string, now: Date): number | undefined {
  try {
    return differenceInCalendarDays(now, parseISO(from));
  } catch {
    return undefined;
  }
}

/** Derived commitment state. `overdue` is computed, never stored. */
export function commitmentState(
  commitment: Commitment,
  now: Date,
): "open" | "overdue" | "completed" | "cancelled" {
  if (commitment.status !== "open") return commitment.status;
  if (!commitment.dueAt) return "open";
  const days = daysBetween(commitment.dueAt, now);
  return days !== undefined && days > 0 ? "overdue" : "open";
}

export function computeRelationshipHealth(
  input: RelationshipHealthInput,
): RelationshipHealth {
  const {
    relationship,
    interactions,
    commitments,
    activeFundingCount,
    historicalFundingCount,
    activePartnershipCount,
    now,
  } = input;

  const sorted = [...interactions].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  const lastInteractionAt = sorted[0]?.occurredAt;
  const daysSince = lastInteractionAt ? daysBetween(lastInteractionAt, now) : undefined;

  const interactionsLastYear = interactions.filter((i) => {
    const d = daysBetween(i.occurredAt, now);
    return d !== undefined && d >= 0 && d <= 365;
  }).length;

  const open = commitments.filter((c) => c.status === "open");
  const overdue = open.filter((c) => commitmentState(c, now) === "overdue");
  const hasLiveWork = activeFundingCount > 0 || activePartnershipCount > 0;

  const signals: RelationshipSignal[] = [];

  if (lastInteractionAt && daysSince !== undefined) {
    signals.push({
      key: "recency",
      label: "Last interaction",
      detail:
        daysSince <= 0
          ? "Today"
          : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`,
      effect: daysSince <= RECENT_DAYS ? "positive" : daysSince > DORMANT_DAYS ? "negative" : "neutral",
    });
  } else {
    signals.push({
      key: "recency",
      label: "Last interaction",
      detail: "No interaction recorded",
      effect: "negative",
    });
  }

  signals.push({
    key: "frequency",
    label: "Interactions in the last year",
    detail: String(interactionsLastYear),
    effect: interactionsLastYear >= 4 ? "positive" : interactionsLastYear === 0 ? "negative" : "neutral",
  });

  if (activeFundingCount > 0) {
    signals.push({
      key: "active_funding",
      label: "Active funding",
      detail: `${activeFundingCount} live grant${activeFundingCount === 1 ? "" : "s"}`,
      effect: "positive",
    });
  }
  if (historicalFundingCount > 0) {
    signals.push({
      key: "historical_funding",
      label: "Funding history",
      detail: `${historicalFundingCount} previous grant${historicalFundingCount === 1 ? "" : "s"}`,
      effect: "positive",
    });
  }
  if (activePartnershipCount > 0) {
    signals.push({
      key: "active_partnership",
      label: "Active partnership",
      detail: `${activePartnershipCount} programme${activePartnershipCount === 1 ? "" : "s"} delivered together`,
      effect: "positive",
    });
  }
  if (open.length > 0) {
    signals.push({
      key: "open_commitments",
      label: "Open commitments",
      detail: `${open.length} open${overdue.length > 0 ? `, ${overdue.length} overdue` : ""}`,
      effect: overdue.length > 0 ? "negative" : "neutral",
    });
  }
  if (relationship.nextActionAt) {
    const days = daysBetween(relationship.nextActionAt, now);
    signals.push({
      key: "next_action",
      label: "Next action",
      detail:
        days !== undefined && days > 0
          ? `${relationship.nextAction ?? "Action"} — ${days} day${days === 1 ? "" : "s"} overdue`
          : (relationship.nextAction ?? "Scheduled"),
      effect: days !== undefined && days > 0 ? "negative" : "neutral",
    });
  }

  const base = {
    signals,
    lastInteractionAt,
    daysSinceLastInteraction: daysSince,
    interactionsLastYear,
    openCommitments: open.length,
    overdueCommitments: overdue.length,
  };

  // A human override always wins, but the computed signals remain visible so
  // the override can be reviewed rather than taken on trust.
  if (relationship.healthOverride) {
    return {
      ...base,
      state: relationship.healthOverride.state,
      reason: `Set manually: ${relationship.healthOverride.reason}`,
      overridden: true,
    };
  }

  const decided = decide({
    relationship,
    daysSince,
    overdueCount: overdue.length,
    hasLiveWork,
    activeFundingCount,
    historicalFundingCount,
    activePartnershipCount,
    interactionsLastYear,
    nextActionOverdueDays: relationship.nextActionAt
      ? daysBetween(relationship.nextActionAt, now)
      : undefined,
  });

  return { ...base, ...decided, overridden: false };
}

/**
 * The rule ladder. Order is the logic: the first rule that matches decides,
 * so "needs attention" can never be masked by an otherwise healthy history.
 */
function decide(x: {
  relationship: Relationship;
  daysSince?: number;
  overdueCount: number;
  hasLiveWork: boolean;
  activeFundingCount: number;
  historicalFundingCount: number;
  activePartnershipCount: number;
  interactionsLastYear: number;
  nextActionOverdueDays?: number;
}): { state: RelationshipHealthState; reason: string } {
  if (x.relationship.status === "former" || x.relationship.status === "archived") {
    return {
      state: "dormant",
      reason: `Relationship marked as ${x.relationship.status}.`,
    };
  }

  if (x.overdueCount > 0) {
    return {
      state: "needs_attention",
      reason: `${x.overdueCount} commitment${x.overdueCount === 1 ? " is" : "s are"} past the agreed date.`,
    };
  }

  if (x.nextActionOverdueDays !== undefined && x.nextActionOverdueDays > 0) {
    return {
      state: "needs_attention",
      reason: `The agreed next action is ${x.nextActionOverdueDays} day${x.nextActionOverdueDays === 1 ? "" : "s"} overdue.`,
    };
  }

  if (
    x.hasLiveWork &&
    (x.daysSince === undefined || x.daysSince > QUIET_WITH_ACTIVE_WORK_DAYS)
  ) {
    return {
      state: "needs_attention",
      reason:
        x.daysSince === undefined
          ? "There is live work with this party but no interaction has ever been recorded."
          : `There is live work with this party and no contact for ${x.daysSince} days.`,
    };
  }

  if (!x.hasLiveWork && (x.daysSince === undefined || x.daysSince > DORMANT_DAYS)) {
    return {
      state: "dormant",
      reason:
        x.daysSince === undefined
          ? "No interaction has been recorded."
          : `No contact for ${x.daysSince} days and no live funding or partnership.`,
    };
  }

  if (x.daysSince !== undefined && x.daysSince <= RECENT_DAYS && x.hasLiveWork) {
    return {
      state: "active",
      reason: "Live work together and contact within the last month.",
    };
  }

  if (x.historicalFundingCount + x.activeFundingCount >= 2 || x.activePartnershipCount >= 2) {
    return {
      state: "established",
      reason: "A track record of working together across more than one engagement.",
    };
  }

  if (x.daysSince !== undefined && x.daysSince <= RECENT_DAYS) {
    return {
      state: "active",
      reason: "Contact within the last month.",
    };
  }

  return {
    state: "developing",
    reason: "Contact is current but there is no track record together yet.",
  };
}

export const HEALTH_LABELS: Record<RelationshipHealthState, string> = {
  active: "Active",
  established: "Established",
  developing: "Developing",
  dormant: "Dormant",
  needs_attention: "Needs attention",
};
