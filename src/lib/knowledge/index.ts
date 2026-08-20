/**
 * The Knowledge layer.
 *
 * `Attested<T>`, the finance statement kinds, the Organisation Intelligence
 * candidate/source/authority/conflict model and the relationship brief's
 * `sources[]` were four independent inventions of the same idea. This is that
 * idea, once:
 *
 *   SOURCE → CLAIM → VERIFICATION → DERIVATION → KNOWLEDGE → DECISION / ACTION
 *
 * Nothing here talks to storage. Persistence is `ClaimRepository`.
 */

export {
  CLAIM_KIND_LABELS,
  CLAIM_KIND_DISTANCE,
  effectiveClaimKind,
  indexClaims,
  kindIsHonest,
  walkClaims,
  type ClaimIndex,
} from "./kind";

export {
  flattenTrace,
  traceClaim,
  traceDepth,
  tracedAssumptions,
  tracedReferences,
  type DerivationNode,
} from "./trace";

export {
  assessEvidenceStrength,
  type EvidenceStrength,
  type EvidenceStrengthLevel,
  type StrengthSignal,
} from "./evidence-strength";

export {
  ClaimPromotionError,
  assertKindMayNotStrengthen,
  assertProducerMayAssign,
  confirmClaim,
  correctClaim,
  isCurrent,
  retireClaim,
  type VerifyAction,
} from "./verify";

export { createClaim, renderClaimValue, type ClaimInit } from "./build";

export {
  GroundingViolationError,
  itemsMentionedIn,
  observeGrounding,
  refKey,
  type GroundingItem,
  type ObservedGrounding,
} from "./grounding";
