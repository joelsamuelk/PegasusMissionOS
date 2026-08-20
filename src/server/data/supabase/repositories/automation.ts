import type {
  Automation,
  AutomationAction,
  AutomationFailure,
  AutomationRun,
  AutomationStep,
  AutomationTrigger,
  DomainEvent,
  EntityReference,
  GroundingRecord,
  ScheduledJob,
} from "@/types/domain";
import type { AutomationRepository } from "../../types";
import { auditFrom, numberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

type Facts = Record<string, string | number | boolean | null>;

function mapAutomation(row: Row): Automation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    trigger: row.trigger as AutomationTrigger,
    // Deterministic and three-valued. Stored as jsonb because it is a tree,
    // and reading it is the engine's job, not the database's.
    ...(row.condition ? { condition: row.condition } : {}),
    actions: (row.actions ?? []) as AutomationAction[],
    status: row.status as Automation["status"],
    // Records the author's intent. The engine independently refuses to run an
    // externally visible action unapproved, so a mistake here cannot send
    // anything.
    requiresApproval: Boolean(row.requires_approval),
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(row.last_run_at ? { lastRunAt: String(row.last_run_at) } : {}),
    audit: auditFrom(row),
  };
}

function mapEvent(row: Row): DomainEvent {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    kind: row.kind as DomainEvent["kind"],
    subject: { type: row.subject_type as EntityReference["type"], id: String(row.subject_id) },
    occurredAt: String(row.occurred_at),
    // Flat and typed so a condition can read `grant.health` without the engine
    // walking an arbitrary object.
    facts: (row.facts ?? {}) as Facts,
    ...(row.previous ? { previous: row.previous as Facts } : {}),
    ...(row.actor_id ? { actorId: String(row.actor_id) } : {}),
    ...(row.processed_at ? { processedAt: String(row.processed_at) } : {}),
  };
}

function mapRun(row: Row): AutomationRun {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    automationId: String(row.automation_id),
    ...(row.event_id ? { eventId: String(row.event_id) } : {}),
    trigger: row.trigger as AutomationRun["trigger"],
    subject: { type: row.subject_type as EntityReference["type"], id: String(row.subject_id) },
    outcome: row.outcome as AutomationRun["outcome"],
    // Stored so a run can be audited without re-deriving it, which would read
    // today's data rather than the data the run saw.
    ...(row.condition_trace ? { conditionTrace: row.condition_trace } : {}),
    explanation: String(row.explanation),
    startedAt: String(row.started_at),
    ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: String(row.approved_at) } : {}),
    simulated: Boolean(row.simulated),
  };
}

function mapStep(row: Row): AutomationStep {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    runId: String(row.run_id),
    order: numberFrom(row.order),
    action: row.action as AutomationStep["action"],
    params: (row.params ?? {}) as Facts,
    status: row.status as AutomationStep["status"],
    ...(row.result_type && row.result_id
      ? { result: { type: row.result_type as EntityReference["type"], id: String(row.result_id) } }
      : {}),
    ...(row.detail ? { detail: String(row.detail) } : {}),
    ...(row.provenance ? { provenance: row.provenance as GroundingRecord } : {}),
    ...(row.executed_at ? { executedAt: String(row.executed_at) } : {}),
  };
}

function mapFailure(row: Row): AutomationFailure {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    runId: String(row.run_id),
    ...(row.step_id ? { stepId: String(row.step_id) } : {}),
    code: String(row.code),
    message: String(row.message),
    occurredAt: String(row.occurred_at),
    // A permission refusal cannot succeed on retry; a timeout can.
    retryable: Boolean(row.retryable),
  };
}

