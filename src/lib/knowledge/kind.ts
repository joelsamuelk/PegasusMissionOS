import type { Claim, ClaimKind } from "@/types/domain";

/**
 * Claim kinds and the rule that governs chains of them.
 *
 * Generalised from `finance-intelligence/statements.ts`, where the five kinds
 * were first introduced. The behaviour is unchanged — the finance suite asserts
 * it — but the concept is not a finance concern, so it now lives here and
 * finance re-exports it.
 */

export const CLAIM_KIND_LABELS: Record<ClaimKind, string> = {
  fact: "FACT",
  calculation: "CALCULATION",
  forecast: "FORECAST",
  assumption: "ASSUMPTION",
  recommendation: "RECOMMENDATION",
};

/** How far a kind is from a recorded fact. Ascending. */
export const CLAIM_KIND_DISTANCE: Record<ClaimKind, number> = {
  fact: 0,
  calculation: 1,
  assumption: 2,
  forecast: 3,
  recommendation: 4,
};

export type ClaimIndex = ReadonlyMap<string, Claim>;

export function indexClaims(claims: Claim[]): ClaimIndex {
  return new Map(claims.map((c) => [c.id, c]));
}

/** Walk a claim and everything it stands on. Cycle-safe; each node once. */
export function* walkClaims(
  root: Claim,
  index: ClaimIndex,
  seen = new Set<string>(),
): Generator<Claim> {
  if (seen.has(root.id)) return;
  seen.add(root.id);
  yield root;
  for (const id of root.supportedBy) {
    const child = index.get(id);
    if (child) yield* walkClaims(child, index, seen);
  }
}

/**
 * The weakest kind anywhere in a claim's support chain.
 *
 * A calculation resting on a forecast is not a calculation any more and must
 * not be labelled as one. This is the single rule that stops a tidy-looking
 * number inheriting more authority than its inputs allow.
 */
export function effectiveClaimKind(root: Claim, index: ClaimIndex): ClaimKind {
  let weakest = root.kind;
  for (const node of walkClaims(root, index)) {
    if (CLAIM_KIND_DISTANCE[node.kind] > CLAIM_KIND_DISTANCE[weakest]) weakest = node.kind;
  }
  return weakest;
}

/**
 * Whether a claim may be presented as its own kind, or must be downgraded.
 *
 * Returned rather than thrown: the caller decides whether to relabel or to
 * withhold, and both are legitimate depending on the surface.
 */
export function kindIsHonest(root: Claim, index: ClaimIndex): boolean {
  return effectiveClaimKind(root, index) === root.kind;
}
