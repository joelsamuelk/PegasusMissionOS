import type {
  FitAssessment,
  FitFactor,
  Funder,
  FundingOpportunity,
  OpportunityQuestion,
} from "@/types/domain";
import type { FundingRepository } from "../../types";
import {
  arrayFrom,
  auditFrom,
  numberFrom,
  optionalNumberFrom,
  type Row,
} from "../mapping";
import type { Deps, Query } from "../query";

function mapOpportunity(row: Row): FundingOpportunity {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    funderId: String(row.funder_id),
    programmeName: String(row.programme_name),
    description: String(row.description ?? ""),
    // `minAward` and `maxAward` are numeric: PostgREST hands them back as
    // strings once they exceed exact float representation, and an award value
    // is exactly the sort of number that does.
    ...(row.min_award != null ? { minAward: numberFrom(row.min_award) } : {}),
    ...(row.max_award != null ? { maxAward: numberFrom(row.max_award) } : {}),
    currency: String(row.currency),
    ...(row.deadline ? { deadline: String(row.deadline) } : {}),
    ...(row.funding_duration_months != null
      ? { fundingDurationMonths: optionalNumberFrom(row.funding_duration_months) }
      : {}),
    fundingType: row.funding_type as FundingOpportunity["fundingType"],
    eligibleOrgTypes: arrayFrom(row.eligible_org_types) as FundingOpportunity["eligibleOrgTypes"],
    eligibleLocations: arrayFrom(row.eligible_locations),
    priorityThemes: arrayFrom(row.priority_themes),
    requiredDocuments: arrayFrom(row.required_documents),
    reportingRequirements: arrayFrom(row.reporting_requirements),
    ...(row.source_reference ? { sourceReference: String(row.source_reference) } : {}),
    ...(row.last_verified_at ? { lastVerifiedAt: String(row.last_verified_at) } : {}),
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    stage: row.stage as FundingOpportunity["stage"],
    probability: numberFrom(row.probability),
    ...(row.next_action ? { nextAction: String(row.next_action) } : {}),
    saved: Boolean(row.saved),
    isDemo: Boolean(row.is_demo),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    audit: auditFrom(row),
  };
}

function mapFunder(row: Row): Funder {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    type: String(row.type ?? ""),
    ...(row.website ? { website: String(row.website) } : {}),
    ...(row.contact_name ? { contactName: String(row.contact_name) } : {}),
    ...(row.contact_email ? { contactEmail: String(row.contact_email) } : {}),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    isDemo: Boolean(row.is_demo),
  };
}

function mapQuestion(row: Row): OpportunityQuestion {
  return {
    id: String(row.id),
    opportunityId: String(row.opportunity_id),
    organisationId: String(row.organisation_id),
    // `order` is a reserved word in SQL, so the column is `ord`.
    order: numberFrom(row.ord),
    text: String(row.text),
    ...(row.guidance ? { guidance: String(row.guidance) } : {}),
    ...(row.word_limit != null ? { wordLimit: optionalNumberFrom(row.word_limit) } : {}),
    ...(row.char_limit != null ? { charLimit: optionalNumberFrom(row.char_limit) } : {}),
  };
}

function mapFactor(row: Row): FitFactor {
  return {
    key: String(row.key),
    label: String(row.label),
    status: row.status as FitFactor["status"],
    score: numberFrom(row.score),
    weight: numberFrom(row.weight),
    rationale: String(row.rationale ?? ""),
    evidenceUsed: arrayFrom(row.evidence_used),
    assumptions: arrayFrom(row.assumptions),
  };
}

function mapAssessment(row: Row, factors: FitFactor[]): FitAssessment {
  return {
    id: String(row.id),
    opportunityId: String(row.opportunity_id),
    organisationId: String(row.organisation_id),
    overallScore: numberFrom(row.overall_score),
    category: row.category as FitAssessment["category"],
    eligibilityStatus: row.eligibility_status as FitAssessment["eligibilityStatus"],
    factors,
    keyRisks: arrayFrom(row.key_risks),
    missingInformation: arrayFrom(row.missing_information),
    recommendedNextAction: String(row.recommended_next_action ?? ""),
    effortEstimate: row.effort_estimate as FitAssessment["effortEstimate"],
    strategicValue: row.strategic_value as FitAssessment["strategicValue"],
    generatedAt: String(row.generated_at),
    generatedBy: row.generated_by as FitAssessment["generatedBy"],
  };
}

