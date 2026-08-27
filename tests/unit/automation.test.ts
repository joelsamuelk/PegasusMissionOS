import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTION_CATALOGUE,
  describeSimulation,
  evaluateCondition,
  explainTrace,
  fieldsUsed,
  isExternallyVisible,
  matchesTrigger,
  planRun,
  requiresApproval,
  simulateAutomation,
  validateAction,
  validateActions,
  type AutomationCondition,
} from "@/lib/automation";
import { emit, approveAndRun } from "@/server/automation/dispatcher";
import { runDueJobs, scanDates, tick } from "@/server/automation/scheduler";
import { simulateAgainstOrganisation } from "@/server/automation/simulation-service";
import { grantReportFactsWithEvidence } from "@/server/automation/facts-service";
import { executeStep, ActionRefused, resolveParams } from "@/server/automation/executor";
import type { Automation, DomainEvent } from "@/types/domain";
import { createTwoTenantHarness, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-6 — Mission Automations.
 *
 * The acceptance test is a sentence about what must not be built: *the
 * organisation should be able to automate routine mission operations without
 * creating opaque autonomous agents*. Everything below tests some consequence
 * of that, and the tests that matter most are the ones asserting a refusal:
 *
 * - a condition that cannot be decided does not fire, and says why;
 * - an externally visible action cannot execute without a person, checked
 *   twice, independently;
 * - a simulation reports what it could not answer rather than reporting zero;
 * - an automation cannot force a state transition the state machine forbids,
 *   and cannot approve anything at all.
 */

const NOW = new Date("2026-07-21T10:00:00Z");

const facts = (bag: Record<string, string | number | boolean | null>) => bag;

describe("conditions are three-valued", () => {
  const evaluate = (condition: AutomationCondition, bag: Record<string, unknown>) =>
    evaluateCondition(condition, { facts: bag as never, now: NOW });

  it("decides a recorded field", () => {
    const condition: AutomationCondition = {
      type: "field",
      field: "grant.health",
      operator: "eq",
      value: "at_risk",
    };
    expect(evaluate(condition, { "grant.health": "at_risk" }).result).toBe("true");
    expect(evaluate(condition, { "grant.health": "on_track" }).result).toBe("false");
  });

  /**
   * The case that decides the whole design.
   *
   * Two-valued logic must answer true or false here, and both are lies: one
   * fires an automation on data nobody has, the other never fires while the
   * organisation believes it is covered.
   */
  it("returns unknown for a field nobody has recorded, not false", () => {
    const result = evaluate(
      { type: "field", field: "report.evidenceCompleteness", operator: "lt", value: 0.7 },
      {},
    );
    expect(result.result).toBe("unknown");
    expect(result.trace.reason).toMatch(/not recorded/);
    expect(explainTrace(result.trace)).toMatch(/Could not be decided/);
  });

  it("refuses to order-compare across types rather than answering false", () => {
    const result = evaluate(
      { type: "field", field: "grant.status", operator: "gt", value: 5 },
      { "grant.status": "active" },
    );
    expect(result.result).toBe("unknown");
  });

  it("says a rule did not match when one leg is definitely false, even beside an unknown", () => {
    const result = evaluate(
      {
        type: "all",
        conditions: [
          { type: "field", field: "grant.status", operator: "eq", value: "closed" },
          { type: "field", field: "grant.missing", operator: "eq", value: 1 },
        ],
      },
      { "grant.status": "active" },
    );
    // A rule requiring three things does not fire if one is definitely absent,
    // whatever is unknown about the others.
    expect(result.result).toBe("false");
  });

  it("is unknown where the answer would actually turn on the unknown value", () => {
    const result = evaluate(
      {
        type: "all",
        conditions: [
          { type: "field", field: "grant.status", operator: "eq", value: "active" },
          { type: "field", field: "grant.missing", operator: "eq", value: 1 },
        ],
      },
      { "grant.status": "active" },
    );
    expect(result.result).toBe("unknown");
  });

  it("answers presence definitely, because absence is always knowable", () => {
    expect(
      evaluate({ type: "presence", field: "grant.endDate", operator: "not_exists" }, {}).result,
    ).toBe("true");
    expect(
      evaluate(
        { type: "presence", field: "grant.endDate", operator: "exists" },
        { "grant.endDate": "2026-09-30" },
      ).result,
    ).toBe("true");
  });

  it("computes daysUntil from the injected clock", () => {
    const condition: AutomationCondition = {
      type: "days_until",
      field: "report.dueDate",
      operator: "lte",
      days: 30,
    };
    expect(evaluate(condition, { "report.dueDate": "2026-08-01" }).result).toBe("true");
    expect(evaluate(condition, { "report.dueDate": "2026-12-01" }).result).toBe("false");
    expect(evaluate(condition, { "report.dueDate": "not a date" }).result).toBe("unknown");
  });

  it("compares two fields on the same record", () => {
    const condition: AutomationCondition = {
      type: "compare",
      left: "programme.progress",
      operator: "lt",
      right: "programme.expectedProgress",
    };
    expect(
      evaluate(condition, { "programme.progress": 40, "programme.expectedProgress": 70 }).result,
    ).toBe("true");
    expect(evaluate(condition, { "programme.progress": 40 }).result).toBe("unknown");
  });

  /**
   * Without this, a simulation over current records — which has no "before" —
   * would compare `undefined !== "at_risk"` and report that every change rule
   * fires on everything.
   */
  it("cannot establish change without a recorded previous value", () => {
    const condition: AutomationCondition = {
      type: "changed",
      field: "grant.health",
      to: "at_risk",
    };
    expect(evaluate(condition, { "grant.health": "at_risk" }).result).toBe("unknown");
    expect(
      evaluate(condition, { "grant.health": "at_risk", "previous.grant.health": "attention" })
        .result,
    ).toBe("true");
    expect(
      evaluate(condition, { "grant.health": "at_risk", "previous.grant.health": "at_risk" })
        .result,
    ).toBe("false");
  });

  it("enumerates the fields a rule reads, so a rule can be checked against a schema", () => {
    expect(
      fieldsUsed({
        type: "all",
        conditions: [
          { type: "days_until", field: "report.dueDate", operator: "lte", days: 30 },
          { type: "changed", field: "grant.health" },
        ],
      }),
    ).toEqual(["report.dueDate", "grant.health", "previous.grant.health"]);
  });
});

describe("the action catalogue is the safety boundary", () => {
  it("declares external visibility on every action", () => {
    for (const descriptor of Object.values(ACTION_CATALOGUE)) {
      expect(typeof descriptor.externallyVisible).toBe("boolean");
      expect(typeof descriptor.requiresApproval).toBe("boolean");
      expect(typeof descriptor.usesModel).toBe("boolean");
    }
  });

  /**
   * Invariant 7. Anything a third party can see requires a person,
   * unconditionally.
   */
  it("requires approval for every externally visible action", () => {
    for (const descriptor of Object.values(ACTION_CATALOGUE)) {
      if (!descriptor.externallyVisible) continue;
      expect(descriptor.requiresApproval, descriptor.kind).toBe(true);
    }
  });

  it("forces approval on a rule containing an external action", () => {
    expect(
      requiresApproval([
        { kind: "create_task", params: { title: "x" } },
        { kind: "draft_communication", params: {} },
      ]),
    ).toBe(true);
    expect(isExternallyVisible([{ kind: "create_task", params: { title: "x" } }])).toBe(false);
  });

  it("fails safe on an action it does not recognise", () => {
    // An unrecognised action requiring nothing would be a route to adding a
    // capability that bypasses approval.
    expect(requiresApproval([{ kind: "invent_something" as never, params: {} }])).toBe(true);
  });

  it("rejects a mistyped parameter rather than silently ignoring it", () => {
    const result = validateAction({
      kind: "create_task",
      params: { title: "Chase evidence", assignee: "user-priya" },
    });
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/does not take assignee/);
  });

  it("refuses an automation with no actions", () => {
    expect(validateActions([]).valid).toBe(false);
  });
});

