import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCrossDomain,
  buildMissionBrief,
  buildMorningBrief,
  detectAttention,
  detectUnknowns,
  emptySnapshot,
  isComposite,
  type AttentionItem,
} from "@/lib/intelligence";
import {
  QUESTION_HANDLERS,
  answerQuestion,
  routeQuestion,
  suggestedQuestionList,
} from "@/lib/intelligence/questions";
import {
  assembleMissionContext,
  toGroundingItems,
} from "@/server/intelligence/mission-context";
import { askMissionOs, getMissionBrief } from "@/server/intelligence/mission-intelligence";
import { createRequestContext } from "@/server/context/request-context";
import { createTwoTenantHarness, ORG_A, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-4 — Mission Intelligence.
 *
 * The brief's acceptance condition is a single sentence and it is the reason
 * this file is shaped the way it is: *if it simply summarises each module
 * separately, the phase is incomplete*. So the tests that matter most are not
 * the ones asserting that a grant detector finds grants. They are:
 *
 * - the three cross-domain scenarios the brief names, each asserted to fire on
 *   the **seeded demo workspace** rather than on fixtures invented to make
 *   them fire;
 * - the mutation tests, which remove one leg of a combination and require the
 *   combination to disappear — the only way to show a composite is genuinely a
 *   conjunction and not a relabelled single-domain finding;
 * - the refusals, which require that a question the records cannot answer
 *   comes back as a named reason rather than as a blank or a zero.
 */

const ctxFor = (harness: TwoTenantHarness, role: Parameters<typeof createRequestContext>[0]["role"]) =>
  createRequestContext({
    organisationId: ORG_A,
    userId: "user-amara",
    role,
    now: () => new Date("2026-07-21T10:00:00Z"),
  });

async function boardFor(h: TwoTenantHarness) {
  const { snapshot } = await assembleMissionContext(h.ctxA, h.repo);
  return { snapshot, board: applyCrossDomain(snapshot, detectAttention(snapshot)) };
}

describe("deterministic attention", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("finds the overdue deliverable, the due report and the closing opportunity", async () => {
    const { board } = await boardFor(h);
    const ids = board.singleDomain.map((i) => i.id);

    expect(ids).toContain("deliverable_overdue:del-4");
    expect(ids).toContain("grant_report_due:rep-1");
    expect(ids).toContain("opportunity_deadline:opp-digital");
  });

  it("explains every item with signals rather than asserting a priority", async () => {
    const { board } = await boardFor(h);
    expect(board.items.length).toBeGreaterThan(0);
    for (const item of board.items) {
      expect(item.signals.length).toBeGreaterThan(0);
      for (const signal of item.signals) {
        expect(signal.detail.trim()).not.toBe("");
      }
      // The score is arithmetic a reader can repeat, not an opaque rank.
      expect(item.score).toBeGreaterThan(0);
    }
  });

  it("cites Mission Graph records on every item", async () => {
    const { board } = await boardFor(h);
    for (const item of board.items) {
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) {
        expect(source.type).toBeTruthy();
        expect(source.id).toBeTruthy();
      }
    }
  });

  it("orders identically across runs over unchanged data", async () => {
    const first = await boardFor(h);
    const second = await boardFor(h);
    expect(second.board.items.map((i) => i.id)).toEqual(first.board.items.map((i) => i.id));
  });

  it("returns nothing at all for an empty organisation", () => {
    const items = detectAttention(emptySnapshot("org-empty", new Date("2026-07-21")));
    expect(items).toEqual([]);
  });
});

