import type { Attested, Claim, VerificationState } from "@/types/domain";
import { createClaim } from "@/lib/knowledge";
import type { ProfileCandidate } from "./types";

/**
 * The human verification step.
 *
 * This is where an extracted candidate becomes organisational truth — the one
 * transition in the whole pipeline that a person must make. Extraction never
 * promotes itself, however confident it is.
 */

export type ReviewDecision = "confirm" | "edit" | "reject";

export interface ReviewAction {
  decision: ReviewDecision;
  /** Required for `edit`: the corrected value the reviewer supplies. */
  value?: string;
  reviewerId: string;
  reviewerName: string;
  at: Date;
}

export interface ReviewOutcome {
  /** Present unless the candidate was rejected. */
  attested?: Attested<string>;
  verificationState: VerificationState | "discarded";
  /** Retained for the audit trail regardless of decision. */
  candidateId: string;
  sourceUrl: string;
}

/**
 * Apply a reviewer's decision to a candidate.
 *
 * - `confirm` → `verified`, attributed to the reviewer.
 * - `edit`    → `provided`, because the value is now the human's, not the
 *               source's. The original source is still retained so the
 *               correction is traceable.
 * - `reject`  → discarded; nothing enters the profile.
 */
export function applyReview(
  candidate: ProfileCandidate,
  action: ReviewAction,
): ReviewOutcome {
  const base = {
    candidateId: candidate.id,
    sourceUrl: candidate.sourceUrl,
  };

  if (action.decision === "reject") {
    return { ...base, verificationState: "discarded" };
  }

  const isEdit = action.decision === "edit";
  if (isEdit && !action.value?.trim()) {
    throw new Error("An edited candidate requires a replacement value.");
  }

  const value = isEdit ? action.value!.trim() : candidate.value;
  const verificationState: VerificationState = isEdit ? "provided" : "verified";
  const at = action.at.toISOString();

  return {
    ...base,
    verificationState,
    attested: {
      value,
      verification: verificationState,
      // Provenance survives the correction: we keep pointing at what Pegasus
      // read, even when the human overrode it.
      source: `${candidate.sourceUrl} (${candidate.locator}, ${candidate.method})`,
      lastVerifiedAt: at,
    },
  };
}

/**
 * Candidates a reviewer may safely confirm in bulk.
 *
 * Deliberately conservative. Anything conflicting, low-confidence or flagged
 * for suspected injection must be looked at individually — bulk-confirming
 * those would defeat the point of the review step.
 */
export function isSafeForBulkConfirm(
  candidate: ProfileCandidate,
  conflictedFields: ReadonlySet<string>,
): boolean {
  if (candidate.injectionSuspected) return false;
  if (conflictedFields.has(candidate.field)) return false;
  if (candidate.confidence < 0.8) return false;
  // Regulatory identifiers are consequential enough to warrant a human look
  // even when a single high-confidence source supplied them.
  if (candidate.field === "registrationNumber") return false;
  return true;
}

/**
 * Project a candidate into a Knowledge-layer claim.
 *
 * Extraction and the Knowledge layer were solving the same problem
 * independently: a value, where it came from, how confident the extractor was,
 * and whether a human has stood behind it. This is the join.
 *
 * Three rules survive the projection intact, and all three are enforced by
 * `createClaim` rather than restated here:
 *
 * - a candidate is `ai_extracted`, never `verified`, however confident it is;
 * - `injectionSuspected` forces `needs_review` regardless of confidence;
 * - the locator and method are retained, so "where did you get this?" is
 *   answerable to the character offset rather than to the page.
 */
export function candidateToClaim(
  candidate: ProfileCandidate,
  organisationId: string,
  now: Date,
  claimId: string,
): Claim {
  return createClaim({
    id: claimId,
    organisationId,
    subject: {
      type: "organisation_profile_field",
      id: `${organisationId}:${candidate.field}`,
      label: candidate.field,
    },
    predicate: candidate.field,
    value: { type: "text", text: candidate.value },
    text: candidate.value,
    kind: "fact",
    // High confidence never promotes. Suspected injection downgrades further.
    verification: candidate.injectionSuspected ? "needs_review" : "ai_extracted",
    confidence: candidate.confidence,
    producedBy: {
      method: "extraction",
      extractionMethod: candidate.method,
      sourceId: candidate.sourceId,
    },
    sources: [
      {
        ref: {
          type: "research_source",
          id: candidate.sourceId,
          label: candidate.sourceUrl,
        },
        authority: candidate.authority,
        locator: candidate.locator,
        retrievedAt: candidate.extractedAt,
      },
    ],
    caveats: candidate.injectionSuspected
      ? ["The source contained instruction-shaped content and was sanitised."]
      : [],
    now,
  });
}
