import {
  FIELD_LABELS,
  FIELD_TARGETS,
  type CandidateField,
  type CandidateTarget,
  type ProfileCandidate,
  type ReconciliationResult,
} from "@/lib/organisation-intelligence/types";
import type { EntityType } from "@/types/domain";

/**
 * OnboardingContextBuilder.
 *
 * Turns a pile of extracted candidates into the thing a person can actually
 * review: a *candidate Mission Graph* — grouped by how far each value stands
 * from being trusted, and by what approving it would create.
 *
 * The grouping is the design. A review screen that lists ninety values in
 * extraction order gets bulk-approved, and bulk approval defeats the only
 * safeguard between a web page and a funder-facing profile. Six groups, in a
 * deliberate order, each answering a different question:
 *
 *     Verified      an official register said so
 *     Provided      you told us
 *     Extracted     we read it somewhere, and here is where
 *     Conflicts     sources disagree, so you decide
 *     Needs review  we are not confident, or the source looked manipulated
 *     Missing       we looked and did not find it
 *
 * `Missing` is a first-class group rather than an absence. "We could not find
 * your safeguarding policy" is information; a screen that simply omits it
 * implies the question was never asked.
 *
 * Pure. No repository, no network, no model.
 */

export type FindingGroup =
  | "verified"
  | "provided"
  | "extracted"
  | "conflicts"
  | "needs_review"
  | "missing";

export const GROUP_LABELS: Record<FindingGroup, string> = {
  verified: "Confirmed by an official register",
  provided: "You told us",
  extracted: "Found in your public information",
  conflicts: "Sources disagree",
  needs_review: "Worth a closer look",
  missing: "Not found",
};

export const GROUP_DESCRIPTIONS: Record<FindingGroup, string> = {
  verified:
    "An official register holds these. They are still yours to confirm, because registers go out of date.",
  provided: "Taken from what you entered, unchanged.",
  extracted:
    "Read from your website or your documents. Each one shows exactly where it came from.",
  conflicts:
    "Two or more sources say different things. Pegasus will not choose for you, but it says which it would pick and why.",
  needs_review:
    "Either the extraction was not confident, or the source contained something that looked like an instruction. Neither means it is wrong.",
  missing:
    "Pegasus looked for these and did not find them. That is not the same as saying you do not have them.",
};

export interface CandidateFinding {
  candidate: ProfileCandidate;
  group: FindingGroup;
  target: CandidateTarget;
  label: string;
  /** Why it landed in this group, in words a person can act on. */
  reason: string;
  /** Alternatives, for a conflict. The recommended one comes first. */
  alternatives?: ProfileCandidate[];
  recommendationReason?: string;
}

export interface MissingFinding {
  field: CandidateField;
  label: string;
  /** Why it matters, so the gap is a decision rather than a scold. */
  whyItMatters: string;
  /** What was looked at, so "not found" is a statement about our search. */
  searchedIn: string;
}

/**
 * A node the graph would gain if a candidate were approved.
 *
 * Proposed, never created. Approving twelve programmes because they appeared
 * on a website is exactly the kind of silent write this whole pipeline exists
 * to prevent.
 */
export interface GraphProposal {
  entityType: EntityType;
  label: string;
  candidateIds: string[];
  count: number;
}

export interface OnboardingContext {
  findings: CandidateFinding[];
  byGroup: Record<FindingGroup, CandidateFinding[]>;
  missing: MissingFinding[];
  proposals: GraphProposal[];
  counts: Record<FindingGroup, number>;
  /** Distinct fields Pegasus established something about. */
  fieldsEstablished: number;
}

/**
 * Fields worth reporting as missing when nothing was found.
 *
 * Deliberately short. Every entry is something a funder application or a
 * report actually asks for, so its absence is genuinely actionable. A list of
 * forty fields would turn the missing group into a wall of nagging, and the
 * useful three would be lost in it.
 */
const EXPECTED_FIELDS: { field: CandidateField; whyItMatters: string; searchedIn: string }[] = [
  {
    field: "missionStatement",
    whyItMatters:
      "Nearly every funding application opens by asking what you exist to do. Entered once, it is reusable everywhere.",
    searchedIn: "your website, your documents and the register",
  },
  {
    field: "communityServed",
    whyItMatters:
      "Funders match on who you serve. Without it, eligibility has to be assessed by hand.",
    searchedIn: "your website and your documents",
  },
  {
    field: "operatingRegions",
    whyItMatters:
      "Most grant programmes are geographically restricted, so this is often the first eligibility gate.",
    searchedIn: "your website and the register",
  },
  {
    field: "registrationNumber",
    whyItMatters:
      "Applications ask for it, and it is what lets Pegasus confirm your details against the official register.",
    searchedIn: "what you entered and the register",
  },
  {
    field: "safeguardingStatus",
    whyItMatters:
      "Funders working with young people or vulnerable adults usually ask whether a current policy is in place.",
    searchedIn: "your website and your policy documents",
  },
  {
    field: "annualIncome",
    whyItMatters:
      "Many funders set income bands for eligibility, and reporting compares against it.",
    searchedIn: "the register and your published accounts",
  },
  {
    field: "programme",
    whyItMatters:
      "Programmes are what grants fund and what outcomes attach to. They are the spine of the Mission Graph.",
    searchedIn: "your website and your reports",
  },
  {
    field: "indicator",
    whyItMatters:
      "Without indicators there is nothing to report progress against when a funder asks.",
    searchedIn: "your impact reports and any indicator spreadsheets",
  },
];

