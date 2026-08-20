import type {
  ClaimKind,
  EntityReference,
  GroundingRecord,
  ISODate,
  UUID,
} from "@/types/domain";

/**
 * Mission Intelligence: the vocabulary.
 *
 * This is not a chatbot feature and these types are the reason. Every answer
 * Mission OS gives is a structured object whose parts are separated by *how
 * they were arrived at*, because a reader cannot audit a paragraph in which a
 * recorded figure, an arithmetic result and a suggestion are the same shade of
 * prose.
 *
 * The separation the brief asks for — FACTS, CALCULATIONS, INFERENCES,
 * ASSUMPTIONS, RECOMMENDATIONS, UNKNOWNS — is five kinds plus one absence, and
 * they are modelled differently for that reason. The first five are `ClaimKind`,
 * which already exists and is already load-bearing: `effectiveClaimKind` will
 * downgrade a calculation that rests on a forecast, and a brief that invented a
 * parallel enum would route around that rule.
 *
 * UNKNOWNS are not a kind. An unknown has no producer, no workings and no
 * confidence; it has a *reason*, and the reasons are meaningfully different
 * from each other. See `UnknownReason`.
 */

/**
 * Why something is not known.
 *
 * `MISSION_GRAPH_ARCHITECTURE.md` §8 names the vocabulary the product must be
 * able to say and records that only six of the eight had any representation,
 * with `cannot_calculate` living in finance alone and `not_applicable`
 * existing nowhere and therefore "most often faked by a zero". This is that
 * vocabulary, once, in the layer that reports to a human.
 *
 * The distinctions are not stylistic:
 *
 * - `not_measured` is an indicator with no reading. The organisation could
 *   answer this and has not.
 * - `no_evidence` is an assertion nothing supports. The organisation may well
 *   know the answer; nothing corroborates it.
 * - `insufficient_data` is a calculation with too few inputs to be meaningful,
 *   which is different from one that cannot be attempted at all.
 * - `cannot_calculate` is a refusal: the method exists, its preconditions are
 *   not met, and producing a number anyway would be misleading. Finance
 *   already refuses this way and the refusal must survive contact with a brief.
 * - `not_applicable` is the one a zero most often impersonates. "No restricted
 *   funds were spent" and "this organisation holds no restricted funds" are
 *   different statements and must not render identically.
 */
export type UnknownReason =
  | "unknown"
  | "not_measured"
  | "no_evidence"
  | "needs_verification"
  | "insufficient_data"
  | "conflicting_sources"
  | "cannot_calculate"
  | "not_applicable";

export const UNKNOWN_REASON_LABELS: Record<UnknownReason, string> = {
  unknown: "Unknown",
  not_measured: "Not measured",
  no_evidence: "No evidence",
  needs_verification: "Needs verification",
  insufficient_data: "Insufficient data",
  conflicting_sources: "Conflicting sources",
  cannot_calculate: "Cannot calculate",
  not_applicable: "Not applicable",
};

/**
 * Something Mission OS was asked and declines to answer, with the reason.
 *
 * `resolvedBy` is what would close it. An unknown that cannot say what would
 * resolve it is an apology rather than information, so it is present for every
 * reason except `not_applicable`, where nothing resolves it because nothing is
 * missing.
 */
export interface MissionUnknown {
  /** What could not be established, phrased as the question a person asked. */
  question: string;
  reason: UnknownReason;
  /** What the organisation would have to do. Absent only for `not_applicable`. */
  resolvedBy?: string;
  /** The record the gap is about, where there is one. */
  subject?: EntityReference;
}

/**
 * One assertion inside a brief.
 *
 * `sources` are graph references, not labels. That is what makes the citation
 * checkable: a statement claiming to rest on the Henderson grant names
 * `{ type: "grant", id: "grant-henderson" }`, and a reader can follow it.
 *
 * `claimIds` is separate from `sources` and both matter. A claim is an
 * immutable assertion with its own provenance; a source is the record the
 * statement was derived from. A calculation over live records has sources and
 * no claim; a figure lifted from a published report has both.
 */
export interface MissionStatement {
  id: string;
  kind: ClaimKind;
  text: string;
  /** For calculations: the arithmetic, written so a human can check it. */
  workings?: string;
  /** Immutable claims cited. */
  claimIds?: UUID[];
  /** Graph records this rests on. */
  sources: EntityReference[];
  /** 0..1. The producer's certainty. Never promotes verification. */
  confidence?: number;
}

// --- Attention ----------------------------------------------------------

/**
 * The domains the Command Centre triages across.
 *
 * Deliberately the brief's list, plus `strategy`. A signal has exactly one
 * category so that "what needs attention?" can be read by domain; a signal
 * that genuinely spans domains is a `CompositeAttentionItem`, which is a
 * different thing and is the point of the phase.
 */
export type AttentionCategory =
  | "funding"
  | "grants"
  | "finance"
  | "programmes"
  | "evidence"
  | "impact"
  | "relationships"
  | "reports"
  | "governance"
  | "strategy";

