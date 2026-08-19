import type { Claim, EntityReference } from "@/types/domain";
import { walkClaims, type ClaimIndex } from "./kind";

/**
 * Derivation tracing.
 *
 * The product promise is that any figure opens into what produced it. This is
 * the traversal behind it: from a headline claim down through supporting claims
 * to the records at the bottom.
 */

export interface DerivationNode {
  claim: Claim;
  depth: number;
  children: DerivationNode[];
  /** Supporting claim ids that could not be resolved — reported, not hidden. */
  unresolved?: string[];
}

/**
 * Walk from a claim down to the records beneath it.
 *
 * Cycle-safe: a claim is expanded once per trace. A claim that appears twice in
 * a diamond-shaped chain is rendered at its first position and referenced
 * thereafter, which keeps the output finite without dropping the relationship.
 */
export function traceClaim(
  root: Claim,
  index: ClaimIndex,
  seen: Set<string> = new Set(),
  depth = 0,
): DerivationNode {
  const node: DerivationNode = { claim: root, depth, children: [] };
  if (seen.has(root.id)) return node;
  seen.add(root.id);

  const unresolved: string[] = [];
  for (const id of root.supportedBy) {
    const child = index.get(id);
    if (!child) {
      unresolved.push(id);
      continue;
    }
    node.children.push(traceClaim(child, index, seen, depth + 1));
  }
  if (unresolved.length > 0) node.unresolved = unresolved;
  return node;
}

/** Flatten a trace depth-first, for a linear "how we got here" list. */
export function flattenTrace(node: DerivationNode): DerivationNode[] {
  return [node, ...node.children.flatMap(flattenTrace)];
}

/** Every record referenced anywhere in the chain, deduplicated. */
export function tracedReferences(root: Claim, index: ClaimIndex): EntityReference[] {
  const out = new Map<string, EntityReference>();
  for (const node of walkClaims(root, index)) {
    for (const ref of node.derivedFrom) out.set(`${ref.type}:${ref.id}`, ref);
    for (const source of node.sources) {
      out.set(`${source.ref.type}:${source.ref.id}`, source.ref);
    }
  }
  return [...out.values()];
}

/**
 * How many hops separate a claim from its furthest supporting record.
 *
 * Slice B's acceptance criterion is that any published figure traces to
 * evidence in five hops or fewer. This is how that is measured rather than
 * asserted.
 */
export function traceDepth(root: Claim, index: ClaimIndex): number {
  const node = traceClaim(root, index);
  return flattenTrace(node).reduce((max, n) => Math.max(max, n.depth), 0);
}

/** Assumptions anywhere in the chain, deduplicated, in encounter order. */
export function tracedAssumptions(root: Claim, index: ClaimIndex): string[] {
  const out = new Set<string>();
  for (const node of walkClaims(root, index)) {
    for (const assumption of node.assumptions) out.add(assumption);
  }
  return [...out];
}
