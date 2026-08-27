import { parseISO } from "date-fns";
import type { EntityReference } from "@/types/domain";
import { formatMoney, money, subtractMoney, sumMoney } from "@/lib/finance-intelligence/money";
import { computeConcentration } from "@/lib/finance-intelligence/concentration";
import { indicatorProgress } from "@/lib/logic/progress";
import type { MissionSnapshot } from "./snapshot";
import type { AttentionBoard } from "./cross-domain";
import type {
  AttentionItem,
  ContextSnapshot,
  MissionBrief,
  MissionBriefScope,
  MissionStatement,
  MissionUnknown,
  RecommendedAction,
} from "./types";

/**
 * Deterministic brief assembly.
 *
 * A `MissionBrief` produced here is complete before any model is involved.
 * That ordering is the whole architecture: the model's job is to narrate a
 * brief, and a narration layer that is also the reasoning layer cannot be
 * checked. If the provider is unavailable, the brief still holds every fact,
 * calculation, risk, unknown and recommended action — it simply has no prose.
 *
 * Nothing here writes a number it cannot show the arithmetic for, and nothing
 * fills a gap. Where a figure cannot be produced, the reason it cannot is
 * recorded as a `MissionUnknown`, because "we could not calculate this" is
 * information and a blank is not.
 */

function ref(type: EntityReference["type"], id: string, label?: string): EntityReference {
  return label ? { type, id, label } : { type, id };
}

const majorToMoney = (major: number, currency: string) =>
  money(Math.round(major * 100), currency);

// --- Facts --------------------------------------------------------------

/**
 * Facts are counts and dates read straight off records.
 *
 * Nothing derived appears here, including anything that required a filter with
 * a threshold in it. "Three grants are active" is a fact; "three grants are at
 * risk" is an inference, and putting the second in this list would be the
 * exact category error the brief structure exists to prevent.
 */
export function assembleFacts(s: MissionSnapshot): MissionStatement[] {
  const facts: MissionStatement[] = [];
  const activeGrants = s.grants.filter((g) => g.status === "active");
  const activeProgrammes = s.programmes.filter((p) => p.status === "active");

  if (activeGrants.length > 0) {
    const total = activeGrants.reduce((sum, g) => sum + g.awardValue, 0);
    facts.push({
      id: "fact:active_grants",
      kind: "fact",
      text: `${activeGrants.length} grant${activeGrants.length === 1 ? " is" : "s are"} currently active, with a combined award value of ${formatMoney(majorToMoney(total, s.currency))}.`,
      sources: activeGrants.map((g) => ref("grant", g.id, g.title)),
    });
  }

  if (activeProgrammes.length > 0) {
    facts.push({
      id: "fact:active_programmes",
      kind: "fact",
      text: `${activeProgrammes.length} programme${activeProgrammes.length === 1 ? " is" : "s are"} in delivery: ${activeProgrammes.map((p) => p.name).join(", ")}.`,
      sources: activeProgrammes.map((p) => ref("programme", p.id, p.name)),
    });
  }

  const openPipeline = s.opportunities.filter(
    (o) => !["unsuccessful", "archived", "awarded"].includes(o.stage),
  );
  if (openPipeline.length > 0) {
    const value = openPipeline.reduce((sum, o) => sum + (o.maxAward ?? 0), 0);
    facts.push({
      id: "fact:pipeline",
      kind: "fact",
      text: `${openPipeline.length} funding opportunit${openPipeline.length === 1 ? "y is" : "ies are"} live in the pipeline, worth up to ${formatMoney(majorToMoney(value, s.currency))} if every award were made at its maximum.`,
      sources: openPipeline.map((o) => ref("funding_opportunity", o.id, o.programmeName)),
    });
  }

  if (s.indicators.length > 0) {
    const measured = s.indicators.filter((i) => i.lastUpdated);
    facts.push({
      id: "fact:indicators",
      kind: "fact",
      text: `${s.indicators.length} indicator${s.indicators.length === 1 ? " is" : "s are"} defined across the outcome framework, of which ${measured.length} carr${measured.length === 1 ? "ies" : "y"} a recorded measurement date.`,
      sources: s.indicators.map((i) => ref("indicator", i.id, i.name)),
    });
  }

  if (s.funds.length > 0) {
    const restricted = s.funds.filter((f) => f.restriction === "restricted");
    facts.push({
      id: "fact:funds",
      kind: "fact",
      text: `${s.funds.length} fund${s.funds.length === 1 ? " is" : "s are"} held, ${restricted.length} of them carrying a funder restriction.`,
      sources: s.funds.map((f) => ref("fund", f.id, f.name)),
    });
  }

  return facts;
}