function mapJob(row: Row): ScheduledJob {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    kind: row.kind as ScheduledJob["kind"],
    ...(row.subject_type && row.subject_id
      ? {
          subject: {
            type: row.subject_type as EntityReference["type"],
            id: String(row.subject_id),
          },
        }
      : {}),
    runAfter: String(row.run_after),
    status: row.status as ScheduledJob["status"],
    payload: (row.payload ?? {}) as Facts,
    attempts: numberFrom(row.attempts),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
    dedupeKey: String(row.dedupe_key),
    createdAt: String(row.created_at),
    ...(row.started_at ? { startedAt: String(row.started_at) } : {}),
    ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
  };
}

export function createAutomationRepository(q: Query, deps: Deps): AutomationRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "automations", {}, { liveOnly: true });
      return rows.map(mapAutomation);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "automations", { id });
      return row ? mapAutomation(row) : null;
    },

    async activeFor(ctx, kind) {
      // The trigger is jsonb, so the kind filter happens after the read.
      // Automations are few and the alternative is a jsonb operator that
      // behaves differently from the in-memory adapter's plain comparison.
      const rows = await q.many(ctx, "automations", { status: "active" }, { liveOnly: true });
      return rows
        .map(mapAutomation)
        .filter((automation) => automation.trigger.kind === kind);
    },

    async save(ctx, input) {
      const columns = {
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        condition: input.condition,
        actions: input.actions,
        status: input.status,
        requiresApproval: input.requiresApproval,
        ownerId: input.ownerId,
        lastRunAt: input.lastRunAt,
      };
      if (input.id) {
        const existing = await q.maybeOne(ctx, "automations", { id: input.id });
        if (existing) {
          await q.update(ctx, "automations", input.id, columns);
          return input.id;
        }
      }
      const row = await q.insert(ctx, "automations", {
        ...(input.id ? { id: input.id } : {}),
        ...columns,
      });
      return String(row.id);
    },

    async setStatus(ctx, id, status) {
      await q.update(ctx, "automations", id, { status });
    },

    async recordEvent(ctx, event) {
      const row = await q.insert(
        ctx,
        "domain_events",
        {
          kind: event.kind,
          subjectType: event.subject.type,
          subjectId: event.subject.id,
          occurredAt: event.occurredAt,
          facts: event.facts,
          previous: event.previous,
          actorId: event.actorId ?? ctx.userId,
        },
        { audit: false },
      );
      return mapEvent(row);
    },

    async events(ctx, options) {
      const rows = await q.many(ctx, "domain_events", {}, {
        order: { column: "occurred_at", ascending: false },
      });
      const events = rows.map(mapEvent);
      return options?.unprocessedOnly ? events.filter((e) => !e.processedAt) : events;
    },

    async markEventProcessed(ctx, eventId) {
      await q.update(
        ctx,
        "domain_events",
        eventId,
        { processedAt: ctx.now().toISOString() },
        { audit: false },
      );
    },

    async runs(ctx, options) {
      const rows = await q.many(
        ctx,
        "automation_runs",
        options?.automationId ? { automation_id: options.automationId } : {},
        { order: { column: "started_at", ascending: false } },
      );
      return rows.map(mapRun);
    },

    async getRun(ctx, runId) {
      const row = await q.maybeOne(ctx, "automation_runs", { id: runId });
      return row ? mapRun(row) : null;
    },

    async steps(ctx, runId) {
      const rows = await q.many(ctx, "automation_steps", { run_id: runId }, {
        order: { column: "order" },
      });
      return rows.map(mapStep);
    },

    async failures(ctx, runId) {
      const rows = await q.many(ctx, "automation_failures", { run_id: runId }, {
        order: { column: "occurred_at" },
      });
      return rows.map(mapFailure);
    },

    async recordRun(ctx, run, steps) {
      // A run is recorded whether or not it matched. An engine that only
      // writes rows when something fired cannot answer "why didn't this run?",
      // which is the question people actually ask.
      await q.insert(
        ctx,
        "automation_runs",
        {
          id: run.id,
          automationId: run.automationId,
          eventId: run.eventId,
          trigger: run.trigger,
          subjectType: run.subject.type,
          subjectId: run.subject.id,
          outcome: run.outcome,
          conditionTrace: run.conditionTrace,
          explanation: run.explanation,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          approvedBy: run.approvedBy,
          approvedAt: run.approvedAt,
          simulated: run.simulated,
        },
        { audit: false },
      );
      for (const step of steps) {
        await q.insert(
          ctx,
          "automation_steps",
          {
            id: step.id,
            runId: run.id,
            order: step.order,
            action: step.action,
            params: step.params,
            status: step.status,
            resultType: step.result?.type,
            resultId: step.result?.id,
            detail: step.detail,
            provenance: step.provenance,
            executedAt: step.executedAt,
          },
          { audit: false },
        );
      }
    },

    async updateStep(ctx, stepId, patch) {
      await q.update(
        ctx,
        "automation_steps",
        stepId,
        {
          status: patch.status,
          resultType: patch.result?.type,
          resultId: patch.result?.id,
          detail: patch.detail,
          executedAt: patch.executedAt,
          provenance: patch.provenance,
        },
        { audit: false },
      );
    },

    async completeRun(ctx, runId, outcome, finishedAt) {
      await q.update(ctx, "automation_runs", runId, { outcome, finishedAt }, { audit: false });
    },

    async approveRun(ctx, runId) {
      const row = await q.maybeOne(ctx, "automation_runs", { id: runId });
      // Approving a run that is not waiting is not a no-op: it would mean a
      // completed run could be "approved" retrospectively, which makes the
      // approval record meaningless.
      if (!row || row.outcome !== "awaiting_approval") return null;
      const updated = await q.update(
        ctx,
        "automation_runs",
        runId,
        { approvedBy: ctx.userId, approvedAt: ctx.now().toISOString() },
        { audit: false },
      );
      if (!updated) return null;
      const run = mapRun(updated);
      await deps.audit.record(ctx, {
        action: "automation.run.approved",
        entityType: "task",
        entityId: runId,
        summary: `Approved an automation run against ${run.subject.type} ${run.subject.id}`,
      });
      return run;
    },

    async recordFailure(ctx, failure) {
      await q.insert(
        ctx,
        "automation_failures",
        {
          runId: failure.runId,
          stepId: failure.stepId,
          code: failure.code,
          message: failure.message,
          occurredAt: failure.occurredAt,
          retryable: failure.retryable,
        },
        { audit: false },
      );
    },

    async scheduleJob(ctx, job) {
      // Deduplicated on write. A scanner that runs twice must not produce two
      // reminders, and nowhere downstream can undo a duplicate reliably.
      const existing = await q.maybeOne(ctx, "scheduled_jobs", { dedupe_key: job.dedupeKey });
      if (existing) return null;

      const row = await q.insert(
        ctx,
        "scheduled_jobs",
        {
          kind: job.kind,
          subjectType: job.subject?.type,
          subjectId: job.subject?.id,
          runAfter: job.runAfter,
          status: "pending",
          payload: job.payload,
          attempts: 0,
          dedupeKey: job.dedupeKey,
          createdAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
      return mapJob(row);
    },

    async dueJobs(ctx, now) {
      const { data, error } = await q
        .select(ctx, "scheduled_jobs")
        .eq("status", "pending")
        .lte("run_after", now.toISOString())
        .order("run_after", { ascending: true });
      if (error) throw new Error(`Could not read scheduled_jobs: ${error.message}`);
      return ((data ?? []) as unknown as Row[]).map(mapJob);
    },

    async completeJob(ctx, jobId, status, error) {
      const row = await q.maybeOne(ctx, "scheduled_jobs", { id: jobId });
      if (!row) return;
      await q.update(
        ctx,
        "scheduled_jobs",
        jobId,
        {
          status,
          lastError: error,
          // Attempts count tries, not successes, so it increments whichever
          // way the job ended.
          attempts: numberFrom(row.attempts) + 1,
          finishedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
    },
  };
}
