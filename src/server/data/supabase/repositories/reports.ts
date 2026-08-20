import {
  buildReportFromDefinition,
  buildReportSnapshot,
  buildReportVersion,
  nextVersionNumber,
} from "@/lib/reporting";
import type {
  EntityReference,
  EvidenceType,
  GroundingRecord,
  ImpactReport,
  ImpactReportSection,
  ReportApproval,
  ReportContributor,
  ReportDefinition,
  ReportRequirement,
  ReportSectionDefinition,
  ReportSnapshot,
  ReportTemplateIngestion,
  ReportVersion,
  SnapshotFigure,
} from "@/types/domain";
import type { ReportRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";
import { mapEvidence } from "./evidence";

function mapSection(row: Row): ImpactReportSection {
  return {
    key: String(row.key),
    title: String(row.title),
    type: row.type as ImpactReportSection["type"],
    content: String(row.content ?? ""),
    claimIds: arrayFrom(row.claim_ids),
    ...(row.provenance ? { provenance: row.provenance as GroundingRecord } : {}),
  };
}

function mapReport(row: Row, sections: ImpactReportSection[]): ImpactReport {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    type: row.type as ImpactReport["type"],
    ...(row.definition_id ? { definitionId: String(row.definition_id) } : {}),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    ...(row.grant_id ? { grantId: String(row.grant_id) } : {}),
    reportingPeriod: String(row.reporting_period ?? ""),
    status: row.status as ImpactReport["status"],
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    contributorIds: arrayFrom(row.contributor_ids),
    reviewerIds: arrayFrom(row.reviewer_ids),
    approverIds: arrayFrom(row.approver_ids),
    includedIndicatorIds: arrayFrom(row.included_indicator_ids),
    includedEvidenceIds: arrayFrom(row.included_evidence_ids),
    sections,
    audit: auditFrom(row),
  };
}

function mapDefinition(row: Row): ReportDefinition {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    type: row.type as ReportDefinition["type"],
    sections: (row.sections ?? []) as ReportSectionDefinition[],
    origin: row.origin as ReportDefinition["origin"],
    ...(row.funder_id ? { funderId: String(row.funder_id) } : {}),
    ...(row.source_document_id ? { sourceDocumentId: String(row.source_document_id) } : {}),
    audit: auditFrom(row),
  };
}

function mapRequirement(row: Row): ReportRequirement {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    definitionId: String(row.definition_id),
    sectionKey: String(row.section_key),
    kind: row.kind as ReportRequirement["kind"],
    prompt: String(row.prompt),
    ...(row.guidance ? { guidance: String(row.guidance) } : {}),
    ...(row.word_limit != null ? { wordLimit: optionalNumberFrom(row.word_limit) } : {}),
    ...(row.target_type && row.target_id
      ? { target: { type: row.target_type as EntityReference["type"], id: String(row.target_id) } }
      : {}),
    ...(row.evidence_types ? { evidenceTypes: arrayFrom(row.evidence_types) as EvidenceType[] } : {}),
    required: Boolean(row.required),
    order: numberFrom(row.order),
    ...(row.source_type && row.source_id
      ? {
          sourceRef: {
            type: row.source_type as EntityReference["type"],
            id: String(row.source_id),
          },
        }
      : {}),
    // A requirement lifted from a PDF is a reading of that PDF, and reading a
    // funder's template wrongly is exactly the error that costs a grant.
    verification: row.verification as ReportRequirement["verification"],
  };
}

function requirementColumns(requirement: ReportRequirement): Record<string, unknown> {
  return {
    id: requirement.id,
    definitionId: requirement.definitionId,
    sectionKey: requirement.sectionKey,
    kind: requirement.kind,
    prompt: requirement.prompt,
    guidance: requirement.guidance,
    wordLimit: requirement.wordLimit,
    targetType: requirement.target?.type,
    targetId: requirement.target?.id,
    evidenceTypes: requirement.evidenceTypes ?? [],
    required: requirement.required,
    order: requirement.order,
    sourceType: requirement.sourceRef?.type,
    sourceId: requirement.sourceRef?.id,
    verification: requirement.verification,
  };
}