// --- Calculations -------------------------------------------------------

/**
 * Calculations carry their workings.
 *
 * `workings` is not optional in practice: a calculation whose arithmetic
 * cannot be shown should be labelled an inference, and doing that honestly is
 * cheaper than defending a number nobody can reproduce.
 */
export function assembleCalculations(s: MissionSnapshot): MissionStatement[] {
  const out: MissionStatement[] = [];

  // Grant utilisation from allocations, never from `Grant.spentToDate`.
  for (const grant of s.grants) {
    if (grant.status !== "active") continue;
    const allocations = s.allocations.filter((a) => a.grantId === grant.id);
    if (allocations.length === 0) continue;
    const spent = sumMoney(
      allocations.map((a) => a.amount),
      s.currency,
    );
    const award = majorToMoney(grant.awardValue, s.currency);
    const remaining = subtractMoney(award, spent);
    const percent = award.minorUnits
      ? Math.round((spent.minorUnits / award.minorUnits) * 1000) / 10
      : 0;
    out.push({
      id: `calc:grant_utilisation:${grant.id}`,
      kind: "calculation",
      text: `${formatMoney(remaining)} of the ${grant.title} award remains, with ${percent}% utilised.`,
      workings: `${formatMoney(award)} awarded minus ${formatMoney(spent)} allocated across ${allocations.length} allocation${allocations.length === 1 ? "" : "s"} equals ${formatMoney(remaining)}.`,
      sources: [
        ref("grant", grant.id, grant.title),
        ...allocations.slice(0, 20).map((a) => ref("allocation", a.id)),
      ],
    });
  }

  // Funder concentration over active award value.
  const active = s.grants.filter((g) => g.status === "active");
  if (active.length > 1) {
    const funderName = new Map(s.funders.map((f) => [f.id, f.name]));
    const position = computeConcentration(
      active.map((g) => ({
        funderId: g.funderId,
        funderName: funderName.get(g.funderId) ?? "Unnamed funder",
        amount: majorToMoney(g.awardValue, s.currency),
      })),
      s.currency,
    );
    if (position.largest) {
      out.push({
        id: "calc:concentration",
        kind: "calculation",
        text: `${position.largest.funderName} accounts for ${position.largest.sharePercent}% of active award value; the largest three account for ${position.topThreePercent}%.`,
        workings: `${formatMoney(position.largest.amount)} divided by ${formatMoney(position.total)} total active award value. Herfindahl index ${position.herfindahl}.`,
        sources: active.map((g) => ref("grant", g.id, g.title)),
      });
    }
  }

  // Indicator progress, where a target exists to measure against.
  for (const indicator of s.indicators) {
    if (!indicator.target || !indicator.lastUpdated) continue;
    const progress = indicatorProgress(indicator);
    out.push({
      id: `calc:indicator_progress:${indicator.id}`,
      kind: "calculation",
      text: `${indicator.name} stands at ${indicator.currentValue}${indicator.unit === "%" ? "%" : ` ${indicator.unit}`}, ${progress}% of its ${indicator.target} target.`,
      workings: `(${indicator.currentValue} minus ${indicator.baseline}) divided by (${indicator.target} minus ${indicator.baseline}), times 100, clamped to the range 0 to 100.`,
      sources: [ref("indicator", indicator.id, indicator.name)],
      confidence:
        indicator.confidence === "high" ? 0.9 : indicator.confidence === "medium" ? 0.6 : 0.3,
    });
  }

  return out;
}

