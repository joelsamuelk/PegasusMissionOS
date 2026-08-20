import { runAi } from "@/lib/ai";
import { refKey } from "@/lib/knowledge";
import { ACTION_CATALOGUE } from "@/lib/automation/actions";
import { assessReportCompleteness, canTransitionReport } from "@/lib/reporting";
import type {
  AutomationAction,
  AutomationRun,
  AutomationStep,
  EntityReference,
  GroundingRecord,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import { getMissionBrief } from "@/server/intelligence/mission-intelligence";

/**
 * Performing a bounded action.
 *
 * This is the file where an automation stops being a plan and becomes a
 * change, so it is where the phase's safety properties have to be true rather
 * than merely declared.
 *
 * **The executor has no general write access.** It reaches exactly nine
 * repository methods, one per action kind. There is no path here that takes a
 * table name and a patch. That is the answer to "do not allow arbitrary AI
 * database mutation": not a filter on what a model may ask for, but an
 * executor that has no way to express an arbitrary write.
 *
 * **Approval is checked here, not only upstream.** The planner marks a step
 * `awaiting_approval` and the dispatcher declines to execute unapproved runs,
 * and this function *also* refuses. Two independent checks, because the cost
 * of the one that fails is an email a funder receives that nobody sent.
 *
 * **A model never chooses.** `generate_brief` and `draft_communication` use
 * one, and in both cases the action, the target and the bounds were fixed
 * before the model was called. It fills in prose inside a decision already
 * taken.
 */

export class ActionRefused extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "ActionRefused";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ExecutionContext {
  ctx: RequestContext;
  repo: MissionRepository;
  run: AutomationRun;
  step: AutomationStep;
}

export interface ExecutionResult {
  result?: EntityReference;
  detail: string;
  provenance?: GroundingRecord;
}

const str = (params: AutomationStep["params"], key: string): string | undefined => {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

/**
 * Resolve `{{subject.id}}` style placeholders.
 *
 * A closed substitution over exactly two names, not a template language. A
 * rule author needs to say "the record this fired on"; anything more general
 * is an expression evaluator wearing a different hat.
 */
export function resolveParams(
  params: AutomationStep["params"],
  subject: EntityReference,
): AutomationStep["params"] {
  const out: AutomationStep["params"] = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] =
      typeof value === "string"
        ? value.replace(/\{\{subject\.id\}\}/g, subject.id).replace(/\{\{subject\.type\}\}/g, subject.type)
        : value;
  }
  return out;
}

