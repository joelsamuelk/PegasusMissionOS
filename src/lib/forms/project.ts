import { renderClaimValue } from "@/lib/knowledge";
import type {
  ClaimValue,
  Form,
  FormMapping,
  FormSubmission,
  MappingTargetKind,
  ProjectedChange,
  SubmissionAnswer,
  SubmissionProjection,
} from "@/types/domain";
import { SENSITIVITY_ORDER, mayReachModel } from "./sensitivity";

/**
 * A submission becoming graph records.
 *
 * This is the file the phase is judged on. `MISSION_OS_EXPANSION_PLAN.md`
 * states the test: *a submission is not a form record. It is evidence, a claim
 * about a cohort, an indicator measurement and a relationship interaction. If
 * a submission does not become a claim, the phase has built a form builder.*
 *
 * Three rules govern everything below.
 *
 * **Nothing is applied here.** A projection is a set of candidates with their
 * provenance attached. *Submission → candidate update → review where required
 * → Mission Graph.* Applying is a separate, authorised act, in the server
 * layer, by somebody who saw the candidates.
 *
 * **Nothing overwrites silently.** Where a change would replace an existing
 * value, `existingValue` is populated and `requiresReview` is forced true. A
 * form answer is an assertion by whoever filled it in; an assertion is not the
 * same as a correction, and treating the two alike is how a survey response
 * quietly rewrites a verified figure.
 *
 * **Sensitivity is honoured before mapping, not after.** A `special_category`
 * answer is withheld from projection entirely, with the reason recorded. It
 * cannot become a `Person` field, a claim or an interaction summary, because
 * every one of those is a place it would later be read by something that does
 * not know where it came from.
 */

/**
 * Which targets an answer may be projected into, by sensitivity.
 *
 * `personal` answers may become a `person` record or a `consent` record and
 * nothing else: those are the two places personal data is *supposed* to live,
 * and both carry their own controls. Making a claim out of a personal answer
 * would put a name into the knowledge layer, which is read by report
 * generation and by AI grounding.
 */
const ALLOWED_TARGETS: Record<MappingTargetKind, "public" | "internal" | "personal"> = {
  person: "personal",
  consent: "personal",
  external_organisation: "internal",
  relationship: "internal",
  interaction: "internal",
  indicator_measurement: "internal",
  evidence: "internal",
  claim: "internal",
};

function describe(target: MappingTargetKind, value: ClaimValue, predicate?: string): string {
  const rendered = renderClaimValue(value);
  switch (target) {
    case "person":
      return `Set ${predicate ?? "a field"} on the person record to "${rendered}".`;
    case "external_organisation":
      return `Set ${predicate ?? "a field"} on the organisation record to "${rendered}".`;
    case "relationship":
      return `Record "${rendered}" against the relationship.`;
    case "interaction":
      return `Log an interaction: "${rendered}".`;
    case "indicator_measurement":
      return `Record a measurement of ${rendered} against ${predicate ?? "the indicator"}.`;
    case "evidence":
      return `Add "${rendered}" to the evidence library.`;
    case "claim":
      return `Assert ${predicate ?? "a value"} is "${rendered}".`;
    case "consent":
      return `Record consent: "${rendered}".`;
  }
}

export interface ProjectionInput {
  form: Form;
  submission: FormSubmission;
  answers: SubmissionAnswer[];
  mappings: FormMapping[];
  /** Current values, keyed `target:predicate`, so an overwrite is detectable. */
  existing?: Record<string, string>;
}

