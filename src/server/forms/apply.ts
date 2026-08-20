import {
  aggregateAnswers,
  describeAggregate,
  describeProjection,
  projectSubmission,
  type AggregateResult,
} from "@/lib/forms";
import { renderClaimValue } from "@/lib/knowledge";
import type {
  ClaimValue,
  EntityReference,
  FormMapping,
  ProjectedChange,
  SubmissionAnswer,
  SubmissionProjection,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";

/**
 * A submission becoming records.
 *
 * *Submission → candidate update → review where required → Mission Graph.*
 * This file is the last two arrows, and the order matters: `buildProjection`
 * proposes and `applyProjection` acts, and nothing calls the second without a
 * person having seen the first.
 *
 * The acceptance test for the phase runs through here: a programme survey
 * response becomes an interaction, an indicator measurement and a piece of
 * evidence, without anybody re-entering it.
 */

export interface FullProjection extends SubmissionProjection {
  /** Cross-submission measurements, which a single response cannot produce. */
  aggregates: (AggregateResult & { mapping: FormMapping; target?: EntityReference })[];
  summary: string;
}

/**
 * Propose what a submission would change.
 *
 * Indicator mappings are resolved separately and across every accepted
 * submission, because one response is not a measurement. See
 * `lib/forms/aggregate.ts`.
 */
export async function buildProjection(
  ctx: RequestContext,
  repo: MissionRepository,
  submissionId: string,
): Promise<FullProjection | null> {
  const submission = await repo.forms.getSubmission(ctx, submissionId);
  if (!submission) return null;

  const form = await repo.forms.get(ctx, submission.formId);
  if (!form) return null;

  const [answers, mappings] = await Promise.all([
    repo.forms.answers(ctx, submissionId),
    repo.forms.mappings(ctx, submission.formId),
  ]);

  // Existing values, so an overwrite is visible before it happens rather than
  // discovered afterwards.
  const existing: Record<string, string> = {};
  for (const mapping of mappings) {
    if (mapping.target !== "indicator_measurement" || !mapping.targetRef) continue;
    const indicator = await repo.programmes.getIndicator(ctx, mapping.targetRef.id);
    if (!indicator) continue;
    existing[`indicator_measurement:${mapping.predicate ?? mapping.fieldKey}`] = String(
      indicator.currentValue,
    );
  }

  const perSubmission = projectSubmission({
    form,
    submission,
    answers,
    mappings: mappings.filter((mapping) => mapping.target !== "indicator_measurement"),
    existing,
  });

  // Indicator measurements, over every accepted submission plus this one.
  const accepted = (await repo.forms.submissions(ctx, form.id)).filter(
    (candidate) => candidate.status === "accepted" || candidate.id === submissionId,
  );
  const acceptedAnswers = (
    await Promise.all(accepted.map((candidate) => repo.forms.answers(ctx, candidate.id)))
  ).flat();

  const aggregates = mappings
    .filter((mapping) => mapping.target === "indicator_measurement")
    .map((mapping) => ({
      ...aggregateAnswers({
        mapping,
        answers: acceptedAnswers.filter((answer) => answer.fieldKey === mapping.fieldKey),
      }),
      mapping,
      target: mapping.targetRef,
    }));

  // Aggregates that cannot be computed are surfaced as withheld rather than
  // omitted: a reviewer who sees two measurements where they expected three
  // should be told why the third is absent.
  const withheld = [...perSubmission.withheld];
  for (const aggregate of aggregates) {
    if (aggregate.value !== null) continue;
    withheld.push({
      fieldKey: aggregate.fieldKey,
      reason: aggregate.cannotCalculate ?? "This cannot be measured from the responses received.",
    });
  }

  const projection: SubmissionProjection = { ...perSubmission, withheld };
  return {
    ...projection,
    aggregates,
    summary: describeProjection(projection),
  };
}

export interface ApplyResult {
  ok: boolean;
  applied: { summary: string; ref?: EntityReference }[];
  skipped: { summary: string; reason: string }[];
  message?: string;
}

/**
 * Apply the changes a reviewer accepted.
 *
 * Takes explicit mapping ids rather than "apply everything". A reviewer who
 * approved four of six changes must get four, and an API that could only apply
 * all or none would push them into approving the two they did not want.
 */
export async function applyProjection(
  ctx: RequestContext,
  repo: MissionRepository,
  submissionId: string,
  acceptedMappingIds: string[],
): Promise<ApplyResult> {
  const projection = await buildProjection(ctx, repo, submissionId);
  if (!projection) return { ok: false, applied: [], skipped: [], message: "No such submission." };

  const submission = await repo.forms.getSubmission(ctx, submissionId);
  const form = submission ? await repo.forms.get(ctx, submission.formId) : null;
  if (!submission || !form) {
    return { ok: false, applied: [], skipped: [], message: "No such submission." };
  }

  const accepted = new Set(acceptedMappingIds);
  const answers = await repo.forms.answers(ctx, submissionId);
  const applied: ApplyResult["applied"] = [];
  const skipped: ApplyResult["skipped"] = [];

  const answerFor = (fieldKey: string): SubmissionAnswer | undefined =>
    answers.find((answer) => answer.fieldKey === fieldKey);

  // --- Per-submission changes -------------------------------------------

  for (const change of projection.changes) {
    if (!accepted.has(change.mappingId)) {
      skipped.push({ summary: change.summary, reason: "Not accepted by the reviewer." });
      continue;
    }
    if (change.blockedReason) {
      skipped.push({ summary: change.summary, reason: change.blockedReason });
      continue;
    }

    const result = await applyChange(ctx, repo, {
      change,
      submissionId,
      formName: form.name,
      subject: form.subject,
      answer: answerFor(change.fieldKey),
    });
    if (result.ok) applied.push({ summary: result.summary, ref: result.ref });
    else skipped.push({ summary: change.summary, reason: result.reason });
  }

  // --- Aggregated measurements ------------------------------------------

  for (const aggregate of projection.aggregates) {
    if (!accepted.has(aggregate.mapping.id)) {
      skipped.push({
        summary: `Measure ${aggregate.target?.label ?? aggregate.fieldKey}`,
        reason: "Not accepted by the reviewer.",
      });
      continue;
    }
    if (aggregate.value === null || !aggregate.target) {
      skipped.push({
        summary: `Measure ${aggregate.target?.label ?? aggregate.fieldKey}`,
        reason:
          aggregate.cannotCalculate ??
          "This mapping does not name an indicator, so there is nothing to measure.",
      });
      continue;
    }

    await repo.programmes.updateIndicator(
      ctx,
      aggregate.target.id,
      aggregate.value,
      // The workings travel with the reading. A measurement whose denominator
      // is not recorded cannot be defended in a report six months later.
      `From ${form.name}: ${describeAggregate(aggregate)}`,
    );
    applied.push({
      summary: `Recorded ${aggregate.value}${aggregate.method === "percentage_true" ? "%" : ""} against ${aggregate.target.label ?? aggregate.target.id}, from ${aggregate.responses} responses.`,
      ref: aggregate.target,
    });
  }

  if (applied.length > 0) {
    await repo.forms.reviewSubmission(ctx, submissionId, "accepted");
  }

  return { ok: true, applied, skipped };
}

interface ApplyChangeInput {
  change: ProjectedChange;
  submissionId: string;
  formName: string;
  subject?: EntityReference;
  answer?: SubmissionAnswer;
}

type ChangeOutcome =
  | { ok: true; summary: string; ref?: EntityReference }
  | { ok: false; reason: string };

async function applyChange(
  ctx: RequestContext,
  repo: MissionRepository,
  input: ApplyChangeInput,
): Promise<ChangeOutcome> {
  const { change, formName, subject } = input;
  const rendered = renderClaimValue(change.value);

  switch (change.target) {
    /**
     * A free-text account becomes evidence, linked to what it is about.
     *
     * Added as `provided`, never `verified`. Somebody wrote it in a form;
     * nobody has corroborated it, and `assertProducerMayAssign` exists
     * elsewhere to stop exactly this promotion happening by convenience.
     */
    case "evidence": {
      if (!rendered.trim()) return { ok: false, reason: "The answer is empty." };
      const evidenceId = await repo.evidence.add(ctx, {
        title: `${formName}: ${change.fieldKey.replace(/_/g, " ")}`,
        type: "testimonial",
        description: rendered,
        tags: ["form-submission", formName.toLowerCase().replace(/\s+/g, "-")],
        verification: "provided",
      });
      if (subject) await repo.evidence.support(ctx, evidenceId, subject);
      return {
        ok: true,
        summary: `Added evidence "${rendered.slice(0, 60)}"${subject ? ` against ${subject.label ?? subject.type}` : ""}.`,
        ref: { type: "evidence", id: evidenceId },
      };
    }

    case "interaction": {
      const target = change.targetRef ?? subject;
      const interactionId = await repo.relationships.logInteraction(ctx, {
        type: "other",
        direction: "inbound",
        occurredAt: ctx.now().toISOString(),
        subject: `${formName} response`,
        summary: `Response recorded: ${rendered}.`,
        personIds: [],
        externalOrganisationIds: [],
        participantUserIds: [],
        links: target ? [target] : [],
        source: "imported",
      });
      return {
        ok: true,
        summary: `Logged a survey response against ${target?.label ?? "the programme"}.`,
        ref: { type: "interaction", id: interactionId },
      };
    }

    case "person": {
      if (change.predicate !== "email") {
        return {
          ok: false,
          reason:
            "Only an email address can create or attach a person from a form. Other personal fields are held on the submission rather than written onto a person record.",
        };
      }
      const { person, created } = await repo.relationships.upsertPersonByEmail(ctx, {
        email: rendered,
      });
      return {
        ok: true,
        summary: created
          ? `Created a person record for ${rendered}.`
          : `Attached the response to the existing record for ${rendered}.`,
        ref: { type: "person", id: person.id },
      };
    }

    case "claim": {
      const claim = await repo.claims.create(ctx, {
        subject: change.targetRef ?? subject ?? { type: "organisation", id: ctx.organisationId },
        predicate: change.predicate ?? change.fieldKey,
        value: change.value,
        text: rendered,
        // A form answer is somebody's account of something. It is a fact about
        // what they said, and its verification is `provided` because nobody
        // has corroborated what they said.
        kind: "fact",
        verification: "provided",
        producedBy: { method: "human", actorId: ctx.userId },
        sources: [
          {
            ref: { type: "document", id: input.submissionId },
            authority: "supporting",
            locator: change.fieldKey,
            retrievedAt: ctx.now().toISOString(),
          },
        ],
        derivedFrom: [],
        supportedBy: [],
        assumptions: [],
        caveats: [`Self-reported through ${formName}; not independently verified.`],
      });
      return { ok: true, summary: `Recorded a claim: ${rendered}.`, ref: { type: "claim", id: claim.id } };
    }

    case "consent":
      // Recorded at submission time, verbatim from the version answered.
      // Re-applying it here would create a second record of the same act.
      return { ok: true, summary: "Consent was recorded when the form was submitted." };

    case "external_organisation":
    case "relationship":
      return {
        ok: false,
        reason:
          "Creating an organisation or a relationship from a form is declared but not implemented. Both need matching against existing records, which is a decision rather than a projection.",
      };

    case "indicator_measurement":
      return {
        ok: false,
        reason:
          "Indicator measurements are aggregated across responses rather than applied one at a time.",
      };
  }
}

/** Claim values, for the value type a form field produced. */
export type FormClaimValue = ClaimValue;
