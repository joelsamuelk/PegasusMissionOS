import type { FormMapping, SubmissionAnswer } from "@/types/domain";

/**
 * Turning survey answers into an indicator measurement.
 *
 * The obvious implementation is wrong, and it is worth saying why before the
 * code: **one response is not a measurement.** A participant ticking "yes, I
 * moved into employment" is one data point. Writing it straight onto
 * `Indicator.currentValue` would mean the progression rate becomes whatever
 * the most recent respondent said, and the next response would overwrite it.
 *
 * A measurement derived from a survey is an aggregate over the responses that
 * have been accepted, and it carries the denominator. "58%" and "58% of 12
 * responses" are different claims, and only the second can be checked.
 *
 * This is why indicator mappings are handled here rather than in
 * `projectSubmission`: they are inherently cross-submission, and a per-
 * submission projection has no way to see the others.
 */

export type AggregationMethod = "percentage_true" | "mean" | "count" | "sum";

export interface AggregateInput {
  mapping: FormMapping;
  /** Answers to this mapping's field, from accepted submissions only. */
  answers: SubmissionAnswer[];
}

export interface AggregateResult {
  mappingId: string;
  fieldKey: string;
  method: AggregationMethod;
  /** The figure, or null where it cannot be computed. */
  value: number | null;
  /** How many responses it rests on. Never omitted. */
  responses: number;
  /** The arithmetic, written so a human can check it. */
  workings: string;
  /** Why no figure could be produced, where none could. */
  cannotCalculate?: string;
}

/**
 * Below this, a percentage is not reported.
 *
 * Three respondents out of four saying yes is not "75% progression"; it is
 * three people. Publishing a percentage from a handful of responses is the
 * most common way a survey becomes a misleading impact claim, and a threshold
 * is a cruder defence than a confidence interval and a considerably harder one
 * to argue with.
 */
export const MINIMUM_RESPONSES_FOR_PERCENTAGE = 5;

function methodFor(answers: SubmissionAnswer[]): AggregationMethod {
  const first = answers[0];
  if (!first) return "count";
  switch (first.fieldType) {
    case "checkbox":
    case "consent":
      return "percentage_true";
    case "scale":
    case "rating":
    case "number":
      return "mean";
    default:
      return "count";
  }
}

export function aggregateAnswers(input: AggregateInput): AggregateResult {
  const { mapping } = input;
  const answers = input.answers.filter((answer) => !answer.redacted);
  const method = methodFor(answers);
  const base = {
    mappingId: mapping.id,
    fieldKey: mapping.fieldKey,
    method,
    responses: answers.length,
  };

  if (answers.length === 0) {
    return {
      ...base,
      value: null,
      workings: "No accepted responses.",
      cannotCalculate: "No responses have been accepted, so there is nothing to measure.",
    };
  }

  if (method === "percentage_true") {
    if (answers.length < MINIMUM_RESPONSES_FOR_PERCENTAGE) {
      const yes = answers.filter(
        (answer) => answer.value.type === "boolean" && answer.value.boolean,
      ).length;
      return {
        ...base,
        value: null,
        workings: `${yes} of ${answers.length} said yes.`,
        // Reported as a count rather than silently rounded into a percentage.
        cannotCalculate: `A percentage from ${answers.length} response${answers.length === 1 ? "" : "s"} would overstate what is known. ${yes} of ${answers.length} said yes; at least ${MINIMUM_RESPONSES_FOR_PERCENTAGE} responses are needed before this is reported as a rate.`,
      };
    }
    const yes = answers.filter(
      (answer) => answer.value.type === "boolean" && answer.value.boolean,
    ).length;
    const percent = Math.round((yes / answers.length) * 1000) / 10;
    return {
      ...base,
      value: percent,
      workings: `${yes} of ${answers.length} accepted responses answered yes, which is ${percent}%.`,
    };
  }

  if (method === "mean") {
    const numbers = answers
      .map((answer) =>
        answer.value.type === "number"
          ? answer.value.number
          : answer.value.type === "money"
            ? answer.value.minorUnits
            : null,
      )
      .filter((value): value is number => value !== null);

    if (numbers.length === 0) {
      return {
        ...base,
        value: null,
        workings: `${answers.length} responses, none of them numeric.`,
        cannotCalculate:
          "No numeric answers were given, so a mean cannot be produced from these responses.",
      };
    }
    const mean = Math.round((numbers.reduce((sum, n) => sum + n, 0) / numbers.length) * 10) / 10;
    return {
      ...base,
      value: mean,
      responses: numbers.length,
      workings: `Sum of ${numbers.length} answers divided by ${numbers.length}, which is ${mean}.`,
    };
  }

  return {
    ...base,
    value: answers.length,
    workings: `${answers.length} accepted response${answers.length === 1 ? "" : "s"}.`,
  };
}

/**
 * A one-line description for a reviewer approving the measurement.
 *
 * Always states the denominator. A reviewer shown "58%" cannot tell whether it
 * rests on twelve responses or on two hundred, and those warrant different
 * decisions.
 */
export function describeAggregate(result: AggregateResult): string {
  if (result.value === null) {
    return result.cannotCalculate ?? "This cannot be measured from the responses received.";
  }
  return `${result.value}${result.method === "percentage_true" ? "%" : ""}, from ${result.responses} accepted response${result.responses === 1 ? "" : "s"}. ${result.workings}`;
}