export const ATTENTION_CATEGORY_LABELS: Record<AttentionCategory, string> = {
  funding: "Funding",
  grants: "Grants",
  finance: "Finance",
  programmes: "Programmes",
  evidence: "Evidence",
  impact: "Impact",
  relationships: "Relationships",
  reports: "Reports",
  governance: "Governance",
  strategy: "Strategy",
};

export type AttentionSeverity = "critical" | "high" | "medium" | "low";

export const SEVERITY_WEIGHT: Record<AttentionSeverity, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
};

/**
 * One deterministic reason an item is on the list.
 *
 * Every attention item must be able to show these. A priority ordering nobody
 * can interrogate is a ranking the organisation has to take on trust, and the
 * whole product exists to avoid asking for that.
 */
export interface AttentionSignal {
  /** Stable identifier, e.g. `deliverable_overdue`. Testable; never displayed raw. */
  code: string;
  label: string;
  detail: string;
  /** Contribution to the score. Positive raises priority. */
  weight: number;
  ref?: EntityReference;
}

export type AttentionKind = "risk" | "obligation" | "opportunity" | "observation";

export interface AttentionItem {
  id: string;
  category: AttentionCategory;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  /** What the item is about. */
  subject: EntityReference;
  /** Why it is here, and why it ranks where it does. */
  signals: AttentionSignal[];
  /** Deterministic priority. Never produced by a model. */
  score: number;
  /** Negative when already passed. */
  dueInDays?: number;
  /** The one thing to do about it. */
  action?: { label: string; href?: string };
  claimIds?: UUID[];
  sources: EntityReference[];
}

/**
 * An item that only exists because several domains agree.
 *
 * The acceptance test for this phase is that Mission OS surfaces the
 * *combination*: a grant ending is a grant fact, a programme depending on it
 * is a delivery fact, and a thin unrestricted reserve is a finance fact. Each
 * alone is routine. Together they are the most important thing happening in
 * the organisation, and no single module can see it.
 */
export interface CompositeAttentionItem extends AttentionItem {
  /** Which rule fired. Stable, testable. */
  rule: string;
  /** The single-domain items that combined. */
  components: AttentionItem[];
  contributingCategories: AttentionCategory[];
}

export function isComposite(item: AttentionItem): item is CompositeAttentionItem {
  return "rule" in item && Array.isArray((item as CompositeAttentionItem).components);
}

// --- Briefs -------------------------------------------------------------

export interface RecommendedAction {
  id: string;
  title: string;
  rationale: string;
  /** Which attention item this answers. */
  attentionItemId?: string;
  subject?: EntityReference;
  /** `high` means it changes an outcome, not that it is urgent. */
  priority: AttentionSeverity;
  /** True where taking it has an effect a third party can see. */
  externallyVisible: boolean;
  dueBy?: ISODate;
}

/**
 * What the brief was built from.
 *
 * Recorded rather than described, so a brief that looks wrong can be
 * diagnosed. It names the scopes assembled, the number of records in each and
 * — the part that matters — everything deliberately withheld and why.
 */
export interface ContextSnapshot {
  organisationId: UUID;
  /** ISO timestamp of the request clock, not the wall clock. */
  assembledAt: ISODate;
  scopes: { scope: string; records: number }[];
  withheld: { scope: string; reason: string }[];
  /** Total records offered to any generation. */
  recordCount: number;
}

export type MissionBriefScope =
  | "organisation"
  | "question"
  | "morning"
  | "grant"
  | "programme"
  | "relationship"
  | "report";

/**
 * The reusable intelligence output.
 *
 * Every field the brief specification names, and nothing that would let a
 * caller collapse the separation: there is no `text` field holding the whole
 * answer as prose, because that is precisely the shape that lets a
 * recommendation be read as a fact.
 */
export interface MissionBrief {
  id: string;
  organisationId: UUID;
  scope: MissionBriefScope;
  /** What the brief is about, where it is about one record. */
  subject?: EntityReference;
  /** The question asked, for `question` scope. */
  question?: string;

  headline: string;
  summary: string;

  facts: MissionStatement[];
  calculations: MissionStatement[];
  inferences: MissionStatement[];
  assumptions: MissionStatement[];

  risks: AttentionItem[];
  opportunities: AttentionItem[];
  unknowns: MissionUnknown[];
  recommendedActions: RecommendedAction[];

  /** Every record cited anywhere above, deduplicated. */
  sources: EntityReference[];

  generatedAt: ISODate;
  contextSnapshot: ContextSnapshot;

  /**
   * Set only where a model narrated the brief. A brief with no model is a
   * complete brief — the deterministic layer produces every field above — so
   * these are optional rather than defaulted, and a missing model means the
   * answer was computed rather than generated.
   */
  promptVersion?: string;
  model?: string;
  provenance?: GroundingRecord;
  /** True when a live provider failed and deterministic output was used. */
  usedFallback?: boolean;
  /** Narration, where a model produced it. Never replaces the fields above. */
  narrative?: string;
}