describe("the engine plans and does not act", () => {
  const event = (overrides: Partial<DomainEvent> = {}): DomainEvent => ({
    id: "evt-1",
    organisationId: "org-northstar",
    kind: "report.due_soon",
    subject: { type: "grant_report", id: "rep-1" },
    occurredAt: NOW.toISOString(),
    facts: facts({ "report.dueDate": "2026-08-01", "report.evidenceCompleteness": 0.4 }),
    ...overrides,
  });

  const automation = (overrides: Partial<Automation> = {}): Automation =>
    ({
      id: "auto-1",
      organisationId: "org-northstar",
      name: "Test",
      trigger: { kind: "report.due_soon" },
      condition: {
        type: "all",
        conditions: [
          { type: "days_until", field: "report.dueDate", operator: "lte", days: 30 },
          { type: "field", field: "report.evidenceCompleteness", operator: "lt", value: 0.7 },
        ],
      },
      actions: [{ kind: "create_task", params: { title: "Chase evidence" } }],
      status: "active",
      requiresApproval: false,
      audit: { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      ...overrides,
    }) as Automation;

  it("matches only its own trigger and entity type", () => {
    expect(matchesTrigger(automation(), event()).matched).toBe(true);
    expect(
      matchesTrigger(automation(), event({ kind: "indicator.updated" })).matched,
    ).toBe(false);
    expect(
      matchesTrigger(
        automation({ trigger: { kind: "report.due_soon", entityType: "impact_report" } }),
        event(),
      ).matched,
    ).toBe(false);
  });

  it("plans steps when the condition holds", () => {
    const plan = planRun({ automation: automation(), event: event(), now: NOW });
    expect(plan.outcome).toBe("matched");
    expect(plan.steps).toHaveLength(1);
    expect(plan.needsApproval).toBe(false);
  });

  it("records undecidable separately from not matched", () => {
    const undecidable = planRun({
      automation: automation(),
      event: event({ facts: facts({ "report.dueDate": "2026-08-01" }) }),
      now: NOW,
    });
    expect(undecidable.outcome).toBe("undecidable");
    expect(undecidable.explanation).toMatch(/Could not be decided/);

    const notMatched = planRun({
      automation: automation(),
      event: event({
        facts: facts({ "report.dueDate": "2027-08-01", "report.evidenceCompleteness": 0.4 }),
      }),
      now: NOW,
    });
    expect(notMatched.outcome).toBe("not_matched");
  });

  it("holds a run whose actions are externally visible", () => {
    const plan = planRun({
      automation: automation({
        actions: [
          {
            kind: "draft_communication",
            params: { recipientType: "funder", recipientId: "f1", purpose: "x" },
          },
        ],
        requiresApproval: false,
      }),
      event: event(),
      now: NOW,
    });
    // The stored flag says no approval. The computed answer wins.
    expect(plan.outcome).toBe("awaiting_approval");
    expect(plan.needsApproval).toBe(true);
  });

  it("does not run a draft or paused automation", () => {
    expect(planRun({ automation: automation({ status: "draft" }), event: event(), now: NOW }).outcome).toBe(
      "skipped",
    );
  });

  it("fails at plan time rather than half-executing a misconfigured rule", () => {
    const plan = planRun({
      automation: automation({ actions: [{ kind: "create_task", params: {} }] }),
      event: event(),
      now: NOW,
    });
    expect(plan.outcome).toBe("failed");
    expect(plan.steps).toEqual([]);
  });
});

describe("simulation says what it could not answer", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("reports the count the brief singles out", async () => {
    const automation = (await h.repo.automation.get(h.ctxA, "auto-grant-at-risk"))!;
    const simulation = await simulateAgainstOrganisation(h.ctxA, h.repo, automation);
    const lines = describeSimulation(simulation);

    expect(lines.join(" ")).toMatch(/Would send \d+ external communication/);
  });

  /**
   * A simulation over current records has no "before". Reporting zero would
   * read as *this rule is safe* while meaning *this question was not asked*.
   */
  it("caveats a change trigger rather than reporting that it would never fire", async () => {
    const automation = (await h.repo.automation.get(h.ctxA, "auto-grant-at-risk"))!;
    const simulation = await simulateAgainstOrganisation(h.ctxA, h.repo, automation);

    expect(simulation.wouldTrigger).toBe(0);
    expect(simulation.undecidable).toBeGreaterThan(0);
    expect(simulation.caveats.join(" ")).toMatch(/no previous value|has no previous value/i);
  });

  it("tests a draft automation as though it were on", async () => {
    const automation = (await h.repo.automation.get(h.ctxA, "auto-grant-at-risk"))!;
    expect(automation.status).toBe("draft");
    const simulation = await simulateAgainstOrganisation(h.ctxA, h.repo, automation);
    // A simulation reporting "skipped, it is a draft" would answer a question
    // nobody asked.
    expect(simulation.candidates).toBeGreaterThan(0);
  });

  it("counts what a rule would do across the organisation", () => {
    const automation: Automation = {
      id: "auto-x",
      organisationId: "org-a",
      name: "Task everything",
      trigger: { kind: "record.changed" },
      actions: [{ kind: "create_task", params: { title: "Look at this" } }],
      status: "active",
      requiresApproval: false,
      audit: { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    };
    const events: DomainEvent[] = [1, 2, 3].map((n) => ({
      id: `e${n}`,
      organisationId: "org-a",
      kind: "record.changed",
      subject: { type: "programme", id: `p${n}` },
      occurredAt: NOW.toISOString(),
      facts: {},
    }));

    const outcome = simulateAutomation({ automation, events, now: NOW });
    expect(outcome.wouldTrigger).toBe(3);
    expect(outcome.actionCounts.create_task).toBe(3);
    expect(outcome.externalCommunications).toBe(0);
    expect(describeSimulation(outcome)[0]).toMatch(/Would trigger on 3 records/);
  });
});

describe("dispatch records what happened, including nothing", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("records a run even when the automation did not match", async () => {
    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      facts: { "report.dueDate": "2030-01-01", "report.evidenceCompleteness": 0.9 },
    });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]!.outcome).toBe("not_matched");
    // "Why did nothing happen?" is the more common question.
    expect(result.runs[0]!.explanation).toMatch(/Did not match/);
  });

  it("executes a matching run and creates the task", async () => {
    const before = await h.repo.workspace.tasks(h.ctxA);

    await h.repo.automation.save(h.ctxA, {
      id: "auto-simple",
      name: "Task on a due report",
      trigger: { kind: "report.due_soon" },
      condition: { type: "days_until", field: "report.dueDate", operator: "lte", days: 30 },
      actions: [{ kind: "create_task", params: { title: "Start the report" } }],
      status: "active",
      requiresApproval: false,
    });

    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      facts: { "report.dueDate": "2026-08-01" },
    });

    const run = result.runs.find((r) => r.automationId === "auto-simple");
    expect(run?.outcome).toBe("completed");

    const after = await h.repo.workspace.tasks(h.ctxA);
    expect(after.length).toBe(before.length + 1);
    expect(after.some((task) => task.title === "Start the report")).toBe(true);
  });

  it("marks the event processed", async () => {
    await emit(h.ctxA, h.repo, {
      kind: "indicator.updated",
      subject: { type: "indicator", id: "ind-eet" },
      facts: {},
    });
    const events = await h.repo.automation.events(h.ctxA);
    expect(events.every((event) => event.processedAt)).toBe(true);
  });

  it("keeps one failing automation from stopping the others", async () => {
    await h.repo.automation.save(h.ctxA, {
      id: "auto-broken",
      name: "Points at a report that cannot be assessed",
      trigger: { kind: "report.due_soon" },
      actions: [
        { kind: "request_evidence", params: { entityType: "grant_report", entityId: "nope" } },
        { kind: "create_task", params: { title: "Still created" } },
      ],
      status: "active",
      requiresApproval: false,
    });

    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      facts: { "report.dueDate": "2026-08-01" },
    });

    const run = result.runs.find((r) => r.automationId === "auto-broken")!;
    expect(run.outcome).toBe("failed");

    const failures = await h.repo.automation.failures(h.ctxA, run.id);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.code).toBe("not_assessable");

    // The independent second action still ran.
    const tasks = await h.repo.workspace.tasks(h.ctxA);
    expect(tasks.some((task) => task.title === "Still created")).toBe(true);
  });
});

