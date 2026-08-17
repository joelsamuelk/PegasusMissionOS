import type { Claim, SourceAuthority } from "@/types/domain";

/**
 * Evidence strength — deterministic, never modelled.
 *
 * How well supported a claim is depends on four things a rule can read and a
 * model cannot be trusted to weigh consistently: how many sources there are,
 * how authoritative they are, how independent they are of one another, and how
 * old they are. A model asked "is this well evidenced?" will answer fluently
 * and differently each time; that is precisely the wrong property for a figure
 * going in front of a funder.
 *
 * Like fit and grant health, this returns its reasons, not a bare grade.
 */

export type EvidenceStrengthLevel = "strong" | "moderate" | "limited" | "unsupported";

export interface StrengthSignal {
  label: string;
  detail: string;
  effect: "raises" | "lowers" | "neutral";
}

export interface EvidenceStrength {
  level: EvidenceStrengthLevel;
  score: number;
  signals: StrengthSignal[];
  /** Distinct source records, after collapsing repeats of the same document. */
  independentSources: number;
  /** Set when the strongest supporting source is older than the staleness bar. */
  staleAfter?: string;
}

/** Authority weight. Ordinal and deliberately far apart at the extremes. */
const AUTHORITY_WEIGHT: Record<SourceAuthority, number> = {
  regulator: 4,
  organisation: 3,
  supporting: 2,
  discovery: 1,
};

/** Beyond this, a source is old enough that it should be re-checked. */
const STALE_AFTER_DAYS = 548; // 18 months

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function assessEvidenceStrength(claim: Claim, now: Date): EvidenceStrength {
  const signals: StrengthSignal[] = [];

  // Independence: the same document cited three times is one source, not three.
  const distinct = new Map<string, { authority: SourceAuthority; retrievedAt?: string }>();
  for (const source of claim.sources) {
    const key = `${source.ref.type}:${source.ref.id}`;
    const existing = distinct.get(key);
    // Keep the strongest authority recorded for a given source.
    if (!existing || AUTHORITY_WEIGHT[source.authority] > AUTHORITY_WEIGHT[existing.authority]) {
      distinct.set(key, { authority: source.authority, retrievedAt: source.retrievedAt });
    }
  }
  const independentSources = distinct.size;

  if (independentSources === 0) {
    return {
      level: "unsupported",
      score: 0,
      independentSources: 0,
      signals: [
        {
          label: "No sources",
          detail: "This claim cites no source record.",
          effect: "lowers",
        },
      ],
    };
  }

  let score = 0;

  // 1. Authority of the best source.
  const authorities = [...distinct.values()].map((s) => s.authority);
  const best = authorities.reduce((a, b) =>
    AUTHORITY_WEIGHT[b] > AUTHORITY_WEIGHT[a] ? b : a,
  );
  score += AUTHORITY_WEIGHT[best] * 10;
  signals.push({
    label: "Source authority",
    detail: `Strongest source is ${best}.`,
    effect: best === "discovery" ? "lowers" : "raises",
  });

  // 2. Corroboration. Independent agreement is worth more than repetition,
  //    and is capped so a pile of weak sources cannot outrank a regulator.
  const corroboration = Math.min(independentSources - 1, 3) * 6;
  score += corroboration;
  if (independentSources > 1) {
    signals.push({
      label: "Corroboration",
      detail: `${independentSources} independent sources.`,
      effect: "raises",
    });
  } else {
    signals.push({
      label: "Single source",
      detail: "Only one source supports this claim.",
      effect: "lowers",
    });
  }

  // 3. Verification state of the claim itself.
  if (claim.verification === "verified") {
    score += 20;
    signals.push({
      label: "Verified",
      detail: "A person has confirmed this claim.",
      effect: "raises",
    });
  } else if (claim.verification === "provided") {
    score += 12;
    signals.push({
      label: "Human provided",
      detail: "Supplied by a person, not yet independently verified.",
      effect: "neutral",
    });
  } else if (claim.verification === "outdated") {
    score -= 15;
    signals.push({
      label: "Marked outdated",
      detail: "This claim has been flagged as no longer current.",
      effect: "lowers",
    });
  } else {
    signals.push({
      label: "Awaiting review",
      detail: `Verification state is ${claim.verification}.`,
      effect: "lowers",
    });
  }

  // 4. Recency. Unknown retrieval dates are treated as unknown, not as fresh —
  //    assuming freshness is how a stale figure reaches a funder report.
  const dated = [...distinct.values()]
    .map((s) => s.retrievedAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d));
  let staleAfter: string | undefined;
  if (dated.length === 0) {
    signals.push({
      label: "Age unknown",
      detail: "No source records when it was retrieved.",
      effect: "lowers",
    });
    score -= 5;
  } else {
    const newest = dated.reduce((a, b) => (b > a ? b : a));
    const age = daysBetween(newest, now);
    if (age > STALE_AFTER_DAYS) {
      score -= 15;
      staleAfter = newest.toISOString().slice(0, 10);
      signals.push({
        label: "Stale",
        detail: `Newest source is ${Math.floor(age / 30)} months old.`,
        effect: "lowers",
      });
    } else {
      score += 8;
      signals.push({
        label: "Current",
        detail: `Newest source is ${Math.max(age, 0)} days old.`,
        effect: "raises",
      });
    }
  }

  const bounded = Math.max(0, Math.min(100, score));

  const level: EvidenceStrengthLevel =
    bounded >= 60 ? "strong" : bounded >= 40 ? "moderate" : bounded > 0 ? "limited" : "unsupported";

  return {
    level,
    score: bounded,
    signals,
    independentSources,
    ...(staleAfter ? { staleAfter } : {}),
  };
}
