/**
 * The finance runtime.
 *
 * Deliberately a separate directory from `lib/finance-intelligence`, and the
 * separation is the phase's governing constraint made structural: **nothing in
 * that directory changes.** It holds 4,809 lines of tested calculation across
 * nineteen modules, and MG-8's job was to give it inputs and a surface, not to
 * revise it.
 *
 * So: `finance-intelligence` calculates, and `finance` ingests, classifies and
 * composes. Every figure this directory produces comes out of that one, and
 * the one thing this directory adds that the engine never had is an honest
 * answer when there is nothing to calculate from.
 */

export {
  detectColumn,
  detectDateAmbiguity,
  detectDuplicates,
  parseAmountMinorUnits,
  parseStatementCsv,
  parseStatementDate,
  type DuplicateMatch,
  type ParsedStatement,
  type ParsedStatementRow,
  type ParseStatementOptions,
  type StatementColumn,
  type StatementProblem,
} from "./statement";

export {
  MATERIAL_THRESHOLD_MINOR_UNITS,
  candidateTargets,
  classifyRows,
  classifyTransaction,
  describeClassification,
  isMaterial,
  type ClassificationConfidence,
  type ClassificationContext,
  type ClassificationEvidence,
  type ClassifiedRow,
  type TransactionCandidate,
} from "./classify";

export {
  computeFinancePosition,
  unknownFigure,
  type BudgetVariance,
  type FinanceFigure,
  type FinancePosition,
  type FinancePositionInput,
  type GrantUtilisation,
} from "./position";