// --- Inferences and assumptions -----------------------------------------

/**
 * Inferences come from the cross-domain rules, and from nowhere else.
 *
 * That constraint is deliberate. An inference is the one kind in the brief
 * that cannot show either a record or arithmetic, so its provenance has to be
 * a named rule and the components that rule fired on. An inference produced by
 * a paragraph of reasoning has no such handle and does not belong here.
 */
export function assembleInferences(board: AttentionBoard): MissionStatement[] {
  return board.composites.map((composite) => ({
    id: `inference:${composite.rule}:${composite.subject.id}`,
    kind: "inference" as const,
    text: `${composite.title}. ${composite.detail}`,
    sources: composite.sources,
    // The reasoning, written as the rule that produced it plus the domains
    // that had to agree. Not arithmetic, and not presented as such.
    workings: `Rule ${composite.rule} fired on ${composite.components.length} findings across ${composite.contributingCategories.join(", ")}.`,
  }));
}

export function assembleAssumptions(s: MissionSnapshot): MissionStatement[] {
  const out: MissionStatement[] = [];

  if (s.transactions.length > 0) {
    out.push({
      id: "assumption:burn_continues",
      kind: "assumption",
      text: "Runway figures assume the net burn observed over the recorded transaction window continues unchanged.",
      sources: [ref("organisation", s.organisationId)],
    });
  }
  if (s.grants.some((g) => g.status === "active")) {
    out.push({
      id: "assumption:award_value_as_income",
      kind: "assumption",
      text: "Concentration is calculated on award value rather than on income received in a period, because a full income ledger has not been recorded.",
      sources: [ref("organisation", s.organisationId)],
    });
  }
  if (s.programmes.some((p) => p.startDate && p.endDate)) {
    out.push({
      id: "assumption:linear_delivery",
      kind: "assumption",
      text: "Indicators described as behind target are compared against time elapsed, which assumes delivery accrues evenly across the programme period.",
      sources: s.programmes
        .filter((p) => p.startDate && p.endDate)
        .map((p) => ref("programme", p.id, p.name)),
    });
  }

  return out;
}

// --- Unknowns -----------------------------------------------------------

/**
 * What Mission OS declines to answer, and why.
 *
 * This is the function that stops the product being "confident because it is
 * quiet". Every branch below corresponds to a question a user would reasonably
 * ask, and each returns the specific reason it cannot be answered rather than
 * an empty section that reads as a clean bill of health.
 */
export function detectUnknowns(s: MissionSnapshot): MissionUnknown[] {
  const unknowns: MissionUnknown[] = [];

  if (s.funds.length === 0 || s.transactions.length === 0) {
    unknowns.push({
      question: "How many months of unrestricted runway remain?",
      reason: "cannot_calculate",
      resolvedBy:
        s.funds.length === 0
          ? "Record the organisation's funds, then import or enter transactions against them."
          : "Import bank transactions so income and expenditure can be measured.",
      subject: ref("organisation", s.organisationId),
    });
  } else if (!s.funds.some((f) => f.restriction === "unrestricted")) {
    // Not the same as zero. This organisation holds no unrestricted fund at
    // all, so the question does not apply rather than answering nought months.
    unknowns.push({
      question: "How many months of unrestricted runway remain?",
      reason: "not_applicable",
      subject: ref("organisation", s.organisationId),
    });
  }

  if (s.allocations.length === 0 && s.transactions.length > 0) {
    unknowns.push({
      question: "What does each outcome cost to deliver?",
      reason: "cannot_calculate",
      resolvedBy:
        "Allocate transactions to programmes and activities. Cost per outcome cannot be produced from unallocated expenditure.",
      subject: ref("organisation", s.organisationId),
    });
  }

  for (const indicator of s.indicators) {
    const measurements = s.measurements.filter((m) => m.indicatorId === indicator.id);
    if (measurements.length > 0 || indicator.lastUpdated) continue;
    unknowns.push({
      question: `What is the current value of ${indicator.name}?`,
      reason: "not_measured",
      resolvedBy: "Record a measurement against this indicator.",
      subject: ref("indicator", indicator.id, indicator.name),
    });
  }

  const evidenced = new Set(s.evidenceTargets.map((l) => `${l.targetType}:${l.targetId}`));
  for (const outcome of s.outcomes) {
    if (evidenced.has(`outcome:${outcome.id}`)) continue;
    const indicators = s.indicators.filter((i) => i.outcomeId === outcome.id);
    if (indicators.some((i) => evidenced.has(`indicator:${i.id}`))) continue;
    unknowns.push({
      question: `What evidence supports ${outcome.title}?`,
      reason: "no_evidence",
      resolvedBy: "Link an evaluation, survey, case study or statistic to this outcome.",
      subject: ref("outcome", outcome.id, outcome.title),
    });
  }

  for (const conflict of s.claimConflicts.filter((c) => !c.resolvedClaimId)) {
    unknowns.push({
      question: `Which value of ${conflict.predicate.replace(/_/g, " ")} is correct?`,
      reason: "conflicting_sources",
      resolvedBy: "Choose the authoritative claim, or record a corrected one.",
      subject: conflict.subject,
    });
  }

  if (s.requirements.length === 0 && s.grants.some((g) => g.status === "active")) {
    unknowns.push({
      question: "What has this organisation promised its funders?",
      reason: "unknown",
      resolvedBy:
        "Record reporting requirements against each grant, naming the outcomes and indicators the funder asked for.",
      subject: ref("organisation", s.organisationId),
    });
  }

  return unknowns;
}