describe("nothing external happens without a person", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("holds the run and creates nothing until it is approved", async () => {
    await h.repo.automation.setStatus(h.ctxA, "auto-grant-at-risk", "active");
    const before = await h.repo.workspace.tasks(h.ctxA);

    const result = await emit(h.ctxA, h.repo, {
      kind: "grant.health_changed",
      subject: { type: "grant", id: "grant-wyca" },
      facts: { "grant.health": "at_risk", "grant.funderId": "fnd-wyca" },
      previous: { "grant.health": "attention" },
    });

    const run = result.runs.find((r) => r.automationId === "auto-grant-at-risk")!;
    expect(run.outcome).toBe("awaiting_approval");
    expect(await h.repo.workspace.tasks(h.ctxA)).toHaveLength(before.length);

    const approved = await approveAndRun(h.ctxA, h.repo, run.id);
    expect(approved?.approvedBy).toBe(h.ctxA.userId);
    expect(approved?.outcome).toBe("completed");
    expect((await h.repo.workspace.tasks(h.ctxA)).length).toBe(before.length + 1);
  });

  /**
   * The second, independent check. The dispatcher already declines to execute
   * an unapproved run; the executor refuses too, because the cost of the one
   * that fails is an email a funder receives that nobody sent.
   */
  it("refuses at the executor even if the dispatcher were bypassed", async () => {
    const run = {
      id: "run-x",
      organisationId: "org-northstar",
      automationId: "auto-grant-at-risk",
      trigger: "grant.health_changed" as const,
      subject: { type: "grant" as const, id: "grant-wyca" },
      outcome: "matched" as const,
      explanation: "",
      startedAt: NOW.toISOString(),
      simulated: false,
      // Deliberately not approved.
    };

    await expect(
      executeStep({
        ctx: h.ctxA,
        repo: h.repo,
        run,
        step: {
          id: "s1",
          organisationId: "org-northstar",
          runId: "run-x",
          order: 0,
          action: "draft_communication",
          params: { recipientType: "funder", recipientId: "f1", purpose: "x" },
          status: "planned",
        },
      }),
    ).rejects.toThrow(/requires a person to approve/);
  });

  it("cannot approve a run that is not waiting", async () => {
    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      facts: { "report.dueDate": "2030-01-01" },
    });
    expect(await approveAndRun(h.ctxA, h.repo, result.runs[0]!.id)).toBeNull();
  });
});

