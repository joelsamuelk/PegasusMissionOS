import type { Application, ApplicationAnswer, GroundingRecord } from "@/types/domain";
import type { ApplicationRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapApplication(row: Row): Application {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    opportunityId: String(row.opportunity_id),
    title: String(row.title),
    status: row.status as Application["status"],
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    contributorIds: arrayFrom(row.contributor_ids),
    reviewerIds: arrayFrom(row.reviewer_ids),
    ...(row.deadline ? { deadline: String(row.deadline) } : {}),
    requiredDocuments: (row.required_documents ?? []) as Application["requiredDocuments"],
    submissionChecklist: (row.submission_checklist ?? []) as Application["submissionChecklist"],
    ...(row.notes ? { notes: String(row.notes) } : {}),
    audit: auditFrom(row),
  };
}

function mapAnswer(row: Row): ApplicationAnswer {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    organisationId: String(row.organisation_id),
    order: numberFrom(row.ord),
    questionText: String(row.question_text),
    ...(row.guidance ? { guidance: String(row.guidance) } : {}),
    ...(row.word_limit != null ? { wordLimit: optionalNumberFrom(row.word_limit) } : {}),
    draft: String(row.draft ?? ""),
    status: row.status as ApplicationAnswer["status"],
    ...(row.assigned_to ? { assignedTo: String(row.assigned_to) } : {}),
    evidenceIds: arrayFrom(row.evidence_ids),
    ...(row.provenance ? { provenance: row.provenance as GroundingRecord } : {}),
    audit: auditFrom(row),
  };
}

export function createApplicationRepository(q: Query, deps: Deps): ApplicationRepository {
  return {
    async list(ctx) {
      const rows = await q.many(ctx, "applications", {}, {
        order: { column: "created_at" },
        liveOnly: true,
      });
      return rows.map(mapApplication);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "applications", { id });
      return row ? mapApplication(row) : null;
    },

    async answers(ctx, applicationId) {
      const rows = await q.many(
        ctx,
        "application_answers",
        { application_id: applicationId },
        { order: { column: "ord" } },
      );
      return rows.map(mapAnswer);
    },

    async getAnswer(ctx, answerId) {
      const row = await q.maybeOne(ctx, "application_answers", { id: answerId });
      return row ? mapAnswer(row) : null;
    },

    async saveAnswer(ctx, answerId, draft, provenance) {
      // `provenance` is only written when supplied. A manual edit after an AI
      // assist must not silently keep claiming the text was grounded in what
      // the model was given, but neither should an ordinary save erase a
      // record that is still accurate -- so the caller decides, and passing
      // nothing leaves the existing record alone.
      await q.update(ctx, "application_answers", answerId, {
        draft,
        ...(provenance !== undefined ? { provenance } : {}),
      });
    },

    async setAnswerStatus(ctx, answerId, status) {
      await q.update(ctx, "application_answers", answerId, { status });
    },

    async convertToGrant(ctx, applicationId) {
      const app = await q.maybeOne(ctx, "applications", { id: applicationId });
      if (!app) return null;
      const opp = await q.maybeOne(ctx, "funding_opportunities", {
        id: String(app.opportunity_id),
      });
      if (!opp) return null;

      await q.update(ctx, "applications", applicationId, { status: "successful" });

      const funder = await q.maybeOne(ctx, "funders", { id: String(opp.funder_id) });
      const fundingType = String(opp.funding_type);
      const grant = await q.insert(ctx, "grants", {
        applicationId,
        funderId: String(opp.funder_id),
        title: String(app.title).replace(/application/i, "grant"),
        awardValue: numberFrom(opp.max_award ?? opp.min_award, 0),
        currency: String(opp.currency),
        restricted: fundingType === "restricted" || fundingType === "project",
        startDate: "2026-08-01",
        endDate: "2027-07-31",
        grantManagerId: app.owner_id ?? undefined,
        funderContact: funder?.contact_name ?? undefined,
        spentToDate: 0,
        conditions: arrayFrom(opp.reporting_requirements),
        status: "active",
      });
      const grantId = String(grant.id);

      await q.insert(
        ctx,
        "grant_reports",
        {
          grantId,
          title: "First progress report",
          dueDate: "2026-11-01",
          status: "not_started",
        },
        { audit: false },
      );

      await deps.recordActivity(ctx, "converted application to grant", String(app.title));
      await deps.audit.record(ctx, {
        action: "grant.created",
        entityType: "grant",
        entityId: grantId,
        summary: `Converted successful application '${String(app.title)}' into an active grant`,
      });
      return grantId;
    },
  };
}