// --- Recommendations ----------------------------------------------------

/**
 * One recommended action per attention item, in rank order.
 *
 * A recommendation is never generated independently of a finding. It always
 * answers an item and carries that item's id, so "why are you telling me to do
 * this?" resolves to the signals that produced it rather than to a model's
 * judgement.
 */
export function recommendActions(board: AttentionBoard, limit = 5): RecommendedAction[] {
  return board.items.slice(0, limit).map((item) => ({
    id: `action:${item.id}`,
    title: item.action?.label
      ? `${item.action.label}: ${item.subject.label ?? item.title}`
      : item.title,
    rationale: item.signals.map((sig) => sig.detail).join(" ") || item.detail,
    attentionItemId: item.id,
    subject: item.subject,
    priority: item.severity,
    // Anything a funder or partner can see requires a human before it happens.
    // Recorded on the recommendation so the automation layer inherits the rule
    // rather than re-deriving it.
    externallyVisible:
      item.category === "reports" ||
      item.category === "relationships" ||
      item.category === "funding",
  }));
}

// --- The brief ----------------------------------------------------------

export interface BriefInput {
  snapshot: MissionSnapshot;
  board: AttentionBoard;
  scope: MissionBriefScope;
  contextSnapshot: ContextSnapshot;
  subject?: EntityReference;
  question?: string;
  /** How many risks and opportunities to carry. Zero means all of them. */
  limit?: number;
}

function dedupeSources(items: EntityReference[]): EntityReference[] {
  const seen = new Map<string, EntityReference>();
  for (const item of items) seen.set(`${item.type}:${item.id}`, item);
  return [...seen.values()];
}