function mapVersion(row: Row): ReportVersion {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    reportId: String(row.report_id),
    versionNumber: numberFrom(row.version_number),
    reason: row.reason as ReportVersion["reason"],
    status: row.status as ReportVersion["status"],
    // The sections exactly as they stood. Stored as jsonb rather than rows,
    // because a version is a document, not a projection: re-rendering it from
    // `impact_report_sections` would defeat the entire point of cutting one.
    sections: (row.sections ?? []) as ImpactReportSection[],
    ...(row.snapshot_id ? { snapshotId: String(row.snapshot_id) } : {}),
    ...(row.note ? { note: String(row.note) } : {}),
    ...(row.created_by ? { createdBy: String(row.created_by) } : {}),
    createdAt: String(row.created_at),
  };
}

function mapSnapshot(row: Row): ReportSnapshot {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    reportId: String(row.report_id),
    ...(row.version_id ? { versionId: String(row.version_id) } : {}),
    takenAt: String(row.taken_at),
    figures: (row.figures ?? []) as SnapshotFigure[],
    evidenceIds: arrayFrom(row.evidence_ids),
    indicatorValues: (row.indicator_values ?? []) as ReportSnapshot["indicatorValues"],
    claimIds: arrayFrom(row.claim_ids),
  };
}

function mapContributor(row: Row): ReportContributor {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    reportId: String(row.report_id),
    userId: String(row.user_id),
    role: row.role as ReportContributor["role"],
    ...(row.section_key ? { sectionKey: String(row.section_key) } : {}),
    ...(row.invited_at ? { invitedAt: String(row.invited_at) } : {}),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
  };
}

function mapApproval(row: Row): ReportApproval {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    reportId: String(row.report_id),
    versionId: String(row.version_id),
    userId: String(row.user_id),
    decision: row.decision as ReportApproval["decision"],
    ...(row.comment ? { comment: String(row.comment) } : {}),
    decidedAt: String(row.decided_at),
  };
}

function mapIngestion(row: Row): ReportTemplateIngestion {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.definition_id ? { definitionId: String(row.definition_id) } : {}),
    ...(row.document_id ? { documentId: String(row.document_id) } : {}),
    ...(row.file_name ? { fileName: String(row.file_name) } : {}),
    ...(row.funder_id ? { funderId: String(row.funder_id) } : {}),
    status: row.status as ReportTemplateIngestion["status"],
    candidates: (row.candidates ?? []) as ReportRequirement[],
    detectedDueDates: arrayFrom(row.detected_due_dates),
    // Never silently empty: why parsing failed, or what it could not read.
    notes: arrayFrom(row.notes),
    createdAt: String(row.created_at),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
  };
}