export function createFundingRepository(q: Query, deps: Deps): FundingRepository {
  return {
    async listOpportunities(ctx) {
      const rows = await q.many(ctx, "funding_opportunities", {}, { order: { column: "created_at" }, liveOnly: true });
      return rows.map(mapOpportunity);
    },

    async getOpportunity(ctx, id) {
      const row = await q.maybeOne(ctx, "funding_opportunities", { id });
      return row ? mapOpportunity(row) : null;
    },

    async opportunityQuestions(ctx, opportunityId) {
      const rows = await q.many(
        ctx,
        "opportunity_questions",
        { opportunity_id: opportunityId },
        { order: { column: "ord" } },
      );
      return rows.map(mapQuestion);
    },

    async listFunders(ctx) {
      const rows = await q.many(ctx, "funders", {}, { order: { column: "name" } });
      return rows.map(mapFunder);
    },

    async getFunder(ctx, id) {
      const row = await q.maybeOne(ctx, "funders", { id });
      return row ? mapFunder(row) : null;
    },

    async moveStage(ctx, id, stage) {
      const before = await q.maybeOne(ctx, "funding_opportunities", { id });
      if (!before) return;
      const updated = await q.update(ctx, "funding_opportunities", id, { stage });
      if (!updated) return;
      await deps.audit.record(ctx, {
        action: "funding_opportunity.stage.changed",
        entityType: "funding_opportunity",
        entityId: id,
        summary: `Moved from ${String(before.stage)} to ${stage}`,
      });
    },

    async toggleSaved(ctx, id) {
      const row = await q.maybeOne(ctx, "funding_opportunities", { id });
      if (!row) return;
      await q.update(ctx, "funding_opportunities", id, { saved: !row.saved });
    },

    async getFitAssessment(ctx, opportunityId) {
      const row = await q.maybeOne(ctx, "fit_assessments", { opportunity_id: opportunityId });
      if (!row) return null;
      const factors = await q.many(ctx, "fit_assessment_factors", {
        assessment_id: String(row.id),
      });
      return mapAssessment(row, factors.map(mapFactor));
    },

    async saveFitAssessment(ctx, assessment) {
      // An assessment replaces its predecessor rather than accumulating: it is
      // a current judgement about an opportunity, not a history of judgements.
      // The factor rows go with it, which is why they are deleted by
      // assessment id before the parent row is removed.
      const existing = await q.many(ctx, "fit_assessments", {
        opportunity_id: assessment.opportunityId,
      });
      for (const previous of existing) {
        await q.remove(ctx, "fit_assessment_factors", { assessment_id: String(previous.id) });
      }
      await q.remove(ctx, "fit_assessments", { opportunity_id: assessment.opportunityId });

      const row = await q.insert(
        ctx,
        "fit_assessments",
        {
          id: assessment.id,
          opportunityId: assessment.opportunityId,
          overallScore: assessment.overallScore,
          category: assessment.category,
          eligibilityStatus: assessment.eligibilityStatus,
          keyRisks: assessment.keyRisks,
          missingInformation: assessment.missingInformation,
          recommendedNextAction: assessment.recommendedNextAction,
          effortEstimate: assessment.effortEstimate,
          strategicValue: assessment.strategicValue,
          generatedAt: assessment.generatedAt,
          generatedBy: assessment.generatedBy,
        },
        { audit: false },
      );

      for (const factor of assessment.factors) {
        await q.insert(
          ctx,
          "fit_assessment_factors",
          {
            assessmentId: String(row.id),
            key: factor.key,
            label: factor.label,
            status: factor.status,
            score: factor.score,
            weight: factor.weight,
            rationale: factor.rationale,
            evidenceUsed: factor.evidenceUsed,
            assumptions: factor.assumptions,
          },
          { audit: false },
        );
      }
    },
  };
}
