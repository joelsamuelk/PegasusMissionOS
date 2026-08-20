import { differenceInCalendarDays, parseISO } from "date-fns";
import type { EntityReference } from "@/types/domain";
import { formatMoney, money } from "@/lib/finance-intelligence/money";
import type { MissionSnapshot } from "./snapshot";
import type { AttentionBoard } from "./cross-domain";
import { detectUnknowns } from "./brief";
import type { AttentionItem, MissionStatement, MissionUnknown } from "./types";

/**
 * Ask Mission OS.
 *
 * The brief lists ten questions the product must answer. They are not ten
 * prompts: each is a **deterministic query over the Mission Graph** whose
 * answer is assembled from records, and a model's only job is to read that
 * answer aloud. That ordering is what makes "answers require citations to
 * Mission Graph records" enforceable rather than aspirational — the citations
 * exist before the sentence does.
 *
 * Routing is keyword matching, deliberately. A classifier would be a second
 * place for the product to be wrong, and a wrong route here is not a slightly
 * worse answer but an answer about the wrong subject. When nothing matches,
 * the fallback is the organisation-wide answer, which is the phase's own
 * acceptance test and is never a bad answer to give.
 */

export interface QuestionAnswer {
  /** The handler that produced this. Stable and testable. */
  handler: string;
  headline: string;
  /** Structured statements, separated by how each was arrived at. */
  statements: MissionStatement[];
  /** The attention items behind the answer. */
  items: AttentionItem[];
  unknowns: MissionUnknown[];
  sources: EntityReference[];
}

export interface QuestionHandler {
  id: string;
  /** A phrasing to offer in the UI. */
  label: string;
  /** Lowercased keyword groups. Every group must match at least one term. */
  matches: string[][];
  answer(snapshot: MissionSnapshot, board: AttentionBoard): QuestionAnswer;
}

function ref(type: EntityReference["type"], id: string, label?: string): EntityReference {
  return label ? { type, id, label } : { type, id };
}

function statementsFromItems(items: AttentionItem[], prefix: string): MissionStatement[] {
  return items.map((item, index) => ({
    id: `${prefix}:${index}`,
    // An attention item is an inference where it combined domains, and a fact
    // about the record otherwise. Labelling every item an inference would
    // understate a plain overdue deliverable; labelling every one a fact would
    // overstate a composite.
    kind: "components" in item ? ("inference" as const) : ("fact" as const),
    text: `${item.title}. ${item.detail}`,
    sources: item.sources,
    workings: item.signals.map((sig) => `${sig.label}: ${sig.detail}`).join(" "),
  }));
}

function collectSources(items: AttentionItem[]): EntityReference[] {
  const seen = new Map<string, EntityReference>();
  for (const source of items.flatMap((i) => i.sources)) {
    seen.set(`${source.type}:${source.id}`, source);
  }
  return [...seen.values()];
}

function emptyAnswer(handler: string, headline: string): QuestionAnswer {
  return { handler, headline, statements: [], items: [], unknowns: [], sources: [] };
}

/**
 * The acceptance test, as a function.
 *
 * "What are the five most important things happening across this organisation?"
 * The brief's condition for the phase is explicit: if the answer summarises
 * each module separately, the phase is incomplete. So the ranking is over the
 * board *after* cross-domain composition, which means a combination outranks
 * its own parts and the five are genuinely the five rather than one per
 * module.
 */
export const topPriorities: QuestionHandler = {
  id: "top_priorities",
  label: "What are the five most important things happening across this organisation?",
  matches: [
    ["most important", "worry", "priorities", "attention", "focus", "happening", "top"],
  ],
  answer(snapshot, board) {
    const items = board.items.slice(0, 5);
    const unknowns = detectUnknowns(snapshot);
    return {
      handler: this.id,
      headline: items.length
        ? `${items.length} thing${items.length === 1 ? "" : "s"} across ${new Set(items.map((i) => i.category)).size} area${new Set(items.map((i) => i.category)).size === 1 ? "" : "s"}, ${board.composites.length} of which connect more than one domain.`
        : "Nothing currently meets the threshold for attention.",
      statements: statementsFromItems(items, "top"),
      items,
      unknowns: unknowns.slice(0, 5),
      sources: collectSources(items),
    };
  },
};

