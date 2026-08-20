import type {
  Claim,
  EvidenceItem,
  ImpactReport,
  Indicator,
  ReportRequirement,
} from "@/types/domain";
import { effectiveClaimKind, indexClaims } from "@/lib/knowledge";

/**
 * Evidence completeness.
 *
 * The brief asks every report to expose seven things:
 *
 *   Verified evidence · Provided evidence · Calculated statements ·
 *   AI-assisted narrative · Missing evidence · Outdated evidence · Conflicts
 *
 * They are not seven counts of the same thing. Four describe what the report
 * *has* and are graded by how far each stands from a record; three describe
 * what is *wrong with it*. Rendering them as one percentage would destroy the
 * only information a reader actually needs, which is which kind of gap they
 * are looking at: a report that is 80% complete because it is missing a
 * financial figure is in a different position from one that is 80% complete
 * because two sources disagree.
 *
 * Nothing here asks a model anything.
 */

export interface CompletenessEntry {
  sectionKey?: string;
  label: string;
  detail: string;
  ref?: { type: string; id: string };
}

export interface ReportCompleteness {
  /** Evidence a human has verified. The strongest thing a report can carry. */
  verifiedEvidence: CompletenessEntry[];
  /** Evidence the organisation provided but nobody independently verified. */
  providedEvidence: CompletenessEntry[];
  /** Figures derived by a method that can be shown. */
  calculatedStatements: CompletenessEntry[];
  /** Sections a model drafted. Not a defect; a fact the reader is owed. */
  aiAssistedNarrative: CompletenessEntry[];
  /** Requirements with nothing against them. */
  missingEvidence: CompletenessEntry[];
  /** Evidence that exists and is too old to support a current claim. */
  outdatedEvidence: CompletenessEntry[];
  /** Two current claims about the same thing that disagree. */
  conflicts: CompletenessEntry[];
}

export interface CompletenessInput {
  report: ImpactReport;
  claims: Claim[];
  evidence: EvidenceItem[];
  indicators: Indicator[];
  requirements?: ReportRequirement[];
  now: Date;
  /** Evidence older than this cannot support a current claim. */
  outdatedAfterDays?: number;
}

export function assessReportCompleteness(input: CompletenessInput): ReportCompleteness {
  const { report, claims, evidence, indicators, now } = input;
  const requirements = input.requirements ?? [];
  const outdatedAfterDays = input.outdatedAfterDays ?? 730;

  const result: ReportCompleteness = {
    verifiedEvidence: [],
    providedEvidence: [],
    calculatedStatements: [],
    aiAssistedNarrative: [],
    missingEvidence: [],
    outdatedEvidence: [],
    conflicts: [],
  };

  const included = evidence.filter((item) => report.includedEvidenceIds.includes(item.id));
  const cutoff = now.getTime() - outdatedAfterDays * 86_400_000;

  for (const item of included) {
    const updated = Date.parse(item.audit.updatedAt);
    const entry: CompletenessEntry = {
      label: item.title,
      detail: `${item.type.replace(/_/g, " ")}, ${item.verification.replace(/_/g, " ")}${item.reportingPeriod ? `, covering ${item.reportingPeriod}` : ""}.`,
      ref: { type: "evidence", id: item.id },
    };

    // Outdated is reported *as well as* the trust state, not instead of it.
    // A verified evaluation from 2019 is both verified and outdated, and a
    // reader who is told only the first has been misled.
    if (Number.isFinite(updated) && updated < cutoff) {
      result.outdatedEvidence.push({
        ...entry,
        detail: `${entry.detail} Last updated ${item.audit.updatedAt.slice(0, 10)}, older than ${outdatedAfterDays} days.`,
      });
    }

    if (item.verification === "verified") result.verifiedEvidence.push(entry);
    else if (item.verification === "outdated") {
      if (!result.outdatedEvidence.some((e) => e.ref?.id === item.id)) {
        result.outdatedEvidence.push(entry);
      }
    } else result.providedEvidence.push(entry);
  }

  const index = indexClaims(claims);
  const citedIds = new Set(report.sections.flatMap((section) => section.claimIds ?? []));

  for (const claim of claims.filter((c) => citedIds.has(c.id))) {
    // The *effective* kind, not the stated one. A calculation resting on a
    // forecast is not a calculation, and listing it as one here would be the
    // report re-laundering exactly what `effectiveClaimKind` exists to stop.
    const kind = effectiveClaimKind(claim, index);
    if (kind !== "calculation") continue;
    result.calculatedStatements.push({
      label: claim.text,
      detail: claim.workings ?? "No workings were recorded for this calculation.",
      ref: { type: "claim", id: claim.id },
    });
  }

  for (const section of report.sections) {
    if (!section.provenance) continue;
    result.aiAssistedNarrative.push({
      sectionKey: section.key,
      label: section.title,
      detail: `Drafted with ${section.provenance.model}${section.provenance.usedFallback ? " (fallback)" : ""}, prompt ${section.provenance.promptVersion}, drawing on ${section.provenance.used.length} record${section.provenance.used.length === 1 ? "" : "s"}.`,
    });
  }

  // Requirements with nothing against them. This is the half of completeness
  // that only exists once a funder's template has been ingested: without
  // requirements, "missing" can only mean "an empty section", which understates
  // the gap every time a funder asks two questions in one section.
  for (const requirement of requirements) {
    if (!requirement.required) continue;
    const section = report.sections.find((s) => s.key === requirement.sectionKey);
    const satisfied = isRequirementSatisfied(requirement, report, section?.content ?? "", {
      evidence: included,
      indicators,
      claims,
    });
    if (satisfied) continue;
    result.missingEvidence.push({
      sectionKey: requirement.sectionKey,
      label: requirement.prompt,
      detail: describeUnmet(requirement),
      ref: requirement.target
        ? { type: requirement.target.type, id: requirement.target.id }
        : undefined,
    });
  }

  // Where no template has been ingested, fall back to empty required sections.
  if (requirements.length === 0) {
    for (const section of report.sections) {
      if (section.content.trim()) continue;
      result.missingEvidence.push({
        sectionKey: section.key,
        label: section.title,
        detail: "This section has not been drafted.",
      });
    }
  }

  const currentByPredicate = new Map<string, Claim>();
  for (const claim of claims.filter((c) => !c.supersededBy)) {
    const key = `${claim.subject.type}:${claim.subject.id}:${claim.predicate}`;
    const previous = currentByPredicate.get(key);
    if (previous && JSON.stringify(previous.value) !== JSON.stringify(claim.value)) {
      result.conflicts.push({
        label: claim.predicate.replace(/_/g, " "),
        detail: `Two current claims disagree: "${previous.text}" and "${claim.text}".`,
        ref: { type: "claim", id: claim.id },
      });
    } else {
      currentByPredicate.set(key, claim);
    }
  }

  return result;
}

