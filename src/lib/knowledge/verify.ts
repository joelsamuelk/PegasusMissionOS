import type { Claim, ClaimKind, ClaimValue, UUID, VerificationState } from "@/types/domain";
import { CLAIM_KIND_DISTANCE, CLAIM_KIND_LABELS } from "./kind";

/**
 * Claim lifecycle transitions.
 *
 * Three rules are enforced here rather than documented, because each was
 * previously a convention that any new call site could quietly break:
 *
 * 1. **Confidence never promotes verification.** A JSON-LD extraction can be
 *    0.98 confident that a page says something and still be `ai_extracted`,
 *    because nobody at the organisation has confirmed it is current and
 *    correct. Only a person produces `verified`.
 *
 * 2. **Claims are immutable.** A correction produces a *new* claim carrying
 *    `supersedes`. Editing in place would silently rewrite history under every
 *    report that already cited the old value.
 *
 * 3. **A producer may not strengthen a claim's kind.** Superseding a hypothesis
 *    with a fact, or a forecast with a calculation, is a substantive assertion
 *    that the thing has been established. Only a person may make it. Without
 *    this, `effectiveClaimKind` can be defeated by a successor: the weakest
 *    link is computed over the support chain, and replacing the weak link with
 *    a strong successor launders the whole chain in one write.
 */

export class ClaimPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimPromotionError";
  }
}

/**
 * Guard for supersession.
 *
 * A successor may be the same kind, or weaker, or produced by a human who has
 * genuinely established something. What it may not be is a machine quietly
 * promoting a hypothesis into a fact.
 *
 * Throws rather than downgrading, for the same reason as
 * `assertProducerMayAssign`: a caller doing this has a bug in its trust model,
 * and silently correcting it hides the bug.
 */
export function assertKindMayNotStrengthen(
  previous: ClaimKind,
  next: ClaimKind,
  producer: Claim["producedBy"],
): void {
  if (producer.method === "human") return;
  if (CLAIM_KIND_DISTANCE[next] < CLAIM_KIND_DISTANCE[previous]) {
    throw new ClaimPromotionError(
      `A ${producer.method} producer may not supersede ` +
        `${CLAIM_KIND_LABELS[previous]} with ${CLAIM_KIND_LABELS[next]}. ` +
        `Establishing something is a human act, not a rewrite.`,
    );
  }
}

/** The only verification states a producer may assign without human action. */
const PRODUCER_ASSIGNABLE: VerificationState[] = ["ai_extracted", "needs_review", "outdated"];

/**
 * Guard for claim creation.
 *
 * Throws rather than silently downgrading: a caller trying to mint a `verified`
 * claim from an extractor has a bug in its trust model, and quietly correcting
 * it would hide that.
 */
export function assertProducerMayAssign(
  verification: VerificationState,
  producer: Claim["producedBy"],
): void {
  if (producer.method === "human") return;
  if (!PRODUCER_ASSIGNABLE.includes(verification)) {
    throw new ClaimPromotionError(
      `A ${producer.method} producer may not assign "${verification}". ` +
        `Only a human action produces "verified" or "provided". ` +
        `Confidence, however high, is not verification.`,
    );
  }
}

export interface VerifyAction {
  actorId: UUID;
  at: Date;
}

/**
 * Confirm a claim: the value stands, and a person now stands behind it.
 *
 * Produces a new claim rather than mutating, so anything that already cited the
 * unverified version still resolves to what it actually cited.
 */
export function confirmClaim(claim: Claim, action: VerifyAction, newId: UUID): Claim {
  const at = action.at.toISOString();
  return {
    ...claim,
    id: newId,
    verification: "verified",
    verifiedBy: action.actorId,
    verifiedAt: at,
    supersedes: claim.id,
    supersededBy: undefined,
    producedBy: { method: "human", actorId: action.actorId },
    audit: { ...claim.audit, createdAt: at, updatedAt: at, createdBy: action.actorId },
  };
}

/**
 * Correct a claim.
 *
 * The result is `provided`, not `verified`: the value became the human's rather
 * than the source's. The original sources are retained deliberately, so the
 * correction stays traceable to what Pegasus had read when it got it wrong.
 */
export function correctClaim(
  claim: Claim,
  value: ClaimValue,
  text: string,
  action: VerifyAction,
  newId: UUID,
): Claim {
  const at = action.at.toISOString();
  return {
    ...claim,
    id: newId,
    value,
    text,
    verification: "provided",
    confidence: undefined,
    verifiedBy: action.actorId,
    verifiedAt: at,
    supersedes: claim.id,
    supersededBy: undefined,
    producedBy: { method: "human", actorId: action.actorId },
    audit: { ...claim.audit, createdAt: at, updatedAt: at, createdBy: action.actorId },
  };
}

/** Mark a claim as no longer current. Retained; never deleted. */
export function retireClaim(claim: Claim, action: VerifyAction): Claim {
  return {
    ...claim,
    verification: "outdated",
    audit: {
      ...claim.audit,
      updatedAt: action.at.toISOString(),
      updatedBy: action.actorId,
    },
  };
}

/** A claim is current when nothing supersedes it and it is not retired. */
export function isCurrent(claim: Claim): boolean {
  return !claim.supersededBy && claim.verification !== "outdated";
}