describe("cross-domain reasoning", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /** The brief's first scenario: grant ending + programme dependency + runway. */
  it("surfaces a programme losing its funding when its grant ends", async () => {
    const { board } = await boardFor(h);
    const composite = board.composites.find(
      (c) => c.rule === "grant_ending_programme_dependency_low_runway",
    );

    expect(composite).toBeDefined();
    expect(composite!.title).toMatch(/Digital Bridge loses its funding/);
    expect(composite!.components.map((c) => c.id)).toContain("grant_ending:grant-wyca");
  });

  /** The brief's second scenario: report due + evidence incomplete. */
  it("surfaces a report falling due while its evidence is not ready", async () => {
    const { board } = await boardFor(h);
    const composite = board.composites.find(
      (c) => c.rule === "report_due_evidence_incomplete_indicator_stale",
    );

    expect(composite).toBeDefined();
    expect(composite!.components.map((c) => c.id)).toContain("grant_report_due:rep-2");
    expect(composite!.components.some((c) => c.id.startsWith("outcome_unevidenced:"))).toBe(true);
    expect(composite!.contributingCategories).toEqual(
      expect.arrayContaining(["reports", "evidence"]),
    );
  });

  /** The brief's third scenario: major funder + quiet relationship + renewal. */
  it("surfaces a major funder going quiet with an award ending", async () => {
    const { board } = await boardFor(h);
    const composite = board.composites.find(
      (c) => c.rule === "major_funder_relationship_declining_renewal_approaching",
    );

    expect(composite).toBeDefined();
    expect(composite!.title).toMatch(/major funder, is going quiet, and has an award ending/);
    expect(composite!.components.some((c) => c.id.startsWith("relationship_health:"))).toBe(true);
    expect(composite!.components.some((c) => c.id.startsWith("grant_ending:"))).toBe(true);
  });

  it("outranks its own components, so the connection sorts above the loose ends", async () => {
    const { board } = await boardFor(h);
    for (const composite of board.composites) {
      for (const component of composite.components) {
        expect(composite.score).toBeGreaterThan(component.score);
      }
    }
  });

  it("absorbs components rather than listing them twice", async () => {
    const { board } = await boardFor(h);
    const absorbed = new Set(board.composites.flatMap((c) => c.components.map((i) => i.id)));
    expect(absorbed.size).toBeGreaterThan(0);
    for (const item of board.items) {
      if (isComposite(item)) continue;
      expect(absorbed.has(item.id)).toBe(false);
    }
  });

  /**
   * Mutation test 1 — remove the grant leg.
   *
   * Closing the WYCA grant removes the `grant_ending` finding. Two composites
   * depend on it, and both must disappear. If either survives, it was never a
   * conjunction: it was a single-domain finding wearing a cross-domain title.
   */
  it("loses two composites when the ending grant is closed", async () => {
    const before = await boardFor(h);
    expect(before.board.composites.map((c) => c.rule)).toEqual(
      expect.arrayContaining([
        "grant_ending_programme_dependency_low_runway",
        "major_funder_relationship_declining_renewal_approaching",
      ]),
    );

    const grant = h.state.grants.find((g) => g.id === "grant-wyca")!;
    grant.status = "completed";

    const after = await boardFor(h);
    const rules = after.board.composites.map((c) => c.rule);
    expect(rules).not.toContain("grant_ending_programme_dependency_low_runway");
    expect(rules).not.toContain("major_funder_relationship_declining_renewal_approaching");
  });

  /**
   * Mutation test 2 — remove the evidence leg.
   *
   * Evidencing every Digital Bridge outcome removes the `outcome_unevidenced`
   * findings, and the report-readiness composite must go with them even though
   * the report is still due. A report being due is not, on its own, the
   * cross-domain finding.
   */
  it("loses the report composite once the outcomes behind it are evidenced", async () => {
    const before = await boardFor(h);
    expect(before.board.composites.map((c) => c.rule)).toContain(
      "report_due_evidence_incomplete_indicator_stale",
    );

    for (const outcome of h.state.outcomes.filter((o) => o.programmeId === "prog-digital")) {
      await h.repo.evidence.support(h.ctxA, "ev-case-digital", {
        type: "outcome",
        id: outcome.id,
      });
    }

    const after = await boardFor(h);
    expect(after.board.composites.map((c) => c.rule)).not.toContain(
      "report_due_evidence_incomplete_indicator_stale",
    );
    // The single-domain finding survives: the report is still due.
    expect(after.board.items.map((i) => i.id)).toContain("grant_report_due:rep-2");
  });

  /**
   * Mutation test 3 — remove the requirement edges.
   *
   * `promised_outcome_not_currently_provable` reads what a funder asked for
   * through `requires` relations. Deleting those edges must silence it, which
   * is the assertion that the rule traverses the graph rather than pattern
   * matching on free text.
   */
  it("cannot tell what a funder promised once the requires edges are removed", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxA, h.repo);
    const requiresEdges = snapshot.relations.filter(
      (r) => r.kind === "requires" && r.from.type === "reporting_requirement",
    );
    expect(requiresEdges.length).toBeGreaterThan(0);

    for (const edge of requiresEdges) await h.repo.graph.disconnect(h.ctxA, edge.id);

    const after = await boardFor(h);
    expect(after.board.composites.map((c) => c.rule)).not.toContain(
      "promised_outcome_not_currently_provable",
    );
  });
});

