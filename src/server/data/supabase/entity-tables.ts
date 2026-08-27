import type { EntityType } from "@/types/domain";

/**
 * Which table an addressable entity kind lives in.
 *
 * The Mission Graph lets a relation point at anything, so "does this entity
 * exist, and is it mine?" has to be answerable for any `EntityType`. This map
 * is how, and its own rule is that **a kind absent from it cannot be pointed
 * at** -- an unmapped kind fails the check rather than skipping it, which is
 * the safe direction. Adding a kind is therefore a deliberate line here rather
 * than a check somebody forgot.
 *
 * Mirrors ENTITY_TABLES in the in-memory adapter. The two must agree, and the
 * contract suite runs the same tenant-isolation tests against both.
 */
export const ENTITY_TABLES: Partial<Record<EntityType, string>> = {
  programme: "programmes",
  activity: "activities",
  output: "outputs",
  outcome: "outcomes",
  indicator: "indicators",
  indicator_measurement: "indicator_measurements",
  evidence: "evidence_items",
  grant: "grants",
  grant_deliverable: "grant_deliverables",
  grant_report: "grant_reports",
  funder: "funders",
  funding_opportunity: "funding_opportunities",
  application: "applications",
  application_answer: "application_answers",
  claim: "claims",
  relationship: "relationships",
  person: "people",
  external_organisation: "external_organisations",
  fund: "funds",
  transaction: "financial_transactions",
  allocation: "financial_allocations",
  budget: "budgets",
  budget_line: "budget_lines",
  strategic_priority: "strategic_priorities",
  reporting_requirement: "reporting_requirements",
  document: "documents",
  document_version: "document_versions",
  extracted_claim: "extracted_claims",
  onboarding_run: "onboarding_runs",
  impact_report: "impact_reports",
  report: "impact_reports",
  task: "tasks",
  commitment: "commitments",
  interaction: "interactions",
};
