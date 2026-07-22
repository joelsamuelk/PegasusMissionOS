/**
 * In-memory data store for mock mode.
 *
 * Initialised from the seeded Northstar workspace. Mutations persist for the
 * lifetime of the running server process, which gives the demo real
 * interactivity (approving answers, updating indicators, generating reports)
 * without a database. When Supabase is configured, a parallel data-access
 * layer would replace these accessors; the query surface is intentionally
 * narrow and typed so that swap is contained.
 */

import type {
  ActivityEvent,
  AIGeneration,
  Application,
  ApplicationAnswer,
  AuditEvent,
  EvidenceItem,
  EvidenceLink,
  FitAssessment,
  Funder,
  FundingOpportunity,
  Grant,
  GrantDeliverable,
  GrantPayment,
  GrantReport,
  ImpactReport,
  Indicator,
  Notification,
  OpportunityQuestion,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  Outcome,
  Programme,
  ProgrammeGrantLink,
  Task,
  User,
} from "@/types/domain";
import * as seed from "./seed";

interface StoreState {
  users: User[];
  members: OrganisationMember[];
  organisation: Organisation;
  profile: OrganisationProfile;
  funders: Funder[];
  opportunities: FundingOpportunity[];
  opportunityQuestions: OpportunityQuestion[];
  applications: Application[];
  applicationAnswers: ApplicationAnswer[];
  grants: Grant[];
  grantPayments: GrantPayment[];
  grantDeliverables: GrantDeliverable[];
  grantReports: GrantReport[];
  programmes: Programme[];
  programmeGrantLinks: ProgrammeGrantLink[];
  outcomes: Outcome[];
  indicators: Indicator[];
  evidenceItems: EvidenceItem[];
  evidenceLinks: EvidenceLink[];
  tasks: Task[];
  notifications: Notification[];
  activity: ActivityEvent[];
  impactReports: ImpactReport[];
  auditEvents: AuditEvent[];
  fitAssessments: FitAssessment[];
  aiGenerations: AIGeneration[];
}

// Deep-ish clone so mutations do not mutate the frozen seed module.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Persist a single instance across hot reloads in development.
const globalRef = globalThis as unknown as { __pegasusStore?: StoreState };

function initState(): StoreState {
  return {
    users: clone(seed.users),
    members: clone(seed.members),
    organisation: clone(seed.organisation),
    profile: clone(seed.profile),
    funders: clone(seed.funders),
    opportunities: clone(seed.opportunities),
    opportunityQuestions: clone(seed.opportunityQuestions),
    applications: clone(seed.applications),
    applicationAnswers: clone(seed.applicationAnswers),
    grants: clone(seed.grants),
    grantPayments: clone(seed.grantPayments),
    grantDeliverables: clone(seed.grantDeliverables),
    grantReports: clone(seed.grantReports),
    programmes: clone(seed.programmes),
    programmeGrantLinks: clone(seed.programmeGrantLinks),
    outcomes: clone(seed.outcomes),
    indicators: clone(seed.indicators),
    evidenceItems: clone(seed.evidenceItems),
    evidenceLinks: clone(seed.evidenceLinks),
    tasks: clone(seed.tasks),
    notifications: clone(seed.notifications),
    activity: clone(seed.activity),
    impactReports: clone(seed.impactReports),
    auditEvents: clone(seed.auditEvents),
    fitAssessments: [],
    aiGenerations: [],
  };
}

export const store: StoreState = (globalRef.__pegasusStore ??= initState());

/** The single demo organisation for the mock workspace. */
export const DEMO_ORG_ID = "org-northstar";
export const CURRENT_USER_ID = "user-amara";

// --- Query helpers ------------------------------------------------------