describe("the acceptance test", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("answers what the five most important things are, across domains, with citations", async () => {
    const { answer, brief } = await askMissionOs(
      h.ctxA,
      h.repo,
      "What are the five most important things happening across this organisation?",
    );

    expect(answer.handler).toBe("top_priorities");
    expect(answer.items).toHaveLength(5);

    // Cross-domain, not one summary per module. At least one of the five is a
    // composite, and the five together span more than one category.
    expect(answer.items.some((item) => isComposite(item))).toBe(true);
    expect(new Set(answer.items.map((item) => item.category)).size).toBeGreaterThan(1);

    // Explainable: every one names the records it rests on.
    for (const item of answer.items) {
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.signals.length).toBeGreaterThan(0);
    }

    expect(brief.sources.length).toBeGreaterThan(0);
    expect(brief.headline).not.toBe("");
  });

  it("separates facts, calculations, inferences, assumptions and unknowns", async () => {
    const brief = await getMissionBrief(h.ctxA, h.repo);

    expect(brief.facts.every((s) => s.kind === "fact")).toBe(true);
    expect(brief.calculations.every((s) => s.kind === "calculation")).toBe(true);
    expect(brief.inferences.every((s) => s.kind === "inference")).toBe(true);
    expect(brief.assumptions.every((s) => s.kind === "assumption")).toBe(true);

    // Every calculation shows its arithmetic. A calculation that cannot is an
    // inference, and mislabelling it implies a check nobody can perform.
    for (const calculation of brief.calculations) {
      expect(calculation.workings, calculation.text).toBeTruthy();
    }

    // Inferences come only from named cross-domain rules.
    for (const inference of brief.inferences) {
      expect(inference.workings).toMatch(/^Rule \w+ fired on/);
    }
  });

  it("records what the brief was assembled from, including nothing withheld", async () => {
    const brief = await getMissionBrief(h.ctxA, h.repo);
    expect(brief.contextSnapshot.organisationId).toBe(ORG_A);
    expect(brief.contextSnapshot.recordCount).toBeGreaterThan(0);
    expect(brief.contextSnapshot.scopes.map((s) => s.scope)).toEqual(
      expect.arrayContaining(["grants", "finance", "relationships", "evidence"]),
    );
  });
});

