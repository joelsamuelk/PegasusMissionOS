import { authorityRank } from "./authority";
import type {
  CandidateConflict,
  CandidateField,
  ProfileCandidate,
  ReconciliationResult,
} from "./types";

/**
 * Deduplication and conflict reconciliation.
 *
 * Sources disagree constantly: a website footer says one income figure, the
 * audited accounts say another. Pegasus must surface that rather than pick
 * silently, so conflicts are first-class review items.
 */

/** Comparison key: case and punctuation differences are not disagreements. */
function comparableValue(field: CandidateField, value: string): string {
  const base = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (field === "registrationNumber") {
    // "Charity number: 1184023" and "charity no 1184023" are the same fact.
    return base.replace(/[^a-z0-9]/g, "");
  }
  if (field === "websiteUrl" || field === "logoUrl") {
    return base.replace(/\/+$/, "");
  }
  return base.replace(/[.,;:]$/g, "");
}

/**
 * Collapse identical facts found on multiple pages.
 *
 * Agreement is signal, so the survivor keeps the highest authority and the
 * highest confidence seen, and records how many sources agreed.
 */
export function deduplicate(candidates: ProfileCandidate[]): ProfileCandidate[] {
  const groups = new Map<string, ProfileCandidate[]>();

  for (const candidate of candidates) {
    const key = `${candidate.field}::${comparableValue(candidate.field, candidate.value)}`;
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  return [...groups.values()].map((group) => {
    const best = [...group].sort(
      (a, b) =>
        authorityRank(b.authority) - authorityRank(a.authority) ||
        b.confidence - a.confidence,
    )[0]!;
    // Any source flagged as suspicious taints the deduplicated fact.
    const injectionSuspected = group.some((c) => c.injectionSuspected);
    return { ...best, ...(injectionSuspected ? { injectionSuspected: true } : {}) };
  });
}

function agreementCount(
  candidate: ProfileCandidate,
  all: ProfileCandidate[],
): number {
  const key = comparableValue(candidate.field, candidate.value);
  return all.filter(
    (c) => c.field === candidate.field && comparableValue(c.field, c.value) === key,
  ).length;
}

/**
 * Fields where multiple different values are a genuine conflict.
 *
 * Some fields legitimately hold several values at once: an organisation
 * operates in many regions, so two different regions are not a disagreement.
 */
const MULTI_VALUE_FIELDS = new Set<CandidateField>(["operatingRegions"]);

function explain(recommended: ProfileCandidate, rivals: ProfileCandidate[]): string {
  const higher = rivals.filter(
    (r) => authorityRank(r.authority) < authorityRank(recommended.authority),
  );
  if (higher.length === rivals.length && rivals.length > 0) {
    return `Recommended because it comes from a higher-authority source (${recommended.authority}) than the ${rivals.length} alternative${rivals.length === 1 ? "" : "s"}.`;
  }
  const agreeing = recommended.confidence;
  return `Recommended on extraction confidence (${Math.round(agreeing * 100)}%) and source authority (${recommended.authority}). Alternatives remain available.`;
}

/**
 * Group candidates by field and separate agreement from conflict.
 *
 * Ranking is authority first, then how many sources agreed, then extraction
 * confidence. Nothing is auto-applied: conflicts are returned for a human.
 */
export function reconcile(candidates: ProfileCandidate[]): ReconciliationResult {
  const deduped = deduplicate(candidates);
  const byField = new Map<CandidateField, ProfileCandidate[]>();

  for (const candidate of deduped) {
    const group = byField.get(candidate.field);
    if (group) group.push(candidate);
    else byField.set(candidate.field, [candidate]);
  }

  const agreed: ProfileCandidate[] = [];
  const conflicts: CandidateConflict[] = [];

  for (const [field, group] of byField) {
    if (group.length === 1 || MULTI_VALUE_FIELDS.has(field)) {
      agreed.push(...group);
      continue;
    }

    const ranked = [...group].sort(
      (a, b) =>
        authorityRank(b.authority) - authorityRank(a.authority) ||
        agreementCount(b, candidates) - agreementCount(a, candidates) ||
        b.confidence - a.confidence,
    );

    const recommended = ranked[0]!;
    conflicts.push({
      field,
      candidates: ranked,
      recommended,
      reason: explain(recommended, ranked.slice(1)),
    });
  }

  return { agreed, conflicts };
}