export const fundersNeedingAttention: QuestionHandler = {
  id: "funders_needing_attention",
  label: "Which funders need attention?",
  matches: [["funder", "funders", "donor", "supporter"], ["attention", "need", "quiet", "which"]],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) =>
        item.subject.type === "funder" ||
        item.subject.type === "relationship" ||
        item.category === "relationships",
    );
    return {
      handler: this.id,
      headline: items.length
        ? `${items.length} funder relationship${items.length === 1 ? "" : "s"} need attention.`
        : "No funder relationship currently meets the threshold for attention.",
      statements: statementsFromItems(items, "funder"),
      items,
      unknowns: snapshot.relationships.length
        ? []
        : [
            {
              question: "Which funders need attention?",
              reason: "unknown",
              resolvedBy: "Record relationships with the organisations that fund this work.",
            },
          ],
      sources: collectSources(items),
    };
  },
};

export const grantsMostExposed: QuestionHandler = {
  id: "grants_most_exposed",
  label: "Which grants are most exposed?",
  matches: [["grant", "grants", "award"], ["exposed", "risk", "at risk", "vulnerable", "which"]],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) =>
        item.category === "grants" ||
        item.subject.type === "grant" ||
        item.sources.some((source) => source.type === "grant"),
    );
    return {
      handler: this.id,
      headline: items.length
        ? `${items.length} finding${items.length === 1 ? "" : "s"} touch active grants.`
        : "No grant currently carries a risk signal.",
      statements: statementsFromItems(items, "grant"),
      items,
      unknowns: snapshot.grants.length ? [] : [
        {
          question: "Which grants are most exposed?",
          reason: "not_applicable",
        },
      ],
      sources: collectSources(items),
    };
  },
};

export const weakestEvidence: QuestionHandler = {
  id: "weakest_evidence",
  label: "Where is our evidence weakest?",
  matches: [["evidence", "proof", "evidenced"], ["weak", "weakest", "missing", "gap", "where"]],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) => item.category === "evidence" || item.category === "impact",
    );
    const unevidenced = snapshot.outcomes.filter(
      (outcome) =>
        !snapshot.evidenceTargets.some(
          (link) => link.targetType === "outcome" && link.targetId === outcome.id,
        ),
    );
    const statements = statementsFromItems(items, "evidence");
    if (snapshot.evidence.length > 0) {
      statements.unshift({
        id: "evidence:coverage",
        kind: "calculation",
        text: `${snapshot.outcomes.length - unevidenced.length} of ${snapshot.outcomes.length} outcomes have evidence linked to them.`,
        workings: `${snapshot.evidenceTargets.length} evidence links across ${snapshot.evidence.length} evidence items.`,
        sources: snapshot.outcomes.map((o) => ref("outcome", o.id, o.title)),
      });
    }
    return {
      handler: this.id,
      headline: unevidenced.length
        ? `${unevidenced.length} outcome${unevidenced.length === 1 ? " has" : "s have"} no evidence linked to them.`
        : "Every outcome has at least one piece of evidence linked to it.",
      statements,
      items,
      unknowns: detectUnknowns(snapshot).filter((u) => u.reason === "no_evidence"),
      sources: collectSources(items),
    };
  },
};

