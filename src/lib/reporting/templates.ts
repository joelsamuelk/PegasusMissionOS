import type { ReportSectionDefinition, ReportType } from "@/types/domain";

const section = (
  key: string,
  title: string,
  type: ReportSectionDefinition["type"] = "narrative",
  required = true,
): ReportSectionDefinition => ({ key, title, type, required });

const CORE = [
  section("executive_summary", "Executive summary"),
  section("outcomes", "Outcomes and progress", "metrics"),
  section("evidence", "Supporting evidence", "evidence"),
  section("learning", "Challenges and learning"),
  section("next_steps", "Next steps"),
] as const;

/** Built-in definitions. Organisations may clone and edit these later. */
export const REPORT_TEMPLATES: Record<ReportType, readonly ReportSectionDefinition[]> = {
  impact: CORE,
  funder: [
    section("grant_summary", "Grant summary", "claims"),
    section("delivery", "Delivery against plan", "metrics"),
    ...CORE.slice(2),
  ],
  grant: [
    section("award", "Award and conditions", "claims"),
    section("deliverables", "Deliverables", "table"),
    section("spend", "Financial position", "financial"),
    section("risks", "Risks and mitigations"),
  ],
  programme: [
    section("programme_summary", "Programme summary", "claims"),
    section("activities", "Activities and outputs", "metrics"),
    ...CORE.slice(1),
  ],
  trustee: [
    section("decision_summary", "Decisions required", "claims"),
    section("performance", "Performance", "metrics"),
    section("risk", "Risk and assurance", "table"),
  ],
  board_pack: [
    section("agenda", "Agenda"),
    section("chief_executive", "Chief executive update"),
    section("finance", "Finance", "financial"),
    section("programmes", "Programmes", "metrics"),
    section("decisions", "Decisions", "claims"),
  ],
  annual: [
    section("year_in_review", "Year in review"),
    section("impact", "Impact", "metrics"),
    section("stories", "Stories", "evidence"),
    section("finance", "Financial review", "financial"),
    section("governance", "Governance"),
  ],
  finance: [
    section("position", "Financial position", "financial"),
    section("budget_variance", "Budget variance", "table"),
    section("forecast", "Forecast", "chart"),
    section("funding_needs", "Funding needs", "claims"),
  ],
  management: [
    section("priorities", "Priorities", "claims"),
    section("performance", "Performance", "metrics"),
    section("people", "People and capacity", "table"),
    section("risks", "Risks and decisions", "claims"),
  ],
  donor_update: [
    section("opening", "Opening update"),
    section("difference", "The difference your support made", "metrics"),
    section("story", "A story from the work", "evidence"),
    section("next", "What happens next"),
  ],
  partner: [
    section("shared_work", "Shared work"),
    section("progress", "Progress", "metrics"),
    section("commitments", "Commitments and next steps", "table"),
  ],
  custom: [section("summary", "Summary")],
};