describe("missing information is a value", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("refuses runway rather than reporting zero when there is no ledger", () => {
    const unknowns = detectUnknowns(emptySnapshot("org-empty", new Date("2026-07-21")));
    const runway = unknowns.find((u) => u.question.includes("unrestricted runway"));

    expect(runway?.reason).toBe("cannot_calculate");
    expect(runway?.resolvedBy).toBeTruthy();
  });

  /**
   * `not_applicable` is the reason a zero most often impersonates.
   *
   * An organisation holding a ledger but no unrestricted fund is not an
   * organisation with nought months of runway. The two must not render
   * identically, which is why they are different reasons rather than a
   * missing number.
   */
  it("distinguishes not applicable from cannot calculate", () => {
    const snapshot = emptySnapshot("org-restricted-only", new Date("2026-07-21"));
    snapshot.funds = [
      {
        id: "fund-1",
        organisationId: "org-restricted-only",
        name: "Restricted programme fund",
        restriction: "restricted",
        restrictionPurpose: "Youth work",
        currency: "GBP",
        status: "open",
        audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      },
    ];
    snapshot.transactions = [
      {
        id: "txn-1",
        organisationId: "org-restricted-only",
        date: "2026-02-01",
        description: "Grant instalment",
        amount: { minorUnits: 100_000, currency: "GBP" },
        direction: "income",
        restricted: true,
        fundId: "fund-1",
        source: "manual",
        verificationState: "provided",
      },
    ];

    const runway = detectUnknowns(snapshot).find((u) => u.question.includes("unrestricted runway"));
    expect(runway?.reason).toBe("not_applicable");
    // Nothing resolves it, because nothing is missing.
    expect(runway?.resolvedBy).toBeUndefined();
  });

  it("names the outcomes nothing evidences, on the seeded workspace", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxA, h.repo);
    const gaps = detectUnknowns(snapshot).filter((u) => u.reason === "no_evidence");
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap.subject?.type).toBe("outcome");
      expect(gap.resolvedBy).toBeTruthy();
    }
  });

  it("carries every unknown into a trustee briefing rather than a sample", async () => {
    const { snapshot, board } = await boardFor(h);
    const all = detectUnknowns(snapshot);
    const answer = answerQuestion("Prepare me for tomorrow's trustee meeting.", snapshot, board);
    expect(answer.unknowns).toHaveLength(all.length);
  });
});

describe("the morning brief does not manufacture urgency", () => {
  it("says the day is quiet rather than reaching down the list", () => {
    const snapshot = emptySnapshot("org-empty", new Date("2026-07-21"));
    const board = applyCrossDomain(snapshot, detectAttention(snapshot));
    const morning = buildMorningBrief(snapshot, board);

    expect(morning.quiet).toBe(true);
    expect(morning.needsAttention).toEqual([]);
    expect(morning.opportunities).toEqual([]);
    expect(morning.deadlines).toEqual([]);
  });

  it("caps attention at three and never pads it", async () => {
    const h = createTwoTenantHarness();
    const { snapshot, board } = await boardFor(h);
    const morning = buildMorningBrief(snapshot, board);

    expect(morning.needsAttention.length).toBeLessThanOrEqual(3);
    expect(morning.quiet).toBe(false);
    // Deadlines are sorted by urgency and each one is genuinely within the
    // horizon; nothing is included merely to fill the section.
    for (const deadline of morning.deadlines) {
      expect(deadline.dueInDays).toBeLessThanOrEqual(30);
    }
  });
});

describe("question routing", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("routes each of the brief's questions to its own handler", () => {
    const expectations: [string, string][] = [
      ["What should I worry about this month?", "top_priorities"],
      ["Which funders need attention?", "funders_needing_attention"],
      ["Which grants are most exposed?", "grants_most_exposed"],
      ["Where is our evidence weakest?", "weakest_evidence"],
      ["Which programme is financially vulnerable?", "financially_vulnerable_programme"],
      ["What changed this quarter?", "what_changed"],
      ["What reports are coming?", "reports_coming"],
      ["Which outcomes are off track?", "outcomes_off_track"],
      ["Where are we dependent on one funder?", "single_funder_dependency"],
      ["Prepare me for tomorrow's trustee meeting.", "trustee_meeting_prep"],
    ];

    for (const [question, handler] of expectations) {
      expect(routeQuestion(question).id, question).toBe(handler);
    }
  });

  it("falls back to the organisation-wide answer rather than guessing", () => {
    expect(routeQuestion("zzzz").id).toBe("top_priorities");
  });

  it("gives every handler a suggestible phrasing that routes back to itself", () => {
    for (const handler of QUESTION_HANDLERS) {
      expect(routeQuestion(handler.label).id, handler.label).toBe(handler.id);
    }
  });

  it("answers a financial vulnerability question from a traversal, not a column", async () => {
    const { snapshot, board } = await boardFor(h);
    const answer = answerQuestion("Which programme is financially vulnerable?", snapshot, board);

    expect(answer.handler).toBe("financially_vulnerable_programme");
    expect(answer.headline).toMatch(/Digital Bridge/);
    // The statement naming the funding rests on both the programme and the
    // grants, which is the join no single module holds.
    const funding = answer.statements.find((s) => s.id.startsWith("vulnerable:funding:"));
    expect(funding?.sources.map((r) => r.type)).toEqual(
      expect.arrayContaining(["programme", "grant"]),
    );
  });
});

