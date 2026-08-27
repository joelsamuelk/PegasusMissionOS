import type { EvidenceItem } from "@/types/domain";
import type { EvidenceRepository } from "../../types";
import { arrayFrom, auditFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

export function mapEvidence(row: Row): EvidenceItem {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    type: row.type as EvidenceItem["type"],
    description: String(row.description ?? ""),
    verification: row.verification as EvidenceItem["verification"],
    ...(row.reporting_period ? { reportingPeriod: String(row.reporting_period) } : {}),
    ...(row.location ? { location: String(row.location) } : {}),
    ...(row.community ? { community: String(row.community) } : {}),
    ...(row.stat_value ? { statValue: String(row.stat_value) } : {}),
    ...(row.stat_label ? { statLabel: String(row.stat_label) } : {}),
    ...(row.quote ? { quote: String(row.quote) } : {}),
    ...(row.attribution ? { attribution: String(row.attribution) } : {}),
    ...(row.file_name ? { fileName: String(row.file_name) } : {}),
    ...(row.file_size_kb != null ? { fileSizeKb: optionalNumberFrom(row.file_size_kb) } : {}),
    tags: arrayFrom(row.tags),
    audit: auditFrom(row),
  };
}

export function createEvidenceRepository(q: Query, deps: Deps): EvidenceRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "evidence_items", {}, {
        order: { column: "created_at", ascending: false },
        liveOnly: true,
      });
      return rows.map(mapEvidence);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "evidence_items", { id });
      return row ? mapEvidence(row) : null;
    },

    async forTarget(ctx, targetType, targetId) {
      // The legacy link table, whose target enum stops at `outcome`. Retained
      // for the shipped call sites; new callers use `forEntity`.
      const links = await q.many(ctx, "evidence_links", {
        target_type: targetType,
        target_id: targetId,
      });
      const ids = [...new Set(links.map((l) => String(l.evidence_id)))];
      const rows = await q.whereIn(ctx, "evidence_items", "id", ids);
      return rows.map(mapEvidence);
    },

    async forEntity(ctx, entity) {
      // Evidence supporting any graph entity, through `evidences` relations.
      // This is the half `forTarget` could not reach: evidence could support
      // the ambition but not the number that establishes it.
      const edges = await deps.graph.to(ctx, entity, "evidences");
      const ids = edges.filter((r) => r.from.type === "evidence").map((r) => r.from.id);
      const rows = await q.whereIn(ctx, "evidence_items", "id", [...new Set(ids)]);
      return rows.map(mapEvidence);
    },

    async support(ctx, evidenceId, entity, note) {
      const item = await q.maybeOne(ctx, "evidence_items", { id: evidenceId });
      if (!item) return null;
      // Delegates rather than restating `graph.connect`'s two-endpoint tenant
      // check. Duplicating it is how one copy ends up weaker than the other.
      const relation = await deps.graph.connect(ctx, {
        from: { type: "evidence", id: String(item.id) },
        to: entity,
        kind: "evidences",
        ...(note !== undefined ? { note } : {}),
      });
      return relation?.id ?? null;
    },

    async add(ctx, item) {
      const row = await q.insert(ctx, "evidence_items", {
        title: item.title,
        type: item.type,
        description: item.description,
        verification: item.verification ?? "provided",
        tags: item.tags,
      });
      await deps.recordActivity(ctx, "added evidence", item.title);
      return String(row.id);
    },
  };
}