describe("an automation cannot exceed its bounds", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const step = (action: string, params: Record<string, string>) => ({
    id: "s1",
    organisationId: "org-northstar",
    runId: "run-1",
    order: 0,
    action: action as never,
    params,
    status: "planned" as const,
  });

  const run = {
    id: "run-1",
    organisationId: "org-northstar",
    automationId: "auto-1",
    trigger: "record.changed" as const,
    subject: { type: "impact_report" as const, id: "report-youth-2026" },
    outcome: "matched" as const,
    explanation: "",
    startedAt: NOW.toISOString(),
    simulated: false,
    approvedBy: "user-amara",
  };

  it("cannot approve or submit a report", async () => {
    for (const state of ["approved", "submitted"]) {
      await expect(
        executeStep({
          ctx: h.ctxA,
          repo: h.repo,
          run,
          step: step("set_workflow_state", {
            entityType: "impact_report",
            entityId: "report-youth-2026",
            state,
          }),
        }),
      ).rejects.toThrow(/act of approval|cannot move/);
    }
  });

  it("cannot force a transition the state machine forbids", async () => {
    await expect(
      executeStep({
        ctx: h.ctxA,
        repo: h.repo,
        run,
        step: step("set_workflow_state", {
          entityType: "impact_report",
          entityId: "report-youth-2026",
          state: "internal_review",
        }),
      }),
    ).rejects.toThrow(/cannot move from draft to internal_review/);
  });

  it("cannot notify somebody who is not a member of the organisation", async () => {
    await expect(
      executeStep({
        ctx: h.ctxA,
        repo: h.repo,
        run,
        step: step("notify_user", { userId: "user-beacon-lead", message: "hello" }),
      }),
    ).rejects.toThrow(/not a member/);
  });

  it("refuses assign_owner rather than guessing which field ownership is", async () => {
    await expect(
      executeStep({
        ctx: h.ctxA,
        repo: h.repo,
        run,
        step: step("assign_owner", {
          entityType: "grant",
          entityId: "grant-henderson",
          userId: "user-amara",
        }),
      }),
    ).rejects.toThrow(ActionRefused);
  });

  it("substitutes only the two placeholders it defines", () => {
    expect(
      resolveParams(
        { a: "{{subject.id}}", b: "{{subject.type}}", c: "{{anything.else}}" },
        { type: "grant", id: "grant-henderson" },
      ),
    ).toEqual({ a: "grant-henderson", b: "grant", c: "{{anything.else}}" });
  });
});

