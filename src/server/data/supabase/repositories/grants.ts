import type { Grant, GrantDeliverable, GrantPayment, GrantReport } from "@/types/domain";
import type { GrantRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapGrant(row: Row): Grant {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.application_id ? { applicationId: String(row.application_id) } : {}),
    funderId: String(row.funder_id),
    title: String(row.title),
    awardValue: numberFrom(row.award_value),
    currency: String(row.currency),
    restricted: Boolean(row.restricted),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    ...(row.grant_manager_id ? { grantManagerId: String(row.grant_manager_id) } : {}),
    ...(row.funder_contact ? { funderContact: String(row.funder_contact) } : {}),
    spentToDate: numberFrom(row.spent_to_date),
    conditions: arrayFrom(row.conditions),
    status: row.status as Grant["status"],
    audit: auditFrom(row),
  };
}

function mapPayment(row: Row): GrantPayment {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    organisationId: String(row.organisation_id),
    label: String(row.label),
    amount: numberFrom(row.amount),
    dueDate: String(row.due_date ?? ""),
    received: Boolean(row.received),
  };
}

function mapDeliverable(row: Row): GrantDeliverable {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    dueDate: String(row.due_date ?? ""),
    status: row.status as GrantDeliverable["status"],
  };
}

function mapReport(row: Row): GrantReport {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    dueDate: String(row.due_date ?? ""),
    status: row.status as GrantReport["status"],
  };
}

export function createGrantRepository(q: Query, _deps: Deps): GrantRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "grants", {}, {
        order: { column: "created_at" },
        liveOnly: true,
      });
      return rows.map(mapGrant);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "grants", { id });
      return row ? mapGrant(row) : null;
    },

    async payments(ctx, grantId) {
      const rows = await q.many(ctx, "grant_payments", { grant_id: grantId }, {
        order: { column: "due_date" },
      });
      return rows.map(mapPayment);
    },

    async deliverables(ctx, grantId) {
      const rows = await q.many(ctx, "grant_deliverables", { grant_id: grantId }, {
        order: { column: "due_date" },
      });
      return rows.map(mapDeliverable);
    },

    async reports(ctx, grantId) {
      const rows = await q.many(ctx, "grant_reports", { grant_id: grantId }, {
        order: { column: "due_date" },
      });
      return rows.map(mapReport);
    },

    async allReports(ctx) {
      const rows = await q.many(ctx, "grant_reports", {}, { order: { column: "due_date" } });
      return rows.map(mapReport);
    },
  };
}
