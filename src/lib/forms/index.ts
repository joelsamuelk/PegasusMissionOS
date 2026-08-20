/**
 * Mission Forms.
 *
 * A universal data collection system, and the test of whether it is one is
 * `project.ts`: if a submission does not become a claim, a measurement, an
 * interaction or a piece of evidence, this is a form builder with a charity
 * vocabulary.
 *
 * Two things here are deliberately *not* general.
 *
 * **Sensitivity is a field property with no default.** Every field states it,
 * and `personal` and `special_category` answers never reach a model and never
 * project into the knowledge layer. This is the condition MG-12 set on this
 * phase being allowed to collect intake data at all.
 *
 * **The condition language is borrowed, not rebuilt.** Form logic is the
 * automation engine's typed tree over a bag of answers. A second conditional
 * language would be a second set of edge cases, drifting.
 */

export {
  SENSITIVITY_DESCRIPTIONS,
  SENSITIVITY_LABELS,
  SENSITIVITY_ORDER,
  answersDueForErasure,
  capabilityFor,
  checkPublishable,
  mayReachModel,
  partitionForModel,
  peakSensitivity,
  retainUntil,
  type PublishProblem,
} from "./sensitivity";

export {
  answerFacts,
  draftFacts,
  isRequired,
  isVisible,
  validateSubmission,
  visibleFields,
  visibleSections,
  type ValidationProblem,
} from "./logic";

export {
  canApplyUnattended,
  describeProjection,
  modelVisibleAnswers,
  projectSubmission,
  type ProjectionInput,
} from "./project";

export {
  MINIMUM_RESPONSES_FOR_PERCENTAGE,
  aggregateAnswers,
  describeAggregate,
  type AggregateInput,
  type AggregateResult,
  type AggregationMethod,
} from "./aggregate";

export {
  HONEYPOT_FIELD_KEY,
  SPAM_THRESHOLD,
  assessSpam,
  type SpamAssessment,
  type SpamCheckInput,
  type SpamSignal,
} from "./spam";