describe("the scheduler closes the last link of the acceptance chain", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * §9 link 12: *the relationship owner is reminded 30 days before reporting*.
   * The data has existed since MG-1. This is the first time anything reminds.
   */
  it("reminds thirty days before a funder report is due", async () => {
    // The seeded requirement falls due 38 days out, which is correctly outside
    // a 30-day horizon. Move it inside so the test exercises the mechanism
    // rather than the seed's calendar.
    const requirement = h.state.reportingRequirements.find(
      (candidate) => candidate.id === "req-henderson-interim",
    )!;
    requirement.dueDate = "2026-08-10";

    const scan = await scanDates(h.ctxA, h.repo);
    expect(scan.scheduled.length).toBeGreaterThan(0);

    const before = await h.repo.workspace.tasks(h.ctxA);
    const result = await runDueJobs(h.ctxA, h.repo);
    expect(result.ran).toBeGreaterThan(0);
    expect(result.failed).toBe(0);

    const after = await h.repo.workspace.tasks(h.ctxA);
    expect(after.length).toBeGreaterThan(before.length);
    expect(
      after.some((task) => task.title.includes("Prepare the funder report due in 30 days")),
    ).toBe(true);
  });

  /**
   * Idempotence is what makes an in-process scheduler safe to run from a
   * request, a cron entry, or both.
   */
  it("does not schedule the same reminder twice", async () => {
    const first = await scanDates(h.ctxA, h.repo);
    const second = await scanDates(h.ctxA, h.repo);

    expect(first.scheduled.length).toBeGreaterThan(0);
    expect(second.scheduled).toHaveLength(0);
    expect(second.alreadyScheduled).toBe(first.scheduled.length);
  });

  it("schedules only for horizons an automation actually asked for", async () => {
    await h.repo.automation.setStatus(h.ctxA, "auto-reporting-reminder", "paused");
    const scan = await scanDates(h.ctxA, h.repo);
    // No active date.approaching automation means no horizons, so nothing is
    // scheduled. A scanner with hard-coded horizons would fill the job table
    // with reminders nobody asked for.
    expect(scan.scheduled).toHaveLength(0);
    expect(scan.scanned).toBe(0);
  });

  it("cancels a reminder whose obligation has been met", async () => {
    await scanDates(h.ctxA, h.repo);
    for (const requirement of h.state.reportingRequirements) requirement.status = "met";
    for (const report of h.state.grantReports) report.status = "submitted";
    for (const grant of h.state.grants) grant.status = "completed";

    const result = await runDueJobs(h.ctxA, h.repo);
    expect(result.events).toHaveLength(0);

    const jobs = h.state.scheduledJobs.filter((job) => job.organisationId === "org-northstar");
    expect(jobs.every((job) => job.status === "cancelled")).toBe(true);
  });

  it("keeps one tenant's reminders out of another's", async () => {
    await tick(h.ctxA, h.repo);
    const jobs = await h.repo.automation.dueJobs(h.ctxB, new Date("2030-01-01"));
    expect(jobs).toEqual([]);
    expect(await h.repo.automation.runs(h.ctxB)).toEqual([]);
    expect(await h.repo.automation.list(h.ctxB)).toEqual([]);
  });
});

