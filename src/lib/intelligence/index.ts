/**
 * Mission Intelligence.
 *
 * The capability that reasons across the Mission Graph. Not a chatbot: the
 * reasoning is deterministic, the output is structured by how each statement
 * was arrived at, and a model — where one is used at all — narrates a brief it
 * did not produce.
 *
 * Nothing in this directory touches storage. Context assembly is
 * `server/intelligence/mission-context.ts`, which is also the only place that
 * decides what a model may see.
 */

export {
  ATTENTION_CATEGORY_LABELS,
  SEVERITY_WEIGHT,
  UNKNOWN_REASON_LABELS,
  isComposite,
  type AttentionCategory,
  type AttentionItem,
  type AttentionKind,
  type AttentionSeverity,
  type AttentionSignal,
  type CompositeAttentionItem,
  type ContextSnapshot,
  type MissionBrief,
  type MissionBriefScope,
  type MissionStatement,
  type MissionUnknown,
  type RecommendedAction,
  type UnknownReason,
} from "./types";

export { emptySnapshot, type MissionSnapshot } from "./snapshot";

export {
  ATTENTION_THRESHOLDS,
  DETECTORS,
  detectAttention,
  detectDeliveryAttention,
  detectFinanceAttention,
  detectFundingAttention,
  detectGovernanceAttention,
  detectGrantAttention,
  detectOpportunityAttention,
  detectRelationshipAttention,
  detectReportAttention,
  detectStrategyAttention,
  rankAttention,
} from "./attention";

export {
  CROSS_DOMAIN_RULES,
  applyCrossDomain,
  type AttentionBoard,
  type CrossDomainRule,
} from "./cross-domain";

export {
  assembleAssumptions,
  assembleCalculations,
  assembleFacts,
  assembleInferences,
  buildMissionBrief,
  buildMorningBrief,
  detectUnknowns,
  recommendActions,
  type BriefInput,
  type MorningBrief,
} from "./brief";
