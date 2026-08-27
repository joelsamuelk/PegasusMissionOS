import type {
  AuditStamp,
  ImpactReport,
  ImpactReportSection,
  ReportDefinition,
  ReportRequirement,
  ReportSectionDefinition,
  ReportType,
} from "@/types/domain";
import { REPORT_TEMPLATES } from "./templates";

/**
 * Creating a report from a definition.
 *
 * The rule that shapes this: **a new report is empty, and says so.** It is
 * tempting to pre-fill sections from the previous period's report, and it is
 * the single worst thing this function could do — a pre-filled section is
 * indistinguishable from a drafted one, so last year's figures survive into
 * this year's report by inertia rather than by anyone deciding they still
 * hold.
 *
 * What *is* carried forward is structure and requirements, never content.
 */

export interface CreateReportInput {
  id: string;
  organisationId: string;
  title: string;
  reportingPeriod: string;
  type: ReportType;
  /** Where the sections come from. Falls back to the built-in template. */
  definition?: ReportDefinition;
  programmeId?: string;
  grantId?: string;
  ownerId?: string;
  includedIndicatorIds?: string[];
  includedEvidenceIds?: string[];
  now: Date;
}

export function sectionsFor(
  type: ReportType,
  definition?: ReportDefinition,
): readonly ReportSectionDefinition[] {
  if (definition && definition.sections.length > 0) return definition.sections;
  return REPORT_TEMPLATES[type] ?? REPORT_TEMPLATES.impact;
}

export function buildReportFromDefinition(input: CreateReportInput): ImpactReport {
  const definitions = sectionsFor(input.type, input.definition);
  const stamp: AuditStamp = {
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    createdBy: input.ownerId,
    archivedAt: null,
  };

  const sections: ImpactReportSection[] = definitions.map((definition) => ({
    key: definition.key,
    title: definition.title,
    type: definition.type,
    // Empty, deliberately. See the note above.
    content: "",
    claimIds: [],
  }));

  return {
    id: input.id,
    organisationId: input.organisationId,
    title: input.title,
    type: input.type,
    definitionId: input.definition?.id,
    programmeId: input.programmeId,
    grantId: input.grantId,
    reportingPeriod: input.reportingPeriod,
    status: "draft",
    ownerId: input.ownerId,
    contributorIds: [],
    reviewerIds: [],
    approverIds: [],
    includedIndicatorIds: input.includedIndicatorIds ?? [],
    includedEvidenceIds: input.includedEvidenceIds ?? [],
    sections,
    audit: stamp,
  };
}

/**
 * Clone a template, taking its requirements with it.
 *
 * An organisation adapting a funder's template must get the requirements too,
 * or the clone is a set of section headings with no idea what the funder
 * actually asked. `verification` is preserved rather than reset: a
 * human-confirmed requirement stays confirmed through a clone, because the
 * confirmation was about the funder's question and the question has not
 * changed.
 */
export function cloneDefinition(input: {
  definition: ReportDefinition;
  requirements: ReportRequirement[];
  newDefinitionId: string;
  name: string;
  now: Date;
  createdBy?: string;
  requirementId: (index: number) => string;
}): { definition: ReportDefinition; requirements: ReportRequirement[] } {
  const definition: ReportDefinition = {
    ...input.definition,
    id: input.newDefinitionId,
    name: input.name,
    origin: "cloned",
    sections: structuredClone(input.definition.sections),
    audit: {
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString(),
      createdBy: input.createdBy,
      archivedAt: null,
    },
  };

  const requirements = input.requirements.map((requirement, index) => ({
    ...structuredClone(requirement),
    id: input.requirementId(index),
    definitionId: input.newDefinitionId,
  }));

  return { definition, requirements };
}
