import type {
  Activity,
  Indicator,
  IndicatorMeasurement,
  Outcome,
  Output,
  Programme,
} from "@/types/domain";
import type { ProgrammeRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import { mapGrant } from "./grants";
import type { Deps, Query } from "../query";

export function mapProgramme(row: Row): Programme {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    summary: String(row.summary ?? ""),
    status: row.status as Programme["status"],
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(row.start_date ? { startDate: String(row.start_date) } : {}),
    ...(row.end_date ? { endDate: String(row.end_date) } : {}),
    ...(row.location ? { location: String(row.location) } : {}),
    communitiesServed: arrayFrom(row.communities_served),
    ...(row.budget != null ? { budget: numberFrom(row.budget) } : {}),
    // The deprecated string arrays. Superseded by the Activity and Output
    // entities, and still read because the backfill is not complete.
    activities: arrayFrom(row.activities),
    outputs: arrayFrom(row.outputs),
    deliveryPartners: arrayFrom(row.delivery_partners),
    risks: arrayFrom(row.risks),
    audit: auditFrom(row),
  };
}

function mapOutcome(row: Row): Outcome {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    programmeId: String(row.programme_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    level: row.level as Outcome["level"],
    audit: auditFrom(row),
  };
}

function mapIndicator(row: Row): Indicator {
  return {
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
    ...(row.evidence_source ? { evidenceSource: String(row.evidence_source) } : {}),
    ...(row.data_owner_id ? { dataOwnerId: String(row.data_owner_id) } : {}),
    ...(row.last_updated ? { lastUpdated: String(row.last_updated) } : {}),
    confidence: row.confidence as Indicator["confidence"],
    audit: auditFrom(row),
  };
}

function mapMeasurement(row: Row): IndicatorMeasurement {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    indicatorId: String(row.indicator_id),
    value: numberFrom(row.value),
    recordedAt: String(row.recorded_at),
    ...(row.note ? { note: String(row.note) } : {}),
    ...(row.recorded_by ? { recordedBy: String(row.recorded_by) } : {}),
  };
}

function mapActivity(row: Row): Activity {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    programmeId: String(row.programme_id),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.start_date ? { startDate: String(row.start_date) } : {}),
    ...(row.end_date ? { endDate: String(row.end_date) } : {}),
    status: row.status as Activity["status"],
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(row.location ? { location: String(row.location) } : {}),
    audit: auditFrom(row),
  };
}

function mapOutput(row: Row): Output {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    programmeId: String(row.programme_id),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.unit ? { unit: String(row.unit) } : {}),
    ...(row.target_value != null ? { targetValue: optionalNumberFrom(row.target_value) } : {}),
    ...(row.current_value != null ? { currentValue: optionalNumberFrom(row.current_value) } : {}),
    ...(row.reporting_period ? { reportingPeriod: String(row.reporting_period) } : {}),
    audit: auditFrom(row),
  };
}

export function createProgrammeRepository(q: Query, deps: Deps): ProgrammeRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "programmes", {}, {
        order: { column: "created_at" },
        liveOnly: true,
      });
      return rows.map(mapProgramme);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "programmes", { id });
      return row ? mapProgramme(row) : null;
    },

    async outcomes(ctx, programmeId) {
      const rows = await q.many(ctx, "outcomes", { programme_id: programmeId });
      return rows.map(mapOutcome);
    },

    async indicatorsForOutcome(ctx, outcomeId) {
      const rows = await q.many(ctx, "indicators", { outcome_id: outcomeId });
      return rows.map(mapIndicator);
    },

    async indicatorsForProgramme(ctx, programmeId) {
      // Indicators hang off outcomes, not programmes, so the programme's
      // outcome ids are resolved first rather than denormalising a
      // programme_id onto the indicator.
      const outcomes = await q.many(ctx, "outcomes", { programme_id: programmeId });
      const ids = outcomes.map((o) => String(o.id));
      const rows = await q.whereIn(ctx, "indicators", "outcome_id", ids);
      return rows.map(mapIndicator);
    },

    async allIndicators(ctx) {
      const rows = await q.many(ctx, "indicators");
      return rows.map(mapIndicator);
    },

    async getIndicator(ctx, id) {
      const row = await q.maybeOne(ctx, "indicators", { id });
      return row ? mapIndicator(row) : null;
    },

    async activities(ctx, programmeId) {
      const rows = await q.many(ctx, "activities", { programme_id: programmeId }, {
        liveOnly: true,
      });
      return rows.map(mapActivity);
    },

    async getActivity(ctx, id) {
      const row = await q.maybeOne(ctx, "activities", { id });
      return row ? mapActivity(row) : null;
    },

    async outputs(ctx, programmeId) {
      const rows = await q.many(ctx, "outputs", { programme_id: programmeId }, {
        liveOnly: true,
      });
      return rows.map(mapOutput);
    },

    async getOutput(ctx, id) {
      const row = await q.maybeOne(ctx, "outputs", { id });
      return row ? mapOutput(row) : null;
    },

    async getOutcome(ctx, id) {
      const row = await q.maybeOne(ctx, "outcomes", { id });
      return row ? mapOutcome(row) : null;
    },

    async measurements(ctx, indicatorId) {
      const rows = await q.many(ctx, "indicator_measurements", { indicator_id: indicatorId }, {
        order: { column: "recorded_at" },
      });
      return rows.map(mapMeasurement);
    },

    async updateIndicator(ctx, indicatorId, value, note) {
      const row = await q.maybeOne(ctx, "indicators", { id: indicatorId });
      if (!row) return;
      const indicator = mapIndicator(row);

      await q.update(ctx, "indicators", indicatorId, {
        currentValue: value,
        lastUpdated: ctx.now().toISOString().slice(0, 10),
      });

      // Record the reading as well as the current value. Overwriting alone
      // loses the previous figure, and a report published against it can then
      // no longer resolve what it was written from.
      await q.insert(
        ctx,
        "indicator_measurements",
        {
          indicatorId,
          value,
          recordedAt: ctx.now().toISOString().slice(0, 10),
          note,
          recordedBy: ctx.userId,
        },
        { audit: false },
      );

      await deps.recordActivity(
        ctx,
        "updated indicator",
        `${indicator.name} (${value} ${indicator.unit})`,
      );
      await deps.audit.record(ctx, {
        action: "indicator.updated",
        entityType: "indicator",
        entityId: indicatorId,
        summary: `Updated '${indicator.name}' to ${value}${note ? ` (${note})` : ""}`,
      });
    },

    async grantsFor(ctx, programmeId) {
      // Programmes and grants are linked by their own table rather than by a
      // column on either side: a grant can fund several programmes and a
      // programme can be funded by several grants.
      const links = await q.many(ctx, "programme_grants", { programme_id: programmeId });
      const grantIds = links.map((l) => String(l.grant_id));
      const rows = await q.whereIn(ctx, "grants", "id", grantIds);
      return rows.map(mapGrant);
    },
  };
}