export const financiallyVulnerableProgramme: QuestionHandler = {
  id: "financially_vulnerable_programme",
  label: "Which programme is financially vulnerable?",
  matches: [
    ["programme", "programmes", "project", "service"],
    ["financial", "financially", "vulnerable", "money", "funding", "afford"],
  ],
  answer(snapshot, board) {
    // A programme is vulnerable where a grant funding it is ending. That is a
    // traversal — grant to programme through `programmeGrants` — rather than a
    // property of either record, which is why no single module can answer it.
    const composites = board.composites.filter(
      (c) => c.rule === "grant_ending_programme_dependency_low_runway",
    );
    const items: AttentionItem[] = [...composites];
    const statements = statementsFromItems(items, "vulnerable");

    for (const programme of snapshot.programmes) {
      if (programme.status !== "active") continue;
      const grantIds = snapshot.programmeGrants
        .filter((l) => l.programmeId === programme.id)
        .map((l) => l.grantId);
      const grants = snapshot.grants.filter((g) => grantIds.includes(g.id));
      const active = grants.filter((g) => g.status === "active");
      if (active.length === 0) {
        statements.push({
          id: `vulnerable:unfunded:${programme.id}`,
          kind: "fact",
          text: `${programme.name} has no active grant funding it.`,
          sources: [ref("programme", programme.id, programme.name)],
        });
        continue;
      }
      const soonest = active
        .map((g) => g.endDate)
        .sort()
        .at(0);
      const total = active.reduce((sum, g) => sum + g.awardValue, 0);
      statements.push({
        id: `vulnerable:funding:${programme.id}`,
        kind: "calculation",
        text: `${programme.name} is funded by ${active.length} active grant${active.length === 1 ? "" : "s"} worth ${formatMoney(money(Math.round(total * 100), snapshot.currency))}, the first of which ends ${soonest}.`,
        workings: `Sum of award value across ${active.map((g) => g.title).join(", ")}.`,
        sources: [
          ref("programme", programme.id, programme.name),
          ...active.map((g) => ref("grant", g.id, g.title)),
        ],
      });
    }

    return {
      handler: this.id,
      headline: composites.length
        ? composites[0]!.title
        : snapshot.programmes.length
          ? "No programme currently shows the combination of ending funding and an unabsorbable gap."
          : "No programme has been recorded.",
      statements,
      items,
      unknowns: detectUnknowns(snapshot).filter(
        (u) => u.reason === "cannot_calculate" || u.reason === "not_applicable",
      ),
      sources: collectSources(items),
    };
  },
};

export const reportsComing: QuestionHandler = {
  id: "reports_coming",
  label: "What reports are coming?",
  matches: [["report", "reports", "reporting", "deadline", "due"], []],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) => item.category === "reports" || item.subject.type === "grant_report",
    );
    const upcoming = [...snapshot.grantReports]
      .filter((r) => r.status !== "submitted")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const statements: MissionStatement[] = upcoming.map((report) => {
      const days = differenceInCalendarDays(parseISO(report.dueDate), snapshot.now);
      const grant = snapshot.grants.find((g) => g.id === report.grantId);
      return {
        id: `report:${report.id}`,
        kind: "fact" as const,
        text: `${report.title}${grant ? ` for ${grant.title}` : ""} is due ${report.dueDate}, ${days < 0 ? `${-days} days ago` : `in ${days} days`}, and is currently ${report.status.replace(/_/g, " ")}.`,
        sources: grant
          ? [ref("grant_report", report.id, report.title), ref("grant", grant.id, grant.title)]
          : [ref("grant_report", report.id, report.title)],
      };
    });

    return {
      handler: this.id,
      headline: upcoming.length
        ? `${upcoming.length} report${upcoming.length === 1 ? " is" : "s are"} outstanding, the next due ${upcoming[0]!.dueDate}.`
        : "No funder report is currently outstanding.",
      statements: [...statements, ...statementsFromItems(items, "report")],
      items,
      unknowns: detectUnknowns(snapshot).filter((u) => u.reason === "unknown"),
      sources: collectSources(items),
    };
  },
};

export const outcomesOffTrack: QuestionHandler = {
  id: "outcomes_off_track",
  label: "Which outcomes are off track?",
  matches: [["outcome", "outcomes", "indicator", "indicators", "target"], ["off track", "behind", "track", "which", "progress"]],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) =>
        item.id.startsWith("indicator_off_track:") || item.id.startsWith("indicator_stale:"),
    );
    return {
      handler: this.id,
      headline: items.length
        ? `${items.length} indicator${items.length === 1 ? " is" : "s are"} behind target or unmeasured.`
        : snapshot.indicators.length
          ? "No indicator is currently behind its time-elapsed position."
          : "No indicator has been defined.",
      statements: statementsFromItems(items, "off_track"),
      items,
      unknowns: detectUnknowns(snapshot).filter((u) => u.reason === "not_measured"),
      sources: collectSources(items),
    };
  },
};