export function buildMissionBrief(input: BriefInput): MissionBrief {
  const { snapshot, board, scope, contextSnapshot } = input;
  const limit = input.limit ?? 5;

  const risks = board.items.filter(
    (i) => i.kind === "risk" || i.kind === "obligation" || i.kind === "observation",
  );
  const opportunities = board.items.filter((i) => i.kind === "opportunity");

  const facts = assembleFacts(snapshot);
  const calculations = assembleCalculations(snapshot);
  const inferences = assembleInferences(board);
  const assumptions = assembleAssumptions(snapshot);
  const unknowns = detectUnknowns(snapshot);
  const recommendedActions = recommendActions(board, limit);

  const top = board.items[0];
  const headline = top
    ? top.title
    : snapshot.grants.length === 0 && snapshot.programmes.length === 0
      ? "There is not yet enough recorded to report on."
      : "Nothing currently requires attention.";

  const categories = new Set(board.items.map((i) => i.category));

  /**
   * The summary is composed, not written.
   *
   * It states counts and names the top item. It deliberately contains no
   * adjectives about how the organisation is doing: that judgement belongs to
   * the reader, and a deterministic layer that ventured it would be asserting
   * something it cannot support.
   */
  const summary = [
    `${board.items.length} item${board.items.length === 1 ? "" : "s"} need attention across ${categories.size} area${categories.size === 1 ? "" : "s"}.`,
    board.composites.length
      ? `${board.composites.length} of them ${board.composites.length === 1 ? "is" : "are"} cross-domain: ${board.composites.map((c) => c.contributingCategories.join(" plus ")).join("; ")}.`
      : "None of them currently combine across domains.",
    unknowns.length
      ? `${unknowns.length} question${unknowns.length === 1 ? "" : "s"} cannot be answered from what is recorded.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `brief:${scope}:${snapshot.organisationId}:${contextSnapshot.assembledAt}`,
    organisationId: snapshot.organisationId,
    scope,
    subject: input.subject,
    question: input.question,
    headline,
    summary,
    facts,
    calculations,
    inferences,
    assumptions,
    risks: limit > 0 ? risks.slice(0, limit) : risks,
    opportunities: limit > 0 ? opportunities.slice(0, limit) : opportunities,
    unknowns,
    recommendedActions,
    sources: dedupeSources([
      ...facts.flatMap((f) => f.sources),
      ...calculations.flatMap((c) => c.sources),
      ...inferences.flatMap((i) => i.sources),
      ...risks.flatMap((r) => r.sources),
      ...opportunities.flatMap((o) => o.sources),
    ]),
    generatedAt: contextSnapshot.assembledAt,
    contextSnapshot,
  };
}

// --- Morning brief ------------------------------------------------------

/**
 * Today.
 *
 * The brief's instruction is one line — *no manufactured urgency* — and it is
 * the only design constraint this needs. The counts are whatever the counts
 * are. There is no minimum, nothing is promoted to fill a section, and an
 * empty morning says so plainly rather than reaching further down the list for
 * something to put on the page.
 */
export interface MorningBrief {
  date: string;
  needsAttention: AttentionItem[];
  opportunities: AttentionItem[];
  deadlines: { item: AttentionItem; dueInDays: number }[];
  relationshipRisks: AttentionItem[];
  financialObservations: AttentionItem[];
  unknowns: MissionUnknown[];
  /** True when every section is empty. Said plainly rather than padded. */
  quiet: boolean;
}

export function buildMorningBrief(
  snapshot: MissionSnapshot,
  board: AttentionBoard,
  options: { attentionLimit?: number; deadlineHorizonDays?: number } = {},
): MorningBrief {
  const attentionLimit = options.attentionLimit ?? 3;
  const horizon = options.deadlineHorizonDays ?? 30;

  const needsAttention = board.items
    .filter((i) => i.kind === "risk" || i.kind === "obligation")
    .slice(0, attentionLimit);
  const opportunities = board.items.filter((i) => i.kind === "opportunity");

  const deadlines = board.items
    .filter((i) => i.dueInDays !== undefined && i.dueInDays <= horizon)
    .map((item) => ({ item, dueInDays: item.dueInDays as number }))
    .sort((a, b) => a.dueInDays - b.dueInDays);

  const relationshipRisks = board.items.filter(
    (i) => i.category === "relationships" && i.kind !== "opportunity",
  );
  const financialObservations = board.items.filter((i) => i.category === "finance");

  return {
    date: snapshot.now.toISOString().slice(0, 10),
    needsAttention,
    opportunities,
    deadlines,
    relationshipRisks,
    financialObservations,
    unknowns: detectUnknowns(snapshot).slice(0, 3),
    quiet:
      needsAttention.length === 0 &&
      opportunities.length === 0 &&
      deadlines.length === 0 &&
      relationshipRisks.length === 0 &&
      financialObservations.length === 0,
  };
}

export { parseISO };