describe("context assembly is scoped, authorised and tenant-safe", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("assembles only the scopes it was asked for", async () => {
    const { snapshot, contextSnapshot } = await assembleMissionContext(h.ctxA, h.repo, {
      scopes: ["grants"],
    });

    expect(snapshot.grants.length).toBeGreaterThan(0);
    expect(snapshot.relationships).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(contextSnapshot.scopes.map((s) => s.scope)).toEqual(["grants"]);
  });

  it("never reaches another tenant", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxB, h.repo);
    const ids = [
      ...snapshot.grants.map((g) => g.organisationId),
      ...snapshot.programmes.map((p) => p.organisationId),
      ...snapshot.relationships.map((r) => r.organisationId),
      ...snapshot.evidence.map((e) => e.organisationId),
      ...snapshot.funds.map((f) => f.organisationId),
    ];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(["org-beacon"]));
  });

  it("produces a brief for tenant B that names no tenant A record", async () => {
    const brief = await getMissionBrief(h.ctxB, h.repo);
    const text = JSON.stringify(brief);
    expect(text).not.toMatch(/Henderson/);
    expect(text).not.toMatch(/grant-wyca/);
    expect(text).not.toMatch(/Youth Futures/);
  });

  it("narrows a focused context to the record's neighbourhood", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxA, h.repo, {
      focus: { type: "grant", id: "grant-henderson" },
    });

    expect(snapshot.grants.map((g) => g.id)).toEqual(["grant-henderson"]);
    expect(snapshot.programmes.map((p) => p.id)).toEqual(["prog-youth"]);
    expect(snapshot.deliverables.every((d) => d.grantId === "grant-henderson")).toBe(true);
  });
});

describe("AI never receives unrestricted access", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * The default that makes the sensitivity rule survive forgetfulness.
   *
   * The engine reads transaction narratives to compute an unallocated total.
   * The model is shown the total. If this test fails, a payment description
   * naming an individual has reached a prompt.
   */
  it("keeps transaction narratives out of grounding by default", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxA, h.repo);
    expect(snapshot.transactions.length).toBeGreaterThan(0);

    const grounding = toGroundingItems(snapshot);
    expect(grounding.some((item) => item.ref.type === "transaction")).toBe(false);

    const descriptions = snapshot.transactions.map((t) => t.description);
    const text = grounding.map((g) => g.value).join(" ");
    for (const description of descriptions) {
      expect(text).not.toContain(description);
    }
  });

  it("withholds narratives from a role without finance:manage, and says so", async () => {
    const programmeLead = ctxFor(h, "programme_lead");
    const result = await assembleMissionContext(programmeLead, h.repo, {
      includeTransactionNarratives: true,
    });

    expect(result.mayIncludeTransactionNarratives).toBe(false);
    expect(result.withheld.map((w) => w.scope)).toContain("finance:transaction_narratives");
    expect(result.contextSnapshot.withheld.map((w) => w.scope)).toContain(
      "finance:transaction_narratives",
    );
  });

  it("allows them for a role that does hold finance:manage", async () => {
    const financeLead = ctxFor(h, "finance_contributor");
    const result = await assembleMissionContext(financeLead, h.repo, {
      includeTransactionNarratives: true,
    });

    expect(result.mayIncludeTransactionNarratives).toBe(true);
    expect(result.withheld).toEqual([]);
  });

  it("offers a model conclusions with resolvable references, never raw tables", async () => {
    const { snapshot } = await assembleMissionContext(h.ctxA, h.repo);
    const grounding = toGroundingItems(snapshot);

    expect(grounding.length).toBeGreaterThan(0);
    for (const item of grounding) {
      expect(item.ref.type).toBeTruthy();
      expect(item.ref.id).toBeTruthy();
      expect(item.value.trim()).not.toBe("");
    }
  });
});

