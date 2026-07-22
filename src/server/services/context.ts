import type { AiContext } from "@/lib/ai";
import { deadlineInfo, formatCurrency } from "@/lib/formatting";
import { indicatorProgress } from "@/lib/logic/progress";
import { q } from "@/features/store";

/**
 * Builds grounded AI context from the store. Only approved organisation data
 * and selected evidence are included, in line with the product policy.
 */

function profileFields(): { label: string; value: string }[] {
  const p = q.profile();
  const asString = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));
  return [
    { label: "Mission statement", value: asString(p.missionStatement.value) },
    { label: "Communities served", value: asString(p.communitiesServed.value) },
    { label: "Core activities", value: asString(p.coreActivities.value) },
    { label: "Strategic priorities", value: asString(p.strategicPriorities.value) },
    { label: "Geographic reach", value: asString(p.geographicReach.value) },
  ];
}

function evidenceSummaries(evidenceIds: string[]): { title: string; summary: string }[] {
  return evidenceIds
    .map((id) => q.evidenceItem(id))
    .filter(Boolean)
    .map((e) => ({
      title: e!.title,
      summary:
        e!.quote ??
        (e!.statValue ? `${e!.statValue} ${e!.statLabel ?? ""}`.trim() : e!.description),
    }));
}

export function buildAnswerContext(answerId: string): AiContext {
  const answer = q.answer(answerId);
  const org = q.organisation();
  const app = answer ? q.application(answer.applicationId) : undefined;
  const opp = app ? q.opportunity(app.opportunityId) : undefined;

  // Programme data available for grounding: indicators across active programmes.
  const programmeData = q
    .allIndicators()
    .slice(0, 4)
    .map((i) => ({
      label: i.name,
      value: `${i.currentValue}${i.unit === "%" ? "%" : ` ${i.unit}`} of ${i.target} target (${indicatorProgress(i)}% to target)`,
    }));

  return {
    organisationName: org.name,
    profileFields: profileFields(),
    evidence: evidenceSummaries(answer?.evidenceIds ?? []),
    programmeData,
    question: answer?.questionText,
    guidance: answer?.guidance,
    priorityThemes: opp?.priorityThemes,
    wordLimit: answer?.wordLimit,
    draft: answer?.draft,
  };
}

export function buildReportSectionContext(reportId: string, sectionKey: string): AiContext {
  const report = q.impactReport(reportId);
  const org = q.organisation();
  const programme = report?.programmeId ? q.programme(report.programmeId) : undefined;
  const section = report?.sections.find((s) => s.key === sectionKey);

  const indicators = (report?.includedIndicatorIds ?? [])
    .map((id) => q.indicator(id))
    .filter(Boolean)
    .map((i) => ({
      label: i!.name,
      value: `${i!.currentValue}${i!.unit === "%" ? "%" : ` ${i!.unit}`} of ${i!.target} target`,
    }));

  const outputs = programme
    ? programme.outputs.map((o, idx) => ({ label: `Output ${idx + 1}`, value: o }))
    : [];

  return {
    organisationName: org.name,
    profileFields: profileFields(),
    evidence: evidenceSummaries(report?.includedEvidenceIds ?? []),
    programmeData: sectionKey === "outputs" ? outputs : indicators,
    sectionKey,
    sectionTitle: section?.title,
  };
}

export function buildCommandContext(query: string): AiContext {
  const org = q.organisation();
  const opportunities = q.opportunities();
  const applications = q.applications();
  const grants = q.grants();

  const pipelineValue = opportunities
    .filter((o) => !["unsuccessful", "archived"].includes(o.stage))
    .reduce((sum, o) => sum + (o.maxAward ?? 0), 0);

  const facts: { label: string; value: string }[] = [
    { label: "Pipeline value", value: formatCurrency(pipelineValue) },
    { label: "Applications in progress", value: String(applications.filter((a) => a.status === "in_progress" || a.status === "internal_review").length) },
    { label: "Active grants", value: String(grants.filter((g) => g.status === "active").length) },
  ];

  // Deadlines
  opportunities
    .filter((o) => o.deadline)
    .map((o) => ({ o, info: deadlineInfo(o.deadline, new Date("2026-07-21")) }))
    .filter((x) => x.info.days >= 0 && x.info.days <= 45)
    .sort((a, b) => a.info.days - b.info.days)
    .forEach((x) =>
      facts.push({
        label: `Deadline: ${x.o.programmeName}`,
        value: x.info.label,
      }),
    );

  // Grant reports due
  q.allGrantReports()
    .filter((r) => r.status !== "submitted")
    .forEach((r) =>
      facts.push({
        label: `Report due: ${r.title}`,
        value: deadlineInfo(r.dueDate, new Date("2026-07-21")).label,
      }),
    );

  return {
    organisationName: org.name,
    profileFields: [],
    evidence: [],
    programmeData: facts,
    query,
  };
}

export function buildPipelineContext(): AiContext {
  const org = q.organisation();
  const opps = q.opportunities();
  const byStage = new Map<string, number>();
  opps.forEach((o) => byStage.set(o.stage, (byStage.get(o.stage) ?? 0) + 1));
  const value = opps
    .filter((o) => !["unsuccessful", "archived"].includes(o.stage))
    .reduce((s, o) => s + (o.maxAward ?? 0), 0);
  const facts = [
    { label: "Total pipeline value", value: formatCurrency(value) },
    { label: "Opportunities tracked", value: String(opps.length) },
    ...Array.from(byStage.entries()).map(([stage, n]) => ({
      label: `In ${stage.replace(/_/g, " ")}`,
      value: String(n),
    })),
  ];
  return {
    organisationName: org.name,
    profileFields: [],
    evidence: [],
    programmeData: facts,
  };
}