export const singleFunderDependency: QuestionHandler = {
  id: "single_funder_dependency",
  label: "Where are we dependent on one funder?",
  matches: [
    ["dependent", "dependency", "concentration", "reliant", "one funder", "single funder"],
    [],
  ],
  answer(snapshot, board) {
    const items = board.items.filter(
      (item) => item.id.startsWith("funder_concentration:") || item.category === "finance",
    );
    const composites = board.composites.filter(
      (c) => c.rule === "major_funder_relationship_declining_renewal_approaching",
    );
    return {
      handler: this.id,
      headline: items.length
        ? items[0]!.title
        : snapshot.grants.filter((g) => g.status === "active").length > 1
          ? "No funder currently exceeds a third of active award value."
          : "There is not enough active funding recorded to assess concentration.",
      statements: statementsFromItems([...composites, ...items], "concentration"),
      items: [...composites, ...items],
      unknowns: detectUnknowns(snapshot).filter((u) => u.reason === "cannot_calculate"),
      sources: collectSources(items),
    };
  },
};

export const whatChanged: QuestionHandler = {
  id: "what_changed",
  label: "What changed this quarter?",
  // Deliberately narrow. An earlier version matched on "month" and "quarter",
  // which swallowed "what should I worry about this month?" — a question about
  // the present, routed to a handler about the past. A period word is not a
  // request for a change log; a change word is.
  matches: [["changed", "change", "since last", "happened", "recently", "moved"], []],
  answer(snapshot, _board) {
    const windowDays = 92;
    const within = (date?: string) => {
      if (!date) return false;
      try {
        const d = differenceInCalendarDays(snapshot.now, parseISO(date));
        return d >= 0 && d <= windowDays;
      } catch {
        return false;
      }
    };

    const statements: MissionStatement[] = [];

    const readings = snapshot.measurements.filter((m) => within(m.recordedAt));
    if (readings.length) {
      statements.push({
        id: "changed:measurements",
        kind: "fact",
        text: `${readings.length} indicator measurement${readings.length === 1 ? " was" : "s were"} recorded in the last ${windowDays} days.`,
        sources: readings.map((m) => ref("indicator_measurement", m.id)),
      });
    }

    const newGrants = snapshot.grants.filter((g) => within(g.startDate));
    if (newGrants.length) {
      statements.push({
        id: "changed:grants_started",
        kind: "fact",
        text: `${newGrants.length} grant${newGrants.length === 1 ? "" : "s"} started: ${newGrants.map((g) => g.title).join(", ")}.`,
        sources: newGrants.map((g) => ref("grant", g.id, g.title)),
      });
    }

    const endedGrants = snapshot.grants.filter((g) => within(g.endDate));
    if (endedGrants.length) {
      statements.push({
        id: "changed:grants_ended",
        kind: "fact",
        text: `${endedGrants.length} grant${endedGrants.length === 1 ? "" : "s"} ended: ${endedGrants.map((g) => g.title).join(", ")}.`,
        sources: endedGrants.map((g) => ref("grant", g.id, g.title)),
      });
    }

    const corrections = snapshot.claims.filter((c) => c.supersedes && within(c.audit.createdAt));
    if (corrections.length) {
      statements.push({
        id: "changed:claims_corrected",
        kind: "fact",
        text: `${corrections.length} recorded figure${corrections.length === 1 ? " was" : "s were"} corrected, superseding an earlier value.`,
        sources: corrections.map((c) => ref("claim", c.id)),
      });
    }

    const interactions = snapshot.interactions.filter((i) => within(i.occurredAt));
    if (interactions.length) {
      statements.push({
        id: "changed:interactions",
        kind: "fact",
        text: `${interactions.length} interaction${interactions.length === 1 ? " was" : "s were"} logged with external parties.`,
        sources: interactions.map((i) => ref("interaction", i.id)),
      });
    }

    return {
      handler: this.id,
      headline: statements.length
        ? `${statements.length} kind${statements.length === 1 ? "" : "s"} of change recorded in the last ${windowDays} days.`
        : `Nothing was recorded as changing in the last ${windowDays} days.`,
      statements,
      items: [],
      unknowns: statements.length
        ? []
        : [
            {
              question: "What changed this quarter?",
              reason: "insufficient_data",
              resolvedBy:
                "Change is derived from dated records. Log measurements, interactions and corrections as they happen.",
            },
          ],
      sources: statements.flatMap((s) => s.sources),
    };
  },
};

