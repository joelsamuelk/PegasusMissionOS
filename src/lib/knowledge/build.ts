import type {
  AuditStamp,
  Claim,
  ClaimKind,
  ClaimProducer,
  ClaimSource,
  ClaimValue,
  EntityReference,
  UUID,
  VerificationState,
} from "@/types/domain";
import { assertProducerMayAssign } from "./verify";

/**
 * Claim construction.
 *
 * The only supported way to mint a claim. It exists so that the trust rules
 * cannot be bypassed by assembling the object literal by hand: every claim
 * passes `assertProducerMayAssign`, so an extractor or a model physically
 * cannot produce a `verified` claim.
 */

export interface ClaimInit {
  id: UUID;
  organisationId: UUID;
  subject: EntityReference;
  predicate: string;
  value: ClaimValue;
  text: string;
  kind: ClaimKind;
  producedBy: ClaimProducer;
  now: Date;

  verification?: VerificationState;
  confidence?: number;
  sources?: ClaimSource[];
  derivedFrom?: EntityReference[];
  supportedBy?: UUID[];
  workings?: string;
  assumptions?: string[];
  caveats?: string[];
  validFrom?: string;
  validUntil?: string;
  periodLabel?: string;
  supersedes?: UUID;
}

export function createClaim(init: ClaimInit): Claim {
  // A produced claim defaults to needs_review, never to anything stronger.
  const verification: VerificationState =
    init.verification ?? (init.producedBy.method === "human" ? "provided" : "needs_review");

  assertProducerMayAssign(verification, init.producedBy);

  const at = init.now.toISOString();
  const audit: AuditStamp = {
    createdAt: at,
    updatedAt: at,
    ...(init.producedBy.method === "human" ? { createdBy: init.producedBy.actorId } : {}),
    archivedAt: null,
  };

  return {
    id: init.id,
    organisationId: init.organisationId,
    subject: init.subject,
    predicate: init.predicate,
    value: init.value,
    text: init.text,
    kind: init.kind,
    verification,
    ...(init.confidence !== undefined ? { confidence: init.confidence } : {}),
    sources: init.sources ?? [],
    derivedFrom: init.derivedFrom ?? [],
    supportedBy: init.supportedBy ?? [],
    producedBy: init.producedBy,
    ...(init.workings ? { workings: init.workings } : {}),
    assumptions: init.assumptions ?? [],
    caveats: init.caveats ?? [],
    ...(init.validFrom ? { validFrom: init.validFrom } : {}),
    ...(init.validUntil ? { validUntil: init.validUntil } : {}),
    ...(init.periodLabel ? { periodLabel: init.periodLabel } : {}),
    ...(init.supersedes ? { supersedes: init.supersedes } : {}),
    conflictsWith: [],
    audit,
  };
}

/** Render a claim value for display and for AI grounding. */
export function renderClaimValue(value: ClaimValue): string {
  switch (value.type) {
    case "text":
      return value.text;
    case "number":
      return value.unit ? `${value.number} ${value.unit}` : String(value.number);
    case "money": {
      const major = (value.minorUnits / 100).toLocaleString("en-GB", {
        style: "currency",
        currency: value.currency,
        maximumFractionDigits: 0,
      });
      return major;
    }
    case "date":
      return value.date;
    case "boolean":
      return value.boolean ? "Yes" : "No";
    case "list":
      return value.items.join(", ");
  }
}