describe("the brief's worked example", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * *WHEN report due within 30 days AND evidence completeness below 70% THEN
   * deterministically identify missing evidence, generate an evidence-gap
   * brief, and create tasks for responsible owners.*
   */
  it("identifies the gaps deterministically and creates a task for each", async () => {
    const facts = await grantReportFactsWithEvidence(h.ctxA, h.repo, "rep-1");
    expect(facts["report.evidenceCompleteness"]).toBeTypeOf("number");
    expect(facts["report.dueDate"]).toBe("2026-08-01");

    const before = await h.repo.workspace.tasks(h.ctxA);
    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      facts: facts as Record<string, string | number | boolean | null>,
    });

    const run = result.runs.find((r) => r.automationId === "auto-evidence-gap")!;
    expect(run.outcome).toBe("completed");

    const steps = await h.repo.automation.steps(h.ctxA, run.id);
    expect(steps.map((step) => step.action)).toEqual(["request_evidence", "generate_brief"]);
    expect(steps.every((step) => step.status === "executed")).toBe(true);

    // The step resolved the deadline to the document being written for its
    // grant, and named each gap. No funder template is linked to the seeded
    // report, so the gaps are its own undrafted sections rather than the
    // funder's questions. Both are legitimate and which one appears depends on
    // whether a template has been ingested; the funder-question path is
    // proven in the MG-5 acceptance test.
    const after = await h.repo.workspace.tasks(h.ctxA);
    const chased = after.filter((task) => task.title.startsWith("Evidence needed:"));
    expect(chased.length).toBeGreaterThan(0);
    expect(chased.some((task) => task.title.includes("Executive summary"))).toBe(true);
    expect(chased.every((task) => task.relatedId === "report-youth-2026")).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("does not fire on a report whose evidence completeness is unknown", async () => {
    const result = await emit(h.ctxA, h.repo, {
      kind: "report.due_soon",
      subject: { type: "grant_report", id: "rep-1" },
      // Due soon, but nobody has assessed the evidence.
      facts: { "report.dueDate": "2026-08-01" },
    });

    const run = result.runs.find((r) => r.automationId === "auto-evidence-gap")!;
    expect(run.outcome).toBe("undecidable");
    expect(run.explanation).toMatch(/report\.evidenceCompleteness is not recorded/);
  });
});