/**
 * Prepare me for tomorrow's trustee meeting.
 *
 * The one question in the brief's list that is not a query but an occasion. A
 * board wants the financial position, the obligations, the risks, and — the
 * part boards most often are not given — a plain statement of what the
 * organisation does not know.
 */
export const trusteeMeetingPrep: QuestionHandler = {
  id: "trustee_meeting_prep",
  label: "Prepare me for tomorrow's trustee meeting.",
  matches: [["trustee", "board", "meeting", "governance", "prepare"], []],
  answer(snapshot, board) {
    const finance = board.items.filter((i) => i.category === "finance");
    const obligations = board.items.filter((i) => i.kind === "obligation");
    const risks = board.items.filter((i) => i.kind === "risk");
    const governance = board.items.filter((i) => i.category === "governance");
    const items = [...finance, ...risks, ...obligations, ...governance];

    return {
      handler: this.id,
      headline: `${risks.length} risk${risks.length === 1 ? "" : "s"}, ${obligations.length} obligation${obligations.length === 1 ? "" : "s"} and ${finance.length} financial observation${finance.length === 1 ? "" : "s"} to take to the board.`,
      statements: statementsFromItems(items, "board"),
      items,
      // Every unknown, not a sample. A board that is shown three of nine gaps
      // has been given a more comfortable picture than the true one.
      unknowns: detectUnknowns(snapshot),
      sources: collectSources(items),
    };
  },
};

export const QUESTION_HANDLERS: QuestionHandler[] = [
  trusteeMeetingPrep,
  singleFunderDependency,
  financiallyVulnerableProgramme,
  weakestEvidence,
  outcomesOffTrack,
  fundersNeedingAttention,
  grantsMostExposed,
  reportsComing,
  whatChanged,
  topPriorities,
];

/**
 * The order to offer questions in, which is not the order to route them in.
 *
 * `QUESTION_HANDLERS` is ordered by **specificity**, because routing takes the
 * first match and a broad matcher placed early would swallow narrow questions.
 * A reader wants the opposite: the organisation-wide question first, because
 * it is the one most people want and the one the phase is accepted against.
 * Conflating the two orderings would mean either a bad route or a buried
 * headline question, so they are separate lists over the same handlers.
 */
export const SUGGESTED_QUESTION_ORDER: string[] = [
  "top_priorities",
  "financially_vulnerable_programme",
  "single_funder_dependency",
  "reports_coming",
  "weakest_evidence",
  "funders_needing_attention",
  "grants_most_exposed",
  "outcomes_off_track",
  "what_changed",
  "trustee_meeting_prep",
];

export function suggestedQuestionList(): { id: string; label: string }[] {
  const byId = new Map(QUESTION_HANDLERS.map((handler) => [handler.id, handler]));
  return SUGGESTED_QUESTION_ORDER.map((id) => byId.get(id))
    .filter((handler): handler is QuestionHandler => Boolean(handler))
    .map((handler) => ({ id: handler.id, label: handler.label }));
}

/**
 * Route a question to a handler.
 *
 * Ordered rather than scored: the list above runs most specific first, and the
 * first handler whose keyword groups all match wins. `topPriorities` is last
 * and matches broadly, so it is the effective default.
 */
export function routeQuestion(question: string): QuestionHandler {
  const text = question.toLowerCase();
  for (const handler of QUESTION_HANDLERS) {
    const matched = handler.matches.every(
      (group) => group.length === 0 || group.some((term) => text.includes(term)),
    );
    if (matched) return handler;
  }
  return topPriorities;
}

export function answerQuestion(
  question: string,
  snapshot: MissionSnapshot,
  board: AttentionBoard,
): QuestionAnswer {
  const handler = routeQuestion(question);
  const answer = handler.answer(snapshot, board);
  return answer.statements.length || answer.items.length
    ? answer
    : { ...emptyAnswer(handler.id, answer.headline), unknowns: answer.unknowns };
}