export function createReportRepository(q: Query, deps: Deps): ReportRepository {
  type Ctx = Parameters<ReportRepository["list"]>[0];

  /** Sections live in their own table and are ordered by `ord`. */
  async function sectionsFor(ctx: Ctx, reportIds: string[]): Promise<Map<string, ImpactReportSection[]>> {
    const rows = await q.whereIn(ctx, "impact_report_sections", "report_id", reportIds);
    rows.sort((a, b) => numberFrom(a.ord) - numberFrom(b.ord));
    const by = new Map<string, ImpactReportSection[]>();
    for (const row of rows) {
      const key = String(row.report_id);
      const list = by.get(key) ?? [];
      list.push(mapSection(row));
      by.set(key, list);
    }
    return by;
  }

  async function loadReport(ctx: Ctx, id: string): Promise<ImpactReport | null> {
    const row = await q.maybeOne(ctx, "impact_reports", { id });
    if (!row) return null;
    const sections = await sectionsFor(ctx, [id]);
    return mapReport(row, sections.get(id) ?? []);
  }

  async function writeSections(
    ctx: Ctx,
    reportId: string,
    sections: ImpactReportSection[],
  ): Promise<void> {
    await q.remove(ctx, "impact_report_sections", { report_id: reportId });
    for (const [index, section] of sections.entries()) {
      await q.insert(
        ctx,
        "impact_report_sections",
        {
          reportId,
          key: section.key,
          title: section.title,
          type: section.type,
          content: section.content,
          claimIds: section.claimIds,
          provenance: section.provenance,
          ord: index,
        },
        { audit: false },
      );
    }
  }

  return {
    async list(ctx) {
      const rows = await q.many(ctx, "impact_reports", {}, {
        order: { column: "created_at", ascending: false },
        liveOnly: true,
      });
      const sections = await sectionsFor(ctx, rows.map((r) => String(r.id)));
      return rows.map((row) => mapReport(row, sections.get(String(row.id)) ?? []));
    },

    async get(ctx, id) {
      return loadReport(ctx, id);
    },

    async definitions(ctx) {
      const rows = await q.many(ctx, "report_definitions", {}, { liveOnly: true });
      return rows.map(mapDefinition);
    },

    async getDefinition(ctx, id) {
      const row = await q.maybeOne(ctx, "report_definitions", { id });
      return row ? mapDefinition(row) : null;
    },

    async requirements(ctx, definitionId) {
      const rows = await q.many(ctx, "report_requirements", { definition_id: definitionId }, {
        order: { column: "order" },
      });
      return rows.map(mapRequirement);
    },

    async saveDefinition(ctx, definition, requirements) {
      const existing = await q.maybeOne(ctx, "report_definitions", { id: definition.id });
      const columns = {
        name: definition.name,
        type: definition.type,
        sections: definition.sections,
        origin: definition.origin ?? "built_in",
        funderId: definition.funderId,
        sourceDocumentId: definition.sourceDocumentId,
      };
      if (existing) {
        await q.update(ctx, "report_definitions", definition.id, columns);
      } else {
        await q.insert(ctx, "report_definitions", { id: definition.id, ...columns });
      }
      // Requirements are owned by the template, so saving it replaces them
      // wholesale rather than merging: a requirement the funder removed must
      // disappear, and a merge would keep it.
      await q.remove(ctx, "report_requirements", { definition_id: definition.id });
      for (const requirement of requirements) {
        await q.insert(ctx, "report_requirements", requirementColumns(requirement), {
          audit: false,
        });
      }
    },

    async create(ctx, init) {
      const definitionRow = init.definitionId
        ? await q.maybeOne(ctx, "report_definitions", { id: init.definitionId })
        : null;
      const definition = definitionRow ? mapDefinition(definitionRow) : undefined;

      // Built by the same library the in-memory adapter uses, so a report
      // created against Postgres has the same sections as one created against
      // the store -- including the built-in template when no definition is named.
      const report = buildReportFromDefinition({
        id: crypto.randomUUID(),
        organisationId: ctx.organisationId,
        title: init.title,
        type: init.type,
        reportingPeriod: init.reportingPeriod,
        definition,
        programmeId: init.programmeId,
        grantId: init.grantId,
        ownerId: ctx.userId,
        includedIndicatorIds: init.includedIndicatorIds,
        includedEvidenceIds: init.includedEvidenceIds,
        now: ctx.now(),
      });

      await q.insert(ctx, "impact_reports", {
        id: report.id,
        title: report.title,
        type: report.type,
        definitionId: report.definitionId,
        programmeId: report.programmeId,
        grantId: report.grantId,
        reportingPeriod: report.reportingPeriod,
        status: report.status,
        ownerId: report.ownerId,
        contributorIds: report.contributorIds,
        reviewerIds: report.reviewerIds,
        approverIds: report.approverIds,
        includedIndicatorIds: report.includedIndicatorIds,
        includedEvidenceIds: report.includedEvidenceIds,
      });
      await writeSections(ctx, report.id, report.sections);

      await deps.audit.record(ctx, {
        action: "report.created",
        entityType: "impact_report",
        entityId: report.id,
        summary: `Created '${report.title}'${definition ? ` from the ${definition.name} template` : ""}`,
      });
      return report.id;
    },

    async versions(ctx, reportId) {
      const rows = await q.many(ctx, "report_versions", { report_id: reportId }, {
        order: { column: "version_number" },
      });
      return rows.map(mapVersion);
    },

    async getSnapshot(ctx, snapshotId) {
      const row = await q.maybeOne(ctx, "report_snapshots", { id: snapshotId });
      return row ? mapSnapshot(row) : null;
    },

    async cutVersion(ctx, reportId, reason, note) {
      const report = await loadReport(ctx, reportId);
      if (!report) return null;

      const now = ctx.now();
      const existing = await q.many(ctx, "report_versions", { report_id: reportId });
      const versionNumber = nextVersionNumber(existing.map(mapVersion));

      // Everything the snapshot pins is read at cut time, tenant-scoped. A
      // version whose figures re-resolve against live data is the exact
      // failure the snapshot exists to prevent.
      const [claims, indicatorRows, measurementRows, evidenceRows] = await Promise.all([
        deps.claims.list(ctx),
        q.many(ctx, "indicators"),
        q.many(ctx, "indicator_measurements"),
        q.many(ctx, "evidence_items"),
      ]);

      const snapshotId = crypto.randomUUID();
      const snapshot = buildReportSnapshot({
        id: snapshotId,
        report,
        claims,
        indicators: indicatorRows.map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          outcomeId: String(row.outcome_id),
          name: String(row.name),
          definition: String(row.definition ?? ""),
          baseline: numberFrom(row.baseline),
          target: numberFrom(row.target),
          currentValue: numberFrom(row.current_value),
          unit: String(row.unit ?? ""),
          measurementFrequency: String(row.measurement_frequency ?? ""),
          confidence: row.confidence as "low" | "medium" | "high",
          audit: auditFrom(row),
        })),
        measurements: measurementRows.map((row) => ({
          id: String(row.id),
          organisationId: String(row.organisation_id),
          indicatorId: String(row.indicator_id),
          value: numberFrom(row.value),
          recordedAt: String(row.recorded_at),
          ...(row.note ? { note: String(row.note) } : {}),
        })),
        evidence: evidenceRows.map(mapEvidence),
        takenAt: now,
      });

      const version = buildReportVersion({
        id: crypto.randomUUID(),
        report,
        versionNumber,
        reason,
        snapshotId: snapshot.id,
        note,
        createdBy: ctx.userId,
        createdAt: now,
      });
      snapshot.versionId = version.id;

      // The two rows reference each other, so neither can be written with its
      // pointer already set. The snapshot lands first without a version, the
      // version lands pointing at it, and the snapshot is then completed.
      //
      // The in-memory adapter assigned both pointers at once and was fine,
      // because nothing checked. Postgres has the foreign keys, which is the
      // better arrangement and the reason this ordering exists.
      await q.insert(
        ctx,
        "report_snapshots",
        {
          id: snapshot.id,
          reportId,
          takenAt: snapshot.takenAt,
          figures: snapshot.figures,
          evidenceIds: snapshot.evidenceIds,
          indicatorValues: snapshot.indicatorValues,
          claimIds: snapshot.claimIds,
        },
        { audit: false },
      );
      await q.insert(
        ctx,
        "report_versions",
        {
          id: version.id,
          reportId,
          versionNumber: version.versionNumber,
          reason: version.reason,
          status: version.status,
          sections: version.sections,
          snapshotId: snapshot.id,
          note: version.note,
          createdBy: ctx.userId,
          createdAt: version.createdAt,
        },
        { audit: false },
      );
      await q.update(
        ctx,
        "report_snapshots",
        snapshot.id,
        { versionId: version.id },
        { audit: false },
      );

      await deps.audit.record(ctx, {
        action: "report.version.cut",
        entityType: "impact_report",
        entityId: reportId,
        summary: `Cut version ${versionNumber} of '${report.title}' (${reason.replace(/_/g, " ")}), pinning ${snapshot.figures.length} figures`,
      });

      return version;
    },

    async contributors(ctx, reportId) {
      const rows = await q.many(ctx, "report_contributors", { report_id: reportId });
      return rows.map(mapContributor);
    },

    async addContributor(ctx, input) {
      const report = await q.maybeOne(ctx, "impact_reports", { id: input.reportId });
      if (!report) return null;
      // A contributor who is not a member of this organisation would be an
      // assignment nobody can act on, and a route to naming an outsider on a
      // tenant record. The in-memory adapter refuses it and so must this one.
      const member = await q.maybeOne(ctx, "organisation_members", { user_id: input.userId });
      if (!member) return null;
      const row = await q.insert(
        ctx,
        "report_contributors",
        {
          reportId: input.reportId,
          userId: input.userId,
          role: input.role,
          sectionKey: input.sectionKey,
          completedAt: input.completedAt,
          invitedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
      return String(row.id);
    },

    async approvals(ctx, reportId) {
      const rows = await q.many(ctx, "report_approvals", { report_id: reportId }, {
        order: { column: "decided_at" },
      });
      return rows.map(mapApproval);
    },

    async recordApproval(ctx, input) {
      const version = await q.maybeOne(ctx, "report_versions", { id: input.versionId });
      if (!version || String(version.report_id) !== input.reportId) return null;
      // An unexplained rejection is not actionable. Refused here and by a
      // check constraint in the schema, independently -- a rule enforced in
      // only one of the two is a rule that a direct write can walk past.
      if (input.decision === "changes_requested" && !input.comment?.trim()) return null;

      const row = await q.insert(
        ctx,
        "report_approvals",
        {
          reportId: input.reportId,
          versionId: input.versionId,
          userId: ctx.userId,
          decision: input.decision,
          comment: input.comment,
          decidedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
      return String(row.id);
    },

    async ingestions(ctx) {
      const rows = await q.many(ctx, "report_template_ingestions", {}, {
        order: { column: "created_at", ascending: false },
      });
      return rows.map(mapIngestion);
    },

    async getIngestion(ctx, id) {
      const row = await q.maybeOne(ctx, "report_template_ingestions", { id });
      return row ? mapIngestion(row) : null;
    },

    async saveIngestion(ctx, ingestion) {
      const existing = await q.maybeOne(ctx, "report_template_ingestions", { id: ingestion.id });
      const columns = {
        definitionId: ingestion.definitionId,
        documentId: ingestion.documentId,
        fileName: ingestion.fileName,
        funderId: ingestion.funderId,
        status: ingestion.status,
        candidates: ingestion.candidates,
        detectedDueDates: ingestion.detectedDueDates,
        notes: ingestion.notes,
        reviewedBy: ingestion.reviewedBy,
        reviewedAt: ingestion.reviewedAt,
      };
      if (existing) {
        await q.update(ctx, "report_template_ingestions", ingestion.id, columns, {
          audit: false,
        });
      } else {
        await q.insert(
          ctx,
          "report_template_ingestions",
          { id: ingestion.id, createdAt: ingestion.createdAt, ...columns },
          { audit: false },
        );
      }
    },

    async saveSection(ctx, reportId, sectionKey, content, provenance) {
      const row = await q.maybeOne(ctx, "impact_report_sections", {
        report_id: reportId,
        key: sectionKey,
      });
      if (!row) return;
      await q.update(
        ctx,
        "impact_report_sections",
        String(row.id),
        {
          content,
          // Provenance decides the citations. A section whose text came from a
          // generation grounded in claims cites exactly those claims, and
          // writing the text without them would leave the figures unresolvable
          // -- which is the whole property `claimIds` exists to provide.
          ...(provenance !== undefined
            ? {
                provenance,
                claimIds: provenance.used
                  .filter((ref) => ref.type === "claim")
                  .map((ref) => ref.id),
              }
            : {}),
        },
        { audit: false },
      );
    },

    async setStatus(ctx, reportId, status) {
      await q.update(ctx, "impact_reports", reportId, { status });
    },
  };
}
