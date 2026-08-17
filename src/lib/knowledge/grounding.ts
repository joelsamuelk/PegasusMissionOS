import type { EntityReference } from "@/types/domain";

/**
 * Observed grounding.
 *
 * This module exists to close audit finding **S2**, and the shape of the fix is
 * the point: S2 was never a bug in a function, it was a bug in a type.
 *
 * The old `AIProvenance` held five arrays of bare strings — `profileFieldsUsed`,
 * `documentsUsed`, and so on — populated by listing everything *offered* to the
 * model as though it had been *used*. No check was possible, because a string
 * like "Mission statement" is not a reference to anything; there is nothing to
 * validate it against. Provenance that cannot be false is not provenance.
 *
 * Here, every offered item carries an `EntityReference`, generation returns the
 * references it actually drew on, and a returned reference that was never
 * offered is a **validation failure**, not a warning. Unverifiable provenance is
 * worse than none, because it looks authoritative.
 */

/** One item made available to a generation, with a resolvable identity. */
export interface GroundingItem {
  ref: EntityReference;
  label: string;
  value: string;
}

/** What a generation actually drew on, plus what it could not establish. */
export interface ObservedGrounding {
  used: EntityReference[];
  /** Offered but demonstrably not drawn on. Useful for "why not?" questions. */
  unused: EntityReference[];
  assumptions: string[];
  couldNotVerify: string[];
}

export class GroundingViolationError extends Error {
  readonly fabricated: string[];

  constructor(fabricated: string[]) {
    super(
      `Generation claimed grounding in ${fabricated.length} reference(s) that were never offered: ` +
        `${fabricated.join(", ")}. The output is discarded rather than persisted with false provenance.`,
    );
    this.name = "GroundingViolationError";
    this.fabricated = fabricated;
  }
}

export function refKey(ref: EntityReference): string {
  return `${ref.type}:${ref.id}`;
}

/**
 * Validate what a generation says it used against what it was given.
 *
 * Throws on any reference that was not offered. That is deliberate: a provider
 * inventing a source id is exactly the failure this layer exists to catch, and
 * degrading to "record it anyway, flagged" would reintroduce S2 in a new
 * costume.
 */
export function observeGrounding(input: {
  offered: GroundingItem[];
  usedKeys: string[];
  assumptions?: string[];
  couldNotVerify?: string[];
}): ObservedGrounding {
  const offeredByKey = new Map(input.offered.map((item) => [refKey(item.ref), item.ref]));

  const used: EntityReference[] = [];
  const fabricated: string[] = [];
  const seen = new Set<string>();

  for (const key of input.usedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const ref = offeredByKey.get(key);
    if (!ref) {
      fabricated.push(key);
      continue;
    }
    used.push(ref);
  }

  if (fabricated.length > 0) throw new GroundingViolationError(fabricated);

  const unused = input.offered.map((i) => i.ref).filter((ref) => !seen.has(refKey(ref)));

  const couldNotVerify = [...(input.couldNotVerify ?? [])];
  if (input.offered.length === 0) {
    couldNotVerify.push("No organisation data was available to ground this generation.");
  } else if (used.length === 0) {
    couldNotVerify.push(
      "This output does not draw on any specific record from your organisation's data.",
    );
  }

  return {
    used,
    unused,
    assumptions: input.assumptions ?? [],
    couldNotVerify,
  };
}

/**
 * Which offered items a deterministic generator actually consumed.
 *
 * The mock provider composes its output from known fields, so it can report
 * genuine usage rather than a guess. That makes the mock the reference
 * implementation of honest provenance, and lets the whole contract be tested
 * without a network or a key.
 *
 * **The two error directions are not equally bad.** A false negative
 * under-reports grounding, which is merely pessimistic. A false positive claims
 * the output rested on a record it never touched — which is audit finding S2 in
 * miniature, arrived at by a different route. Matching is therefore deliberately
 * conservative, and biased toward missing a genuine use rather than inventing one.
 */

/** Below this, a coincidental match is more likely than a real one. */
const MIN_MATCH_LENGTH = 6;

function mentions(haystack: string, needle: string): boolean {
  const trimmed = needle.trim().toLowerCase();
  if (trimmed.length < MIN_MATCH_LENGTH) return false;

  // A bare number proves nothing: "2026" appears in any text about next year,
  // and matching it would attribute grounding to whichever indicator happened
  // to share the figure.
  if (/^[\d\s.,%-]+$/.test(trimmed)) return false;

  // Word-boundary match, so a value of "care" does not match "careful" and a
  // funder called "Aspire" does not match "aspirations".
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(haystack);
}

export function itemsMentionedIn(text: string, offered: GroundingItem[]): string[] {
  const haystack = text.toLowerCase();
  return offered
    .filter((item) => mentions(haystack, item.value) || mentions(haystack, item.label))
    .map((item) => refKey(item.ref));
}