describe("briefs degrade to structure, never to nothing", () => {
  it("produces a complete brief with AI disabled for the workspace", async () => {
    const h = createTwoTenantHarness();
    await h.repo.organisations.setAiEnabled(h.ctxA, false);

    const brief = await getMissionBrief(h.ctxA, h.repo, { narrate: true });

    // No prose, because no model ran.
    expect(brief.narrative).toBeUndefined();
    expect(brief.model).toBeUndefined();
    // Everything else is present, because none of it needed one.
    expect(brief.facts.length).toBeGreaterThan(0);
    expect(brief.risks.length).toBeGreaterThan(0);
    expect(brief.recommendedActions.length).toBeGreaterThan(0);
  });

  it("narrates without re-ranking or inventing findings when AI is on", async () => {
    const h = createTwoTenantHarness();
    const brief = await getMissionBrief(h.ctxA, h.repo, { narrate: true });

    expect(brief.narrative).toBeTruthy();
    expect(brief.model).toBe("pegasus-mock-1");
    expect(brief.provenance?.used.length).toBeGreaterThan(0);
    // Provenance is observed: every reference the narration reports was one it
    // was offered. `observeGrounding` throws otherwise.
    expect(brief.usedFallback).toBe(false);
  });
});

describe("recommended actions answer findings", () => {
  it("never recommends anything that is not tied to an attention item", async () => {
    const h = createTwoTenantHarness();
    const brief = await getMissionBrief(h.ctxA, h.repo);
    const itemIds = new Set<string>(brief.risks.concat(brief.opportunities).map((i: AttentionItem) => i.id));

    expect(brief.recommendedActions.length).toBeGreaterThan(0);
    for (const action of brief.recommendedActions) {
      expect(action.attentionItemId).toBeTruthy();
      expect(itemIds.has(action.attentionItemId!)).toBe(true);
      expect(action.rationale.trim()).not.toBe("");
    }
  });

  it("marks externally visible actions, so an automation layer inherits the rule", async () => {
    const h = createTwoTenantHarness();
    const brief = await getMissionBrief(h.ctxA, h.repo);
    const external = brief.recommendedActions.filter((a) => a.externallyVisible);
    expect(external.length).toBeGreaterThan(0);
  });
});

describe("the brief carries a headline it can defend", () => {
  it("names the top-ranked item rather than characterising the organisation", async () => {
    const h = createTwoTenantHarness();
    const { snapshot, board } = await boardFor(h);
    const brief = buildMissionBrief({
      snapshot,
      board,
      scope: "organisation",
      contextSnapshot: {
        organisationId: ORG_A,
        assembledAt: "2026-07-21T10:00:00.000Z",
        scopes: [],
        withheld: [],
        recordCount: 0,
      },
    });

    expect(brief.headline).toBe(board.items[0]!.title);
    // No adjective about how the organisation is doing.
    expect(brief.summary).not.toMatch(/strong|healthy|excellent|concerning|poor/i);
  });
});

describe("suggested questions", () => {
  it("offers the acceptance question first, while routing stays specificity-ordered", () => {
    const suggested = suggestedQuestionList();
    expect(suggested[0]!.id).toBe("top_priorities");
    // Routing order is the opposite, and deliberately so: a broad matcher
    // placed early would swallow every narrow question.
    expect(QUESTION_HANDLERS.at(-1)!.id).toBe("top_priorities");
  });

  it("offers every handler exactly once", () => {
    const suggested = suggestedQuestionList();
    expect(suggested).toHaveLength(QUESTION_HANDLERS.length);
    expect(new Set(suggested.map((s) => s.id)).size).toBe(QUESTION_HANDLERS.length);
  });
});
