import type {
  ApplicationAnswer,
  Indicator,
  OrganisationProfile,
} from "@/types/domain";

/**
 * Application completion: proportion of answers that are approved or
 * ready for review. Deterministic and testable.
 */
export function applicationCompletion(answers: ApplicationAnswer[]): number {
  if (answers.length === 0) return 0;
  const weights: Record<ApplicationAnswer["status"], number> = {
    not_started: 0,
    drafting: 0.4,
    needs_evidence: 0.5,
    ready_for_review: 0.85,
    changes_requested: 0.6,
    approved: 1,
  };
  const total = answers.reduce((sum, a) => sum + weights[a.status], 0);
  return Math.round((total / answers.length) * 100);
}

/** Count answers still needing attention (not approved). */
export function answersNeedingAttention(answers: ApplicationAnswer[]): number {
  return answers.filter((a) => a.status !== "approved").length;
}

/**
 * Outcome indicator progress towards target from baseline.
 * Clamped to 0..100. Handles targets below baseline (reduction targets).
 */
export function indicatorProgress(indicator: Indicator): number {
  const { baseline, target, currentValue } = indicator;
  if (target === baseline) return currentValue >= target ? 100 : 0;
  const raw = ((currentValue - baseline) / (target - baseline)) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Organisation profile completeness. Constructive: counts populated,
 * non-outdated fields across the profile. Returns 0..100 plus the fields
 * that still need attention.
 */
export function profileCompleteness(profile: OrganisationProfile): {
  score: number;
  missing: string[];
} {
  const entries: [string, { value: unknown; verification: string }][] = [
    ["Mission statement", profile.missionStatement],
    ["Vision", profile.vision],
    ["Summary", profile.summary],
    ["Core activities", profile.coreActivities],
    ["Strategic priorities", profile.strategicPriorities],
    ["Communities served", profile.communitiesServed],
    ["Geographic reach", profile.geographicReach],
    ["Trustees", profile.trustees],
    ["Key policies", profile.keyPolicies],
    ["Safeguarding status", profile.safeguardingStatus],
    ["Data protection status", profile.dataProtectionStatus],
    ["Insurance status", profile.insuranceStatus],
    ["Financial year end", profile.financialYearEnd],
    ["Typical funding requirement", profile.typicalFundingRequirement],
    ["Preferred funding types", profile.preferredFundingTypes],
    ["Past funders", profile.pastFunders],
  ];

  const missing: string[] = [];
  let filled = 0;
  for (const [label, field] of entries) {
    const v = field.value;
    const isEmpty =
      v == null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0) ||
      field.verification === "outdated";
    if (isEmpty) missing.push(label);
    else filled += 1;
  }
  return {
    score: Math.round((filled / entries.length) * 100),
    missing,
  };
}
