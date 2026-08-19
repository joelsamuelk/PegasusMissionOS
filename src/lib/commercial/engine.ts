import type { CommercialScore, CommercialScoreFactor, CommercialSignal } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function signalStrength(signal: CommercialSignal, now = new Date()): number {
  if (signal.decayDays <= 0) return 0;
  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(signal.observedAt).getTime()) / 86_400_000,
  );
  return clamp(
    signal.relevance * signal.confidence * Math.max(0, 1 - ageDays / signal.decayDays),
  );
}

export function scoreFactors(
  factors: CommercialScoreFactor[],
  missing: string[] = [],
): CommercialScore {
  const available = factors.filter((factor) => factor.evidenceIds.length > 0);
  const denominator = available.reduce((sum, factor) => sum + factor.weight, 0);
  return {
    value: denominator
      ? clamp(
          available.reduce((sum, factor) => sum + factor.score * factor.weight, 0) /
            denominator,
        )
      : 0,
    factors,
    missing,
  };
}

export function confidenceScore(
  factors: CommercialScoreFactor[],
  missing: string[] = [],
): CommercialScore {
  const evidenceCoverage = factors.length
    ? factors.filter((factor) => factor.evidenceIds.length > 0).length / factors.length
    : 0;
  const evidenceQuality =
    factors
      .filter((factor) => factor.evidenceIds.length > 0)
      .reduce((sum, factor) => sum + factor.score, 0) /
    Math.max(1, factors.filter((factor) => factor.evidenceIds.length > 0).length);
  return { value: clamp(evidenceCoverage * evidenceQuality), factors, missing };
}

export function shouldPauseSequence(
  event:
    | "reply_received"
    | "meeting_booked"
    | "opportunity_created"
    | "disqualified"
    | "manual_pause"
    | "message_sent",
) {
  return event !== "message_sent";
}
