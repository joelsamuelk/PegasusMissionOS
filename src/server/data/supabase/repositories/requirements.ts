import type { EntityReference, EvidenceType, ReportingRequirement } from "@/types/domain";
import type { RequirementRepository } from "../../types";
import { arrayFrom, auditFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

export function mapRequirement(row: Row): ReportingRequirement {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.grant_id ? { grantId: String(row.grant_id) } : {}),
    ...(row.opportunity_id ? { opportunityId: String(row.opportunity_id) } : {}),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    frequency: row.frequency as ReportingRequirement["frequency"],
    ...(row.due_date ? { dueDate: String(row.due_date) } : {}),
    evidenceTypes: arrayFrom(row.evidence_types) as EvidenceType[],
    // Set only when the requirement was taken from a funder document rather
    // than inferred, so the two are distinguishable on the readiness screen.
    ...(row.source_type && row.source_id
      ? {
          sourceRef: {
            type: row.source_type as EntityReference["type"],
            id: String(row.source_id),
          },
        }
      : {}),
    status: row.status as ReportingRequirement["status"],
    audit: auditFrom(row),
  };
}

export function createRequirementRepository(q: Query, deps: Deps): RequirementRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "reporting_requirements", {}, { liveOnly: true });
      return rows.map(mapRequirement);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "reporting_requirements", { id });
      return row ? mapRequirement(row) : null;
    },

    async forGrant(ctx, grantId) {
      const grant = await q.maybeOne(ctx, "grants", { id: grantId });
      if (!grant) return [];
      const rows = await q.many(ctx, "reporting_requirements", { grant_id: grantId });
      return rows.map(mapRequirement);
    },

    async requires(ctx, requirementId) {
      const requirement = await q.maybeOne(ctx, "reporting_requirements", { id: requirementId });
      if (!requirement) return [];
      // This is the method that turns "what did we promise this funder?" from
      // a search over free text into a traversal.
      const edges = await deps.graph.from(
        ctx,
        { type: "reporting_requirement", id: requirementId },
        "requires",
      );
      return edges.map((r) => r.to);
    },
  };
}
