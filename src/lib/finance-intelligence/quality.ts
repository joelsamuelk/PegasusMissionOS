import type { DataQuality, DataQualityLevel } from "./types";

/**
 * Data quality is presented next to every derived figure, so the thresholds
 * are constants rather than judgement calls scattered through the modules.
 *
 * `insufficient` is not a low grade — it is a refusal. Below this line Pegasus
 * withholds the figure rather than publishing it with a caveat, because a
 * caveat next to a number is read as a number.
 */
export const QUALITY_THRESHOLDS = {
  high: 0.85,
  moderate: 0.6,
  low: 0.3,
} as const;

export const QUALITY_LABELS: Record<DataQualityLevel, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  insufficient: "Insufficient",
};

const RANK: Record<DataQualityLevel, number> = {
  insufficient: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

export function levelFromScore(score: number): DataQualityLevel {
  if (score >= QUALITY_THRESHOLDS.high) return "high";
  if (score >= QUALITY_THRESHOLDS.moderate) return "moderate";
  if (score >= QUALITY_THRESHOLDS.low) return "low";
  return "insufficient";
}

export function quality(score: number, reasons: string[] = []): DataQuality {
  const clamped = Math.min(1, Math.max(0, score));
  return { level: levelFromScore(clamped), score: Math.round(clamped * 1000) / 1000, reasons };
}

/** The weakest input governs. Quality does not average away a gap. */
export function weakestQuality(...items: DataQuality[]): DataQuality {
  if (items.length === 0) return quality(0, ["No data quality signals supplied."]);
  return items.reduce((worst, item) => (RANK[item.level] < RANK[worst.level] ? item : worst));
}

export function isAtLeast(actual: DataQualityLevel, required: DataQualityLevel): boolean {
  return RANK[actual] >= RANK[required];
}

export function compareQuality(a: DataQualityLevel, b: DataQualityLevel): number {
  return RANK[a] - RANK[b];
}