export const q = {
  organisation: () => store.organisation,
  profile: () => store.profile,
  users: () => store.users,
  user: (id?: string) => store.users.find((u) => u.id === id),
  members: () => store.members,
  currentUser: () => store.users.find((u) => u.id === CURRENT_USER_ID)!,
  currentMember: () => store.members.find((m) => m.userId === CURRENT_USER_ID)!,

  funders: () => store.funders,
  funder: (id?: string) => store.funders.find((f) => f.id === id),

  opportunities: () => store.opportunities.filter((o) => !o.audit.archivedAt),
  opportunity: (id: string) => store.opportunities.find((o) => o.id === id),
  opportunityQuestions: (oppId: string) =>
    store.opportunityQuestions
      .filter((qn) => qn.opportunityId === oppId)
      .sort((a, b) => a.order - b.order),

  applications: () => store.applications.filter((a) => !a.audit.archivedAt),
  application: (id: string) => store.applications.find((a) => a.id === id),
  answers: (appId: string) =>
    store.applicationAnswers
      .filter((a) => a.applicationId === appId)
      .sort((a, b) => a.order - b.order),
  answer: (id: string) => store.applicationAnswers.find((a) => a.id === id),

  grants: () => store.grants.filter((g) => !g.audit.archivedAt),
  grant: (id: string) => store.grants.find((g) => g.id === id),
  grantPayments: (grantId: string) => store.grantPayments.filter((p) => p.grantId === grantId),
  grantDeliverables: (grantId: string) =>
    store.grantDeliverables.filter((d) => d.grantId === grantId),
  grantReports: (grantId: string) => store.grantReports.filter((r) => r.grantId === grantId),
  allGrantReports: () => store.grantReports,

  programmes: () => store.programmes.filter((p) => !p.audit.archivedAt),
  programme: (id: string) => store.programmes.find((p) => p.id === id),
  programmeGrants: (programmeId: string) =>
    store.programmeGrantLinks
      .filter((l) => l.programmeId === programmeId)
      .map((l) => store.grants.find((g) => g.id === l.grantId))
      .filter((g): g is Grant => Boolean(g)),
  outcomes: (programmeId: string) =>
    store.outcomes.filter((o) => o.programmeId === programmeId),
  indicators: (outcomeId: string) =>
    store.indicators.filter((i) => i.outcomeId === outcomeId),
  allIndicators: () => store.indicators,
  indicator: (id: string) => store.indicators.find((i) => i.id === id),
  programmeIndicators: (programmeId: string) => {
    const outcomeIds = store.outcomes
      .filter((o) => o.programmeId === programmeId)
      .map((o) => o.id);
    return store.indicators.filter((i) => outcomeIds.includes(i.outcomeId));
  },

  evidence: () => store.evidenceItems.filter((e) => !e.audit.archivedAt),
  evidenceItem: (id: string) => store.evidenceItems.find((e) => e.id === id),
  evidenceForTarget: (targetType: string, targetId: string) =>
    store.evidenceLinks
      .filter((l) => l.targetType === targetType && l.targetId === targetId)
      .map((l) => store.evidenceItems.find((e) => e.id === l.evidenceId))
      .filter((e): e is EvidenceItem => Boolean(e)),

  tasks: () => store.tasks,
  openTasks: () => store.tasks.filter((t) => t.status !== "done"),
  notifications: () => store.notifications,
  activity: () => [...store.activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  impactReports: () => store.impactReports,
  impactReport: (id: string) => store.impactReports.find((r) => r.id === id),

  auditEvents: () => [...store.auditEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  fitAssessment: (oppId: string) =>
    store.fitAssessments.find((f) => f.opportunityId === oppId),
};

// --- Mutations ----------------------------------------------------------

const NOW = "2026-07-21T10:00:00Z";

export function recordAiGeneration(
  gen: Omit<AIGeneration, "id" | "createdAt" | "organisationId">,
) {
  const record: AIGeneration = {
    ...gen,
    id: `ai-${store.aiGenerations.length + 1}`,
    organisationId: DEMO_ORG_ID,
    createdAt: NOW,
  };
  store.aiGenerations.push(record);
  recordAudit({
    actorId: gen.userId,
    actorName: q.user(gen.userId)?.name ?? "A team member",
    action: "ai.generation.created",
    entityType: "ai_generation",
    entityId: record.id,
    summary: `AI ${gen.feature} generated with ${gen.model}`,
  });
  return record;
}

export function recordAudit(event: Omit<AuditEvent, "id" | "createdAt" | "organisationId">) {
  store.auditEvents.push({
    ...event,
    id: `aud-${store.auditEvents.length + 1}`,
    organisationId: DEMO_ORG_ID,
    createdAt: NOW,
  });
}

function recordActivity(verb: string, target: string) {
  const user = q.currentUser();
  store.activity.unshift({
    id: `act-${store.activity.length + 1}`,
    organisationId: DEMO_ORG_ID,
    actorId: user.id,
    actorName: user.name,
    verb,
    target,
    createdAt: NOW,
  });
}

export const mutate = {
  saveAnswer(answerId: string, draft: string, provenance?: ApplicationAnswer["provenance"]) {
    const answer = store.applicationAnswers.find((a) => a.id === answerId);
    if (!answer) return;
    answer.draft = draft;
    if (provenance) answer.provenance = provenance;
    if (answer.status === "not_started" || answer.status === "approved") {
      answer.status = "drafting";
    }
    answer.audit.updatedAt = NOW;
  },

  setAnswerStatus(answerId: string, status: ApplicationAnswer["status"]) {
    const answer = store.applicationAnswers.find((a) => a.id === answerId);
    if (!answer) return;
    answer.status = status;
    answer.audit.updatedAt = NOW;
    if (status === "approved") {
      recordActivity("approved answer", answer.questionText);
      recordAudit({
        actorId: q.currentUser().id,
        actorName: q.currentUser().name,
        action: "application.answer.approved",
        entityType: "application_answer",
        entityId: answerId,
        summary: `Approved answer: ${answer.questionText.slice(0, 60)}`,
      });
    }
  },

  updateIndicator(indicatorId: string, currentValue: number, note?: string) {
    const indicator = store.indicators.find((i) => i.id === indicatorId);
    if (!indicator) return;
    indicator.currentValue = currentValue;
    indicator.lastUpdated = "2026-07-21";
    indicator.audit.updatedAt = NOW;
    recordActivity("updated indicator", `${indicator.name} (${currentValue} ${indicator.unit})`);
    recordAudit({
      actorId: q.currentUser().id,
      actorName: q.currentUser().name,
      action: "indicator.updated",
      entityType: "indicator",
      entityId: indicatorId,
      summary: `Updated '${indicator.name}' to ${currentValue}${note ? ` (${note})` : ""}`,
    });
  },

  moveOpportunityStage(oppId: string, stage: FundingOpportunity["stage"]) {
    const opp = store.opportunities.find((o) => o.id === oppId);
    if (!opp) return;
    opp.stage = stage;
    opp.audit.updatedAt = NOW;
    recordActivity("moved opportunity to", `${opp.programmeName}: ${stage.replace(/_/g, " ")}`);
  },

  toggleSaved(oppId: string) {
    const opp = store.opportunities.find((o) => o.id === oppId);
    if (!opp) return;
    opp.saved = !opp.saved;
    opp.audit.updatedAt = NOW;
  },

  saveFitAssessment(assessment: FitAssessment) {
    const idx = store.fitAssessments.findIndex(
      (f) => f.opportunityId === assessment.opportunityId,
    );
    if (idx >= 0) store.fitAssessments[idx] = assessment;
    else store.fitAssessments.push(assessment);
  },

  convertApplicationToGrant(applicationId: string): string | null {
    const app = store.applications.find((a) => a.id === applicationId);
    if (!app) return null;
    const opp = store.opportunities.find((o) => o.id === app.opportunityId);
    if (!opp) return null;
    app.status = "successful";
    app.audit.updatedAt = NOW;
    const grantId = `grant-${opp.funderId}-${store.grants.length + 1}`;
    store.grants.push({
      id: grantId,
      organisationId: DEMO_ORG_ID,
      applicationId,
      funderId: opp.funderId,
      title: app.title.replace(/application/i, "grant"),
      awardValue: opp.maxAward ?? opp.minAward ?? 0,
      currency: opp.currency,
      restricted: opp.fundingType === "restricted" || opp.fundingType === "project",
      startDate: "2026-08-01",
      endDate: "2027-07-31",
      grantManagerId: app.ownerId,
      funderContact: q.funder(opp.funderId)?.contactName,
      spentToDate: 0,
      conditions: opp.reportingRequirements,
      status: "active",
      audit: { createdAt: NOW, updatedAt: NOW, createdBy: q.currentUser().id, archivedAt: null },
    });
    // First report due three months in.
    store.grantReports.push({
      id: `rep-${store.grantReports.length + 1}`,
      grantId,
      organisationId: DEMO_ORG_ID,
      title: "First progress report",
      dueDate: "2026-11-01",
      status: "not_started",
    });
    recordActivity("converted application to grant", app.title);
    recordAudit({
      actorId: q.currentUser().id,
      actorName: q.currentUser().name,
      action: "grant.created",
      entityType: "grant",
      entityId: grantId,
      summary: `Converted successful application '${app.title}' into an active grant`,
    });
    return grantId;
  },

  saveReportSection(reportId: string, key: string, content: string, provenance?: ImpactReport["sections"][number]["provenance"]) {
    const report = store.impactReports.find((r) => r.id === reportId);
    if (!report) return;
    const section = report.sections.find((s) => s.key === key);
    if (!section) return;
    section.content = content;
    if (provenance) section.provenance = provenance;
    report.audit.updatedAt = NOW;
  },

  setReportStatus(reportId: string, status: ImpactReport["status"]) {
    const report = store.impactReports.find((r) => r.id === reportId);
    if (!report) return;
    report.status = status;
    report.audit.updatedAt = NOW;
    if (status === "approved") {
      recordAudit({
        actorId: q.currentUser().id,
        actorName: q.currentUser().name,
        action: "report.approved",
        entityType: "impact_report",
        entityId: reportId,
        summary: `Approved impact report '${report.title}'`,
      });
    }
  },

  toggleTask(taskId: string) {
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = task.status === "done" ? "todo" : "done";
    task.audit.updatedAt = NOW;
  },

  setAiEnabled(enabled: boolean) {
    store.organisation.aiEnabled = enabled;
    store.organisation.audit.updatedAt = NOW;
    recordAudit({
      actorId: q.currentUser().id,
      actorName: q.currentUser().name,
      action: "organisation.ai_setting.changed",
      entityType: "organisation",
      entityId: store.organisation.id,
      summary: `AI assistance ${enabled ? "enabled" : "disabled"} for the workspace`,
    });
  },

  addEvidence(item: Omit<EvidenceItem, "id" | "organisationId" | "audit">) {
    const id = `ev-${store.evidenceItems.length + 1}`;
    store.evidenceItems.push({
      ...item,
      id,
      organisationId: DEMO_ORG_ID,
      audit: { createdAt: NOW, updatedAt: NOW, createdBy: q.currentUser().id, archivedAt: null },
    });
    recordActivity("added evidence", item.title);
    return id;
  },
};