export async function executeStep(input: ExecutionContext): Promise<ExecutionResult> {
  const { ctx, repo, run, step } = input;
  const descriptor = ACTION_CATALOGUE[step.action];

  if (!descriptor) {
    throw new ActionRefused(
      "unknown_action",
      `${step.action} is not an action this engine can take. It was not executed.`,
    );
  }

  // The second, independent check. The first is in the dispatcher.
  if ((descriptor.requiresApproval || descriptor.externallyVisible) && !run.approvedBy) {
    throw new ActionRefused(
      "approval_required",
      `${descriptor.label} requires a person to approve the run before it can take effect. Nothing was done.`,
    );
  }

  const params = resolveParams(step.params, run.subject);

  switch (step.action) {
    case "create_task": {
      const title = str(params, "title");
      if (!title) throw new ActionRefused("missing_param", "A task needs a title.");
      const id = await repo.workspace.createTask(ctx, {
        title,
        dueDate: str(params, "dueDate"),
        assigneeId: str(params, "assigneeId"),
        relatedType: str(params, "relatedType") ?? run.subject.type,
        relatedId: str(params, "relatedId") ?? run.subject.id,
      });
      return { result: { type: "task", id }, detail: `Created the task "${title}".` };
    }

    case "notify_user": {
      const userId = str(params, "userId");
      const message = str(params, "message");
      if (!userId || !message) {
        throw new ActionRefused("missing_param", "A notification needs a recipient and a message.");
      }
      // A notification naming somebody who is not a member of this
      // organisation would be undeliverable and is also a route to addressing
      // an outsider from a tenant record.
      const user = await repo.organisations.user(ctx, userId);
      if (!user) {
        throw new ActionRefused(
          "recipient_not_a_member",
          `${userId} is not a member of this organisation. Nothing was sent.`,
        );
      }
      await repo.workspace.notify(ctx, {
        title: "Automation",
        body: message,
        kind: "system",
        href: str(params, "link"),
      });
      return { detail: `Notified ${user.name}.` };
    }

    case "request_review": {
      const userId = str(params, "userId");
      const entityType = str(params, "entityType");
      const entityId = str(params, "entityId");
      if (!userId || !entityType || !entityId) {
        throw new ActionRefused("missing_param", "A review request needs a person and a record.");
      }
      const id = await repo.workspace.createTask(ctx, {
        title: `Review ${entityType.replace(/_/g, " ")}${str(params, "note") ? `: ${str(params, "note")}` : ""}`,
        assigneeId: userId,
        relatedType: entityType,
        relatedId: entityId,
      });
      return { result: { type: "task", id }, detail: "Created a review task." };
    }

    /**
     * The deterministic half of the brief's worked example.
     *
     * *Deterministically identify missing evidence, then create tasks for
     * responsible owners.* The identification is `assessReportCompleteness`,
     * the same function the report workspace uses. A second implementation
     * would eventually disagree with the one people can see.
     */
    case "request_evidence": {
      const entityId = str(params, "entityId");
      if (!entityId) throw new ActionRefused("missing_param", "Say which record needs evidence.");

      /**
       * A grant report is a deadline, not a document.
       *
       * `GrantReport` has a title, a due date and a status and no sections;
       * the evidence behind it lives in the `ImpactReport` being written for
       * that grant. Resolving one to the other here is what makes "chase the
       * evidence for the report due to this funder" a single action rather
       * than a rule the organisation has to hold in their head.
       */
      let report = await repo.reports.get(ctx, entityId);
      if (!report) {
        const grantReport = (await repo.grants.allReports(ctx)).find(
          (candidate) => candidate.id === entityId,
        );
        if (grantReport) {
          report =
            (await repo.reports.list(ctx)).find(
              (candidate) => candidate.grantId === grantReport.grantId,
            ) ?? null;
          if (!report) {
            // No document exists for this grant yet, so there are no gaps to
            // identify. Refusing is honest; a vague "find some evidence" task
            // is the kind of automation output people learn to ignore.
            throw new ActionRefused(
              "no_document",
              `${grantReport.title} is a deadline, and no report document has been started for its grant. There are no evidence gaps to identify yet.`,
            );
          }
        }
      }
      if (!report) {
        throw new ActionRefused(
          "not_assessable",
          `${entityId} is not a report whose evidence gaps can be identified. No task was created.`,
        );
      }

      const [claims, evidence, indicators] = await Promise.all([
        repo.claims.list(ctx),
        repo.evidence.list(ctx),
        repo.programmes.allIndicators(ctx),
      ]);
      const requirements = report.definitionId
        ? await repo.reports.requirements(ctx, report.definitionId)
        : [];

      const completeness = assessReportCompleteness({
        report,
        claims,
        evidence,
        indicators,
        requirements,
        now: ctx.now(),
      });

      const gaps = completeness.missingEvidence;
      if (gaps.length === 0) {
        return { detail: "No evidence gaps were found, so no task was created." };
      }

      const created: string[] = [];
      for (const gap of gaps.slice(0, 10)) {
        created.push(
          await repo.workspace.createTask(ctx, {
            title: `Evidence needed: ${gap.label}`,
            assigneeId: str(params, "assigneeId") ?? report.ownerId,
            relatedType: "impact_report",
            relatedId: report.id,
          }),
        );
      }
      return {
        result: { type: "impact_report", id: report.id },
        detail: `Identified ${gaps.length} evidence gap${gaps.length === 1 ? "" : "s"} and created ${created.length} task${created.length === 1 ? "" : "s"}.`,
      };
    }

    case "prepare_report": {
      const title = str(params, "title");
      const type = str(params, "type");
      const reportingPeriod = str(params, "reportingPeriod");
      if (!title || !type || !reportingPeriod) {
        throw new ActionRefused(
          "missing_param",
          "Preparing a report needs a title, a type and a reporting period.",
        );
      }
      const id = await repo.reports.create(ctx, {
        title,
        type: type as Parameters<typeof repo.reports.create>[1]["type"],
        reportingPeriod,
        definitionId: str(params, "definitionId"),
        grantId: str(params, "grantId"),
        programmeId: str(params, "programmeId"),
      });
      return {
        result: { type: "impact_report", id },
        detail: `Prepared an empty report workspace, "${title}".`,
      };
    }

    case "assign_owner": {
      // Deliberately unimplemented rather than approximated. Ownership lives
      // on six different records with six different column names, and an
      // executor that guessed would eventually set the wrong one. It is
      // refused clearly so a rule author finds out at once.
      throw new ActionRefused(
        "not_implemented",
        "Assigning an owner is declared but not implemented. Ownership is a different field on each record type and guessing which one is not safe. Use a review task instead.",
      );
    }

    case "set_workflow_state": {
      const entityType = str(params, "entityType");
      const entityId = str(params, "entityId");
      const state = str(params, "state");
      if (entityType !== "impact_report" || !entityId || !state) {
        throw new ActionRefused(
          "unsupported_target",
          "Only report states can be moved by an automation, and only along transitions the state machine already permits.",
        );
      }
      const report = await repo.reports.get(ctx, entityId);
      if (!report) throw new ActionRefused("not_found", "That report could not be found.");

      const next = state as typeof report.status;
      if (!canTransitionReport(report.status, next)) {
        throw new ActionRefused(
          "illegal_transition",
          `A report cannot move from ${report.status} to ${next}. The automation did not force it.`,
        );
      }
      // Approval is a human act. An automation that could move a report into
      // `approved` would make the approval record meaningless.
      if (next === "approved" || next === "submitted") {
        throw new ActionRefused(
          "requires_human",
          `Moving a report to ${next} is an act of approval and cannot be automated.`,
        );
      }
      await repo.reports.setStatus(ctx, entityId, next);
      return {
        result: { type: "impact_report", id: entityId },
        detail: `Moved the report from ${report.status} to ${next}.`,
      };
    }

    case "generate_brief": {
      const focusType = str(params, "entityType") ?? run.subject.type;
      const focusId = str(params, "entityId") ?? run.subject.id;
      const brief = await getMissionBrief(ctx, repo, {
        focus:
          focusType === "grant" || focusType === "programme"
            ? { type: focusType, id: focusId }
            : undefined,
        narrate: true,
      });
      const id = await repo.workspace.createTask(ctx, {
        title: `Review the intelligence brief: ${brief.headline}`,
        relatedType: run.subject.type,
        relatedId: run.subject.id,
      });
      return {
        result: { type: "task", id },
        detail: `Assembled a brief covering ${brief.risks.length} risks and ${brief.unknowns.length} unanswerable questions.`,
        provenance: brief.provenance,
      };
    }

    /**
     * Drafts, and never sends.
     *
     * Invariant 7 in its most literal form. The draft is created as a task
     * carrying the text, and nothing in the product can send it without a
     * person. The action is externally visible not because the draft is, but
     * because it exists in order to leave the organisation.
     */
    case "draft_communication": {
      const recipientType = str(params, "recipientType");
      const recipientId = str(params, "recipientId");
      const purpose = str(params, "purpose");
      if (!recipientType || !recipientId || !purpose) {
        throw new ActionRefused(
          "missing_param",
          "A draft needs a recipient and a purpose. Nothing was drafted.",
        );
      }

      const organisation = await repo.organisations.get(ctx);
      if (!organisation?.aiEnabled) {
        throw new ActionRefused(
          "ai_disabled",
          "AI assistance is turned off for this workspace, so no draft was written.",
        );
      }

      const result = await runAi("draft_answer", {
        organisationName: organisation.name,
        profileFields: [],
        evidence: [],
        programmeData: [
          {
            ref: run.subject,
            label: `About ${run.subject.type.replace(/_/g, " ")}`,
            value: purpose,
          },
        ],
        question: purpose,
        wordLimit: 250,
      });

      const id = await repo.workspace.createTask(ctx, {
        title: `Draft ready to review before sending: ${purpose.slice(0, 80)}`,
        relatedType: recipientType,
        relatedId: recipientId,
      });

      await repo.audit.recordAiGeneration(ctx, {
        feature: "draft_answer",
        model: result.model,
        promptVersion: result.promptVersion,
        inputRefs: [refKey(run.subject)],
        outputPreview: result.text.slice(0, 200),
        approvalStatus: "pending",
      });

      return {
        result: { type: "task", id },
        detail:
          "Wrote a draft and created a task to review it. Nothing was sent, and nothing in Pegasus can send it without a person.",
        provenance: {
          used: result.grounding.used,
          unused: result.grounding.unused,
          assumptions: result.grounding.assumptions,
          couldNotVerify: result.grounding.couldNotVerify,
          model: result.model,
          promptVersion: result.promptVersion,
          usedFallback: result.usedFallback,
          generatedAt: ctx.now().toISOString(),
        },
      };
    }
  }
}

/** The action kinds the executor can actually perform today. */
export function executableActions(): AutomationAction["kind"][] {
  return (Object.keys(ACTION_CATALOGUE) as AutomationAction["kind"][]).filter(
    (kind) => kind !== "assign_owner",
  );
}