/** Which graph entity each proposing field would create. */
const PROPOSAL_TYPES: Partial<Record<CandidateField, EntityType>> = {
  programme: "programme",
  service: "programme",
  outcome: "outcome",
  indicator: "indicator",
  strategicPriority: "strategic_priority",
  funder: "external_organisation",
  partner: "external_organisation",
  report: "document",
};

/** Below this, an extraction is offered for a look rather than for approval. */
const LOW_CONFIDENCE = 0.6;

export function buildOnboardingContext(input: {
  candidates: ProfileCandidate[];
  reconciliation: ReconciliationResult;
  /** Fields the user typed directly, which are `provided` rather than extracted. */
  providedFields?: CandidateField[];
}): OnboardingContext {
  const { candidates, reconciliation, providedFields = [] } = input;
  const provided = new Set(providedFields);

  const conflictedFields = new Set(reconciliation.conflicts.map((c) => c.field));
  const findings: CandidateFinding[] = [];
  const seenConflictFields = new Set<CandidateField>();

  for (const candidate of candidates) {
    const target = FIELD_TARGETS[candidate.field];
    const label = FIELD_LABELS[candidate.field];

    // A conflict is one finding with alternatives, not one finding per source.
    // Listing every side separately asks the reviewer to resolve the same
    // disagreement several times without telling them it is the same one.
    if (conflictedFields.has(candidate.field)) {
      if (seenConflictFields.has(candidate.field)) continue;
      seenConflictFields.add(candidate.field);

      const conflict = reconciliation.conflicts.find((c) => c.field === candidate.field)!;
      const others = conflict.candidates.filter((c) => c.id !== conflict.recommended.id);

      findings.push({
        candidate: conflict.recommended,
        group: "conflicts",
        target,
        label,
        reason: `${conflict.candidates.length} sources give different values.`,
        alternatives: [conflict.recommended, ...others],
        recommendationReason: conflict.reason,
      });
      continue;
    }

    if (candidate.injectionSuspected) {
      findings.push({
        candidate,
        group: "needs_review",
        target,
        label,
        reason:
          "The page this came from contained text shaped like an instruction. The value was " +
          "stripped of it, and is worth reading before you accept it.",
      });
      continue;
    }

    if (candidate.confidence < LOW_CONFIDENCE) {
      findings.push({
        candidate,
        group: "needs_review",
        target,
        label,
        reason: "Pegasus is not confident it read this correctly.",
      });
      continue;
    }

    if (candidate.authority === "regulator") {
      findings.push({
        candidate,
        group: "verified",
        target,
        label,
        reason: "Held by the official register.",
      });
      continue;
    }

    // What the person typed is not an extraction and must not be presented as
    // one: asking someone to review the name they entered two minutes ago
    // spends their attention on the one value nobody doubts.
    if (provided.has(candidate.field)) {
      findings.push({
        candidate,
        group: "provided",
        target,
        label,
        reason: "Taken from what you entered.",
      });
      continue;
    }

    findings.push({
      candidate,
      group: "extracted",
      target,
      label,
      reason:
        candidate.method === "document"
          ? `Read from a document, at ${candidate.locator}.`
          : `Read from your website, at ${candidate.locator}.`,
    });
  }

  const byGroup: Record<FindingGroup, CandidateFinding[]> = {
    verified: [],
    provided: [],
    extracted: [],
    conflicts: [],
    needs_review: [],
    missing: [],
  };
  for (const finding of findings) byGroup[finding.group].push(finding);

  // Highest-confidence first within a group, so the quickest decisions come
  // first and momentum is not spent on the hardest item.
  for (const group of Object.values(byGroup)) {
    group.sort((a, b) => b.candidate.confidence - a.candidate.confidence);
  }

  const establishedFields = new Set(candidates.map((c) => c.field));
  const missing: MissingFinding[] = EXPECTED_FIELDS.filter(
    (expected) => !establishedFields.has(expected.field),
  ).map((expected) => ({
    field: expected.field,
    label: FIELD_LABELS[expected.field],
    whyItMatters: expected.whyItMatters,
    searchedIn: expected.searchedIn,
  }));

  const proposals = buildProposals(candidates);

  return {
    findings,
    byGroup,
    missing,
    proposals,
    counts: {
      verified: byGroup.verified.length,
      provided: byGroup.provided.length,
      extracted: byGroup.extracted.length,
      conflicts: byGroup.conflicts.length,
      needs_review: byGroup.needs_review.length,
      missing: missing.length,
    },
    fieldsEstablished: establishedFields.size,
  };
}

function buildProposals(candidates: ProfileCandidate[]): GraphProposal[] {
  const grouped = new Map<EntityType, { label: string; ids: string[] }>();

  for (const candidate of candidates) {
    const entityType = PROPOSAL_TYPES[candidate.field];
    if (!entityType) continue;
    const existing = grouped.get(entityType);
    if (existing) existing.ids.push(candidate.id);
    else grouped.set(entityType, { label: FIELD_LABELS[candidate.field], ids: [candidate.id] });
  }

  return [...grouped.entries()]
    .map(([entityType, { label, ids }]) => ({
      entityType,
      label,
      candidateIds: ids,
      count: ids.length,
    }))
    .sort((a, b) => b.count - a.count);
}