describe("SC5: one question, one answer, across two edge tables", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * `RelationshipLink` predates `Relation` and still has its own table, so
   * "what connects to this entity?" has had to union two sources — and every
   * caller that forgot has been quietly answering half the question.
   */
  it("returns edges from both tables for one entity", async () => {
    const connections = await h.repo.graph.connectionsFor(h.ctxA, {
      type: "programme",
      id: "prog-youth",
    });

    expect(connections.some((relation) => relation.kind === "pursues")).toBe(true);
    expect(connections.some((relation) => relation.kind === "party_to")).toBe(true);
  });

  it("marks projected legacy edges so they cannot be passed back as relations", async () => {
    const connections = await h.repo.graph.connectionsFor(h.ctxA, {
      type: "programme",
      id: "prog-youth",
    });
    const projected = connections.filter((relation) => relation.kind === "party_to");

    expect(projected.length).toBeGreaterThan(0);
    // Passing one of these to `disconnect` would silently do nothing, so the
    // id says plainly that it is not a row in `relations`.
    for (const relation of projected) expect(relation.id.startsWith("link:")).toBe(true);
  });

  /**
   * The two-tenant fixture deliberately plants a `RelationshipLink` owned by
   * tenant B that points at tenant A's programme. `Relation` verifies both
   * endpoints on write; the legacy table predates that rule and never did, so
   * a correctly-scoped row can name an id that resolves in another tenant.
   *
   * Reading it back unfiltered would let a traversal follow the pointer. The
   * projection refuses to present an edge whose other end the caller cannot
   * see, in either direction.
   */
  it("does not present an edge whose other end is in another tenant", async () => {
    expect(
      await h.repo.graph.connectionsFor(h.ctxB, { type: "programme", id: "prog-youth" }),
    ).toEqual([]);
  });

  it("does not show one tenant the other's edges into a shared id", async () => {
    const forA = await h.repo.graph.connectionsFor(h.ctxA, {
      type: "programme",
      id: "prog-youth",
    });
    expect(forA.every((relation) => relation.organisationId === "org-northstar")).toBe(true);
    expect(forA.some((relation) => relation.id === "link:rl-beacon-1")).toBe(false);
  });
});
