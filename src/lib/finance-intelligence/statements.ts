import type { Claim, ClaimKind, UUID } from "@/types/domain";
import { CLAIM_KIND_DISTANCE, CLAIM_KIND_LABELS } from "@/lib/knowledge";
import type { EntityReference, Period } from "./types";

/**
 * §24. Finance Intelligence says five different kinds of thing, and conflating
 * them is the failure mode that makes a finance assistant untrustworthy:
 *
 *   FACT           we hold a record of this
 *   CALCULATION    we derived this from records, by a method we can show
 *   FORECAST       we projected this forward; it has not happened
 *   ASSUMPTION     we had to assume this to produce the above
 *   RECOMMENDATION we suggest you act
 *
 * These kinds were introduced here and have since been **promoted to the
 * Knowledge layer**, because the distinction is not a finance concern. This
 * module now defers to that definition rather than keeping a second copy: a
 * `Statement` is a finance-shaped view of a `Claim`, and `statementToClaim`
 * below is the projection between them.
 */
export type StatementKind = ClaimKind;

export const STATEMENT_KIND_LABELS = CLAIM_KIND_LABELS;

/** How far a statement is from a recorded fact. Ascending. */
const KIND_DISTANCE = CLAIM_KIND_DISTANCE;

export interface Statement {
  id: string;
  kind: StatementKind;
  text: string;
  /** Records this statement draws on. Powers the §25 drill-down. */
  derivedFrom: EntityReference[];
  /** Other statements this one stands on. Traversed by `traceStatement`. */
  supportedBy?: string[];
  /** For calculations: the arithmetic, written so a human can check it. */
  workings?: string;
  period?: Period;
  /** 0..1, only where a meaningful confidence exists. Never on a fact. */
  confidence?: number;
  caveats?: string[];
}

interface StatementInit {
  id: string;
  text: string;
  derivedFrom?: EntityReference[];
  supportedBy?: string[];
  workings?: string;
  period?: Period;
  confidence?: number;
  caveats?: string[];
}

function build(kind: StatementKind, init: StatementInit): Statement {
  return {
    id: init.id,
    kind,
    text: init.text,
    derivedFrom: init.derivedFrom ?? [],
    ...(init.supportedBy ? { supportedBy: init.supportedBy } : {}),
    ...(init.workings ? { workings: init.workings } : {}),
    ...(init.period ? { period: init.period } : {}),
    ...(init.confidence !== undefined ? { confidence: init.confidence } : {}),
    ...(init.caveats && init.caveats.length > 0 ? { caveats: init.caveats } : {}),
  };
}

export const fact = (init: StatementInit): Statement => build("fact", init);
export const calculation = (init: StatementInit): Statement => build("calculation", init);
export const forecast = (init: StatementInit): Statement => build("forecast", init);
export const assumption = (init: StatementInit): Statement => build("assumption", init);
export const recommendation = (init: StatementInit): Statement => build("recommendation", init);

/**
 * The weakest kind anywhere in a statement's support chain.
 *
 * A calculation resting on a forecast is not a calculation any more, and must
 * not be presented as one. Callers use this to label the *effective* certainty
 * of a headline figure.
 */
export function effectiveKind(root: Statement, index: StatementIndex): StatementKind {
  let weakest = root.kind;
  for (const node of walk(root, index)) {
    if (KIND_DISTANCE[node.kind] > KIND_DISTANCE[weakest]) weakest = node.kind;
  }
  return weakest;
}

export type StatementIndex = ReadonlyMap<string, Statement>;

export function indexStatements(statements: Statement[]): StatementIndex {
  return new Map(statements.map((s) => [s.id, s]));
}

export interface DerivationNode {
  statement: Statement;
  depth: number;
  children: DerivationNode[];
  /** Set when a supporting statement id could not be resolved. */
  unresolved?: string[];
}

/**
 * §25. Walk from a headline statement down to the records beneath it, so
 * "Youth Futures has a £310k funding gap" opens into the programme budget,
 * the grant end dates, the confirmed funding and the assumptions used.
 *
 * Cycle-safe: a statement is expanded once per trace.
 */
export function traceStatement(
  root: Statement,
  index: StatementIndex,
  seen: Set<string> = new Set(),
  depth = 0,
): DerivationNode {
  const node: DerivationNode = { statement: root, depth, children: [] };
  if (seen.has(root.id)) return node;
  seen.add(root.id);

  const unresolved: string[] = [];
  for (const id of root.supportedBy ?? []) {
    const child = index.get(id);
    if (!child) {
      unresolved.push(id);
      continue;
    }
    node.children.push(traceStatement(child, index, seen, depth + 1));
  }
  if (unresolved.length > 0) node.unresolved = unresolved;
  return node;
}

function* walk(root: Statement, index: StatementIndex, seen = new Set<string>()): Generator<Statement> {
  if (seen.has(root.id)) return;
  seen.add(root.id);
  yield root;
  for (const id of root.supportedBy ?? []) {
    const child = index.get(id);
    if (child) yield* walk(child, index, seen);
  }
}

/** Flatten a trace depth-first, for a linear "how we got here" list. */
export function flattenTrace(node: DerivationNode): DerivationNode[] {
  return [node, ...node.children.flatMap(flattenTrace)];
}

/** Every record referenced anywhere in the chain, deduplicated. */
export function tracedReferences(root: Statement, index: StatementIndex): EntityReference[] {
  const out = new Map<string, EntityReference>();
  for (const node of walk(root, index)) {
    for (const ref of node.derivedFrom) out.set(`${ref.type}:${ref.id}`, ref);
  }
  return [...out.values()];
}

/**
 * Project a finance statement into a Knowledge-layer claim.
 *
 * This is the bridge that stops finance provenance and knowledge provenance
 * being two systems. Statements stay the ergonomic in-memory shape the
 * calculation modules build and test against; claims are the persisted,
 * tenant-owned, traceable form the rest of the product reads.
 *
 * The producer is always `calculation`: every figure in this module is produced
 * by a pure function, never by a model, and the record says so. Verification is
 * always `needs_review` — a calculated figure is not an approved one, which is
 * the same rule `approveFundingNeed` enforces.
 */
export function statementToClaim(
  statement: Statement,
  init: {
    organisationId: UUID;
    subject: EntityReference;
    predicate: string;
    /** The function that produced it, for the audit trail. */
    producedByFunction: string;
    version?: string;
    now: Date;
  },
): Claim {
  const at = init.now.toISOString();
  return {
    id: statement.id,
    organisationId: init.organisationId,
    subject: init.subject,
    predicate: init.predicate,
    value: { type: "text", text: statement.text },
    text: statement.text,
    kind: statement.kind,
    verification: "needs_review",
    ...(statement.confidence !== undefined ? { confidence: statement.confidence } : {}),
    sources: [],
    derivedFrom: statement.derivedFrom,
    supportedBy: statement.supportedBy ?? [],
    producedBy: {
      method: "calculation",
      function: init.producedByFunction,
      version: init.version ?? "1",
    },
    ...(statement.workings ? { workings: statement.workings } : {}),
    assumptions: [],
    caveats: statement.caveats ?? [],
    ...(statement.period ? { periodLabel: statement.period.label } : {}),
    conflictsWith: [],
    audit: { createdAt: at, updatedAt: at, archivedAt: null },
  };
}