function isRequirementSatisfied(
  requirement: ReportRequirement,
  report: ImpactReport,
  content: string,
  data: { evidence: EvidenceItem[]; indicators: Indicator[]; claims: Claim[] },
): boolean {
  switch (requirement.kind) {
    case "narrative":
      return content.trim().length > 0;
    case "indicator":
      return requirement.target
        ? report.includedIndicatorIds.includes(requirement.target.id) &&
            data.indicators.some(
              (i) => i.id === requirement.target!.id && i.lastUpdated !== undefined,
            )
        : report.includedIndicatorIds.length > 0;
    case "evidence":
      return requirement.evidenceTypes && requirement.evidenceTypes.length > 0
        ? data.evidence.some((item) => requirement.evidenceTypes!.includes(item.type))
        : data.evidence.length > 0;
    case "claim":
      return requirement.target
        ? report.sections.some((section) =>
            (section.claimIds ?? []).some((id) =>
              data.claims.some(
                (claim) => claim.id === id && claim.subject.id === requirement.target!.id,
              ),
            ),
          )
        : report.sections.some((section) => (section.claimIds ?? []).length > 0);
    case "financial":
      // A financial requirement is satisfied by a cited calculation, never by
      // a number typed into prose. That is Invariant 5 applied to a funder's
      // question rather than to a section.
      return report.sections
        .filter((section) => section.key === requirement.sectionKey)
        .some((section) => (section.claimIds ?? []).length > 0);
    case "attachment":
      return data.evidence.some((item) => Boolean(item.fileName));
  }
}

function describeUnmet(requirement: ReportRequirement): string {
  switch (requirement.kind) {
    case "narrative":
      return `This section has not been drafted${requirement.wordLimit ? `, and the funder allows ${requirement.wordLimit} words` : ""}.`;
    case "indicator":
      return requirement.target?.label
        ? `${requirement.target.label} is not included in this report, or has never been measured.`
        : "No indicator has been included against this requirement.";
    case "evidence":
      return requirement.evidenceTypes?.length
        ? `The funder asked for ${requirement.evidenceTypes.join(" or ")}, and none is included.`
        : "No supporting evidence is included against this requirement.";
    case "claim":
      return "No cited figure answers this requirement.";
    case "financial":
      return "No cited financial figure answers this requirement. A number typed into prose does not satisfy it.";
    case "attachment":
      return "The funder asked for a document and none is attached.";
  }
}

/**
 * A single headline, for a list view.
 *
 * Reports a count of gaps rather than a percentage. A percentage invites the
 * reader to feel 85% done; a count of four missing items tells them what is
 * left, which is the question they actually have.
 */
export function completenessHeadline(completeness: ReportCompleteness): string {
  const gaps =
    completeness.missingEvidence.length +
    completeness.outdatedEvidence.length +
    completeness.conflicts.length;
  if (gaps === 0) {
    return `${completeness.verifiedEvidence.length} verified and ${completeness.providedEvidence.length} provided pieces of evidence, nothing outstanding.`;
  }
  const parts: string[] = [];
  if (completeness.missingEvidence.length) {
    parts.push(`${completeness.missingEvidence.length} missing`);
  }
  if (completeness.outdatedEvidence.length) {
    parts.push(`${completeness.outdatedEvidence.length} outdated`);
  }
  if (completeness.conflicts.length) {
    parts.push(`${completeness.conflicts.length} conflicting`);
  }
  return `${parts.join(", ")}.`;
}