export function projectSubmission(input: ProjectionInput): SubmissionProjection {
  const { submission, answers, mappings } = input;
  const existing = input.existing ?? {};

  const byField = new Map(mappings.map((mapping) => [mapping.fieldKey, mapping]));
  const changes: ProjectedChange[] = [];
  const unmapped: { fieldKey: string; label: string }[] = [];
  const withheld: { fieldKey: string; reason: string }[] = [];

  for (const answer of answers) {
    if (answer.redacted) {
      withheld.push({
        fieldKey: answer.fieldKey,
        reason: "This answer has been erased under the form's retention policy.",
      });
      continue;
    }

    const mapping = byField.get(answer.fieldKey);
    if (!mapping) {
      // Reported rather than dropped. An answer nobody mapped is a gap in the
      // form's design, and silently discarding it means the gap is never
      // noticed and the respondent's time was wasted.
      unmapped.push({ fieldKey: answer.fieldKey, label: answer.fieldLabel });
      continue;
    }

    const ceiling = ALLOWED_TARGETS[mapping.target];
    if (SENSITIVITY_ORDER[answer.sensitivity] > SENSITIVITY_ORDER[ceiling]) {
      withheld.push({
        fieldKey: answer.fieldKey,
        reason:
          answer.sensitivity === "special_category"
            ? `"${answer.fieldLabel}" is special category data. It stays in the submission and is not projected into the graph, where it would be read by reporting and by AI grounding.`
            : `"${answer.fieldLabel}" is personal data and cannot become ${mapping.target.replace(/_/g, " ")}.`,
      });
      continue;
    }

    const key = `${mapping.target}:${mapping.predicate ?? mapping.fieldKey}`;
    const currentValue = existing[key];
    const overwrites = currentValue !== undefined && currentValue !== renderClaimValue(answer.value);

    changes.push({
      mappingId: mapping.id,
      fieldKey: answer.fieldKey,
      target: mapping.target,
      targetRef: mapping.targetRef,
      predicate: mapping.predicate,
      value: answer.value,
      summary: describe(mapping.target, answer.value, mapping.predicate),
      // Forced, not merged. A mapping marked as not needing review still needs
      // one when it would replace something a person already recorded.
      requiresReview: mapping.requiresReview || overwrites,
      existingValue: overwrites ? currentValue : undefined,
    });
  }

  return { submissionId: submission.id, changes, unmapped, withheld };
}

/**
 * Whether a projection can be applied without a person.
 *
 * True only when every change says so. A projection where nine of ten changes
 * are safe is a projection that needs review, because applying the nine and
 * holding the tenth would leave the graph in a state nobody chose.
 */
export function canApplyUnattended(projection: SubmissionProjection): boolean {
  return (
    projection.changes.length > 0 &&
    projection.changes.every((change) => !change.requiresReview && !change.blockedReason)
  );
}

/**
 * A one-line summary for a reviewer.
 *
 * Leads with what will change, then what will not. The withheld count is never
 * omitted when non-zero: a reviewer approving eight changes should know that
 * three answers were deliberately not among them.
 */
export function describeProjection(projection: SubmissionProjection): string {
  const parts = [
    `${projection.changes.length} change${projection.changes.length === 1 ? "" : "s"} proposed.`,
  ];
  const needsReview = projection.changes.filter((change) => change.requiresReview).length;
  if (needsReview > 0) {
    parts.push(`${needsReview} need${needsReview === 1 ? "s" : ""} review before applying.`);
  }
  const overwrites = projection.changes.filter((change) => change.existingValue).length;
  if (overwrites > 0) {
    parts.push(
      `${overwrites} would replace a value that is already recorded, and will not be applied without a decision.`,
    );
  }
  if (projection.withheld.length > 0) {
    parts.push(
      `${projection.withheld.length} answer${projection.withheld.length === 1 ? " was" : "s were"} deliberately not projected.`,
    );
  }
  if (projection.unmapped.length > 0) {
    parts.push(
      `${projection.unmapped.length} answer${projection.unmapped.length === 1 ? " has" : "s have"} no mapping and go nowhere.`,
    );
  }
  return parts.join(" ");
}

/** Answers a model may see, for a form-assisted summary. Never the rest. */
export function modelVisibleAnswers(answers: SubmissionAnswer[]): SubmissionAnswer[] {
  return answers.filter((answer) => !answer.redacted && mayReachModel(answer.sensitivity));
}
