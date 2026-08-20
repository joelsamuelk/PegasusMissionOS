import type { StrategicPriority } from "@/types/domain";
import type { StrategyRepository } from "../../types";
import { auditFrom, numberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";
import { mapProgramme } from "./programmes";

function mapPriority(row: Row): StrategicPriority {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.period_label ? { periodLabel: String(row.period_label) } : {}),
    // `order` is reserved in SQL; the column is `display_order`.
    order: numberFrom(row.display_order),
    status: row.status as StrategicPriority["status"],
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(row.claim_id ? { claimId: String(row.claim_id) } : {}),
    audit: auditFrom(row),
  };
}

export function createStrategyRepository(q: Query, deps: Deps): StrategyRepository {
  return {
    async priorities(ctx) {
      const rows = await q.many(ctx, "strategic_priorities", {}, {
        order: { column: "display_order" },
      });
      return rows.map(mapPriority);
    },

    async getPriority(ctx, id) {
      const row = await q.maybeOne(ctx, "strategic_priorities", { id });
      return row ? mapPriority(row) : null;
    },

    async programmesFor(ctx, priorityId) {
      const priority = await q.maybeOne(ctx, "strategic_priorities", { id: priorityId });
      if (!priority) return [];
      // What a priority pursues is an edge, not a column. That is the point of
      // the strategy layer: a programme can serve several priorities, and a
      // priority is pursued by several programmes.
      const edges = await deps.graph.from(
        ctx,
        { type: "strategic_priority", id: priorityId },
        "pursues",
      );
      const programmeIds = edges.filter((r) => r.to.type === "programme").map((r) => r.to.id);
      const rows = await q.whereIn(ctx, "programmes", "id", programmeIds);
      return rows.map(mapProgramme);
    },
  };
}
