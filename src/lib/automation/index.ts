/**
 * Mission Automations.
 *
 * `EVENT → CONDITION → ACTION`, once, for the whole product. The brief's first
 * instruction is not to build module-specific automation systems, and the way
 * this file keeps that promise is that nothing in this directory knows what a
 * grant is: conditions read a flat fact bag, actions come from a closed
 * catalogue, and the engine plans without acting.
 *
 * The three properties worth knowing before reading any of it:
 *
 * 1. **Conditions are data.** A typed tree that serialises to jsonb. No
 *    expression string, no interpreter, nothing to inject code into.
 * 2. **Evaluation is three-valued.** An automation whose condition cannot be
 *    decided does not fire, and records why. `missing ≠ assumed`, applied to
 *    machinery that runs without a person present.
 * 3. **Planning and acting are separate functions.** Which is what makes
 *    simulation run the same code as a live run rather than a parallel one.
 */

export {
  decidingLeaves,
  evaluateCondition,
  explainTrace,
  fieldsUsed,
  type AutomationCondition,
  type ConditionTrace,
  type EvaluationResult,
  type FactBag,
  type FactValue,
  type Truth,
} from "./conditions";

export {
  ACTION_CATALOGUE,
  ACTION_KINDS,
  isExternallyVisible,
  requiresApproval,
  usesModel,
  validateAction,
  validateActions,
  type ActionDescriptor,
  type ActionValidation,
} from "./actions";

export {
  asPrevious,
  financeFacts,
  grantFacts,
  grantReportFacts,
  indicatorFacts,
  mergeFacts,
  programmeFacts,
  relationshipFacts,
  reportFacts,
  requirementFacts,
  FACT_NAMESPACES,
} from "./facts";

export {
  matchesTrigger,
  planRun,
  runFrom,
  stepsFrom,
  type PlanOptions,
  type PlannedStep,
  type RunPlan,
  type TriggerMatch,
} from "./engine";

export {
  describeSimulation,
  simulateAutomation,
  type SimulationInput,
  type SimulationOutcome,
} from "./simulate";
