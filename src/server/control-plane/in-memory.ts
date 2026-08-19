import type { ControlRepository } from "./repository";
import type { ActivationCriterion, ActivationSnapshot, AiOperationTrace, ContactCompliance, ControlFeatureFlag, ControlFeatureTarget, CustomerAccount, CustomerConversion, CustomerFeedback, CustomerHealthSnapshot, CustomerMetadataProjection, CustomerValueEvent, InternalTask, InternalUser, OnboardingPlan, OnboardingStep, OutreachSendRequest, OutreachSequence, OutreachTemplate, PrivacySafeUsageEvent, ProspectFact, ProspectOrganisation, ProspectPerson, ProspectQualification, ProspectResearchSource, ProvisioningRun, SalesOpportunity, SequenceEnrollment, SequenceStep, StoredInternalAuditEvent, SupportAccessEvent, SupportAccessSession, SystemComponentStatus } from "./types";

export interface ControlMemoryState {
  users: InternalUser[];
  audit: StoredInternalAuditEvent[];
  prospects: ProspectOrganisation[];
  prospectPeople: ProspectPerson[];
  prospectSources: ProspectResearchSource[];
  prospectFacts: ProspectFact[];
  salesOpportunities: SalesOpportunity[]; prospectQualifications: ProspectQualification[]; internalTasks: InternalTask[];
  outreachTemplates:OutreachTemplate[];outreachSequences:OutreachSequence[];sequenceSteps:SequenceStep[];sequenceEnrollments:SequenceEnrollment[];contactCompliance:ContactCompliance[];outreachSendRequests:OutreachSendRequest[];
  customerAccounts:CustomerAccount[];customerConversions:CustomerConversion[];provisioningRuns:ProvisioningRun[];
  onboardingPlans:OnboardingPlan[];onboardingSteps:OnboardingStep[];activationCriteria:ActivationCriterion[];customerValueEvents:CustomerValueEvent[];activationSnapshots:ActivationSnapshot[];
  customerMetadata:CustomerMetadataProjection[];customerHealthSnapshots:CustomerHealthSnapshot[];
  supportSessions:SupportAccessSession[];supportAccessEvents:SupportAccessEvent[];
  usageEvents:PrivacySafeUsageEvent[];customerFeedback:CustomerFeedback[];
  featureFlags:ControlFeatureFlag[];featureTargets:ControlFeatureTarget[];aiTraces:AiOperationTrace[];systemStatuses:SystemComponentStatus[];
}

export function createInMemoryControlRepository(state: ControlMemoryState): ControlRepository {
  return {
    name: "in-memory",
    users: {
      async current(ctx) {
        return state.users.find((user) => user.id === ctx.internalUserId) ?? null;
      },
      async list() {
        return state.users.map((user) => ({ ...user }));
      },
      async changeRole(ctx, id, role, event) {
        const user = state.users.find((candidate) => candidate.id === id);
        if (!user) throw new Error("Internal user not found.");
        user.role = role;
        user.updatedAt = ctx.now().toISOString();
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
      async changeStatus(ctx, id, status, event) {
        const user = state.users.find((candidate) => candidate.id === id);
        if (!user) throw new Error("Internal user not found.");
        user.status = status;
        user.updatedAt = ctx.now().toISOString();
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
    },
    audit: {
      async append(_ctx, event) {
        state.audit.push({ id: `internal-audit-${state.audit.length + 1}`, ...event });
      },
      async list() {
        return state.audit
          .map((event) => ({ ...event }))
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      },
    },
    prospects: {
      async list() { return state.prospects.map((item) => ({ ...item })); },
      async get(_ctx, id) { return state.prospects.find((item) => item.id === id) ?? null; },
      async create(_ctx, input) { if (state.prospects.some((item) => item.id === input.id)) throw new Error("Prospect already exists."); state.prospects.push({ ...input }); },
      async people(_ctx, id) { return state.prospectPeople.filter((person) => person.prospectOrganisationId === id).map((person) => ({ ...person })); },
      async addPerson(_ctx, input) { state.prospectPeople.push({ ...input }); },
      async sources(_ctx, id) { return state.prospectSources.filter((source) => source.prospectOrganisationId === id).map((source) => ({ ...source })); },
      async facts(_ctx, id) { return state.prospectFacts.filter((fact) => fact.prospectOrganisationId === id).map((fact) => ({ ...fact })); },
      async saveResearch(_ctx, id, sources, facts) {
        state.prospectSources = state.prospectSources.filter((source) => source.prospectOrganisationId !== id).concat(sources);
        state.prospectFacts = state.prospectFacts.filter((fact) => fact.prospectOrganisationId !== id).concat(facts);
        const prospect = state.prospects.find((item) => item.id === id);
        if (prospect) prospect.status = "researched";
      },
    },
    sales:{ async opportunities(){return state.salesOpportunities.map(x=>({...x}));},async forProspect(_ctx,id){return state.salesOpportunities.find(x=>x.prospectOrganisationId===id)??null;},async saveOpportunity(_ctx,item){const i=state.salesOpportunities.findIndex(x=>x.id===item.id);if(i>=0)state.salesOpportunities[i]={...item};else state.salesOpportunities.push({...item});},async qualification(_ctx,id){return state.prospectQualifications.find(x=>x.prospectOrganisationId===id)??null;},async saveQualification(_ctx,item){const i=state.prospectQualifications.findIndex(x=>x.prospectOrganisationId===item.prospectOrganisationId);if(i>=0)state.prospectQualifications[i]={...item};else state.prospectQualifications.push({...item});}},
    tasks:{async list(){return state.internalTasks.map(x=>({...x}));},async create(_ctx,item){state.internalTasks.push({...item});}},
    outreach:{async templates(){return state.outreachTemplates.map(x=>({...x}));},async saveTemplate(_ctx,item){const i=state.outreachTemplates.findIndex(x=>x.id===item.id);if(i>=0)state.outreachTemplates[i]={...item};else state.outreachTemplates.push({...item});},async sequences(){return state.outreachSequences.map(x=>({...x}));},async saveSequence(_ctx,item){const i=state.outreachSequences.findIndex(x=>x.id===item.id);if(i>=0)state.outreachSequences[i]={...item};else state.outreachSequences.push({...item});},async steps(_ctx,id){return state.sequenceSteps.filter(x=>x.sequenceId===id).map(x=>({...x}));},async saveStep(_ctx,item){if(state.sequenceSteps.some(x=>x.sequenceId===item.sequenceId&&x.position===item.position&&x.id!==item.id))throw new Error("Sequence step position already exists.");const i=state.sequenceSteps.findIndex(x=>x.id===item.id);if(i>=0)state.sequenceSteps[i]={...item};else state.sequenceSteps.push({...item});},async enrollments(){return state.sequenceEnrollments.map(x=>({...x}));},async saveEnrollment(_ctx,item){const i=state.sequenceEnrollments.findIndex(x=>x.id===item.id);if(i>=0)state.sequenceEnrollments[i]={...item};else state.sequenceEnrollments.push({...item});},async compliance(_ctx,id){return state.contactCompliance.find(x=>x.prospectPersonId===id)??null;},async saveCompliance(_ctx,item){const i=state.contactCompliance.findIndex(x=>x.prospectPersonId===item.prospectPersonId);if(i>=0)state.contactCompliance[i]={...item};else state.contactCompliance.push({...item});},async sendRequests(){return state.outreachSendRequests.map(x=>({...x}));},async saveSendRequest(_ctx,item){if(state.outreachSendRequests.some(x=>x.idempotencyKey===item.idempotencyKey&&x.id!==item.id))throw new Error("Duplicate send request.");const i=state.outreachSendRequests.findIndex(x=>x.id===item.id);if(i>=0)state.outreachSendRequests[i]={...item};else state.outreachSendRequests.push({...item});}},
    conversion:{async list(){return state.customerConversions.map(x=>({...x}));},async provision(ctx,input){const existing=state.customerConversions.find(x=>x.prospectOrganisationId===input.prospectId||x.idempotencyKey===input.idempotencyKey);if(existing){return{conversion:existing,account:state.customerAccounts.find(x=>x.id===existing.customerAccountId)!,run:state.provisioningRuns.find(x=>x.customerConversionId===existing.id)!};}const prospect=state.prospects.find(x=>x.id===input.prospectId);if(!prospect)throw new Error("Prospect not found.");const opportunity=state.salesOpportunities.find(x=>x.prospectOrganisationId===input.prospectId);if(opportunity?.stage!=="won")throw new Error("Only a won opportunity can be converted.");const timestamp=ctx.now().toISOString(),account:CustomerAccount={id:crypto.randomUUID(),prospectOrganisationId:input.prospectId,organisationId:crypto.randomUUID(),status:"active",createdAt:timestamp,updatedAt:timestamp},conversion:CustomerConversion={id:crypto.randomUUID(),prospectOrganisationId:input.prospectId,customerAccountId:account.id,idempotencyKey:input.idempotencyKey,convertedBy:ctx.internalUserId,reason:input.reason,convertedAt:timestamp},run:ProvisioningRun={id:crypto.randomUUID(),customerConversionId:"",state:"completed",idempotencyKey:input.idempotencyKey,startedAt:timestamp,completedAt:timestamp};run.customerConversionId=conversion.id;state.customerAccounts.push(account);state.customerConversions.push(conversion);state.provisioningRuns.push(run);prospect.status="converted";state.audit.push({id:`internal-audit-${state.audit.length+1}`,actorId:ctx.internalUserId,action:"customer.provision",targetType:"customer_conversion",targetId:conversion.id,organisationId:account.organisationId,reason:input.reason,requestId:ctx.requestId,occurredAt:timestamp,after:{prospectId:input.prospectId,customerAccountId:account.id,organisationId:account.organisationId}});return{account,conversion,run};}},
    onboarding:{async accounts(){return state.customerAccounts.map(x=>({...x}));},async plans(){return state.onboardingPlans.map(x=>({...x}));},async savePlan(_c,x){const i=state.onboardingPlans.findIndex(y=>y.id===x.id);if(i<0)state.onboardingPlans.push({...x});else state.onboardingPlans[i]={...x};},async steps(_c,id){return state.onboardingSteps.filter(x=>x.onboardingPlanId===id).map(x=>({...x}));},async saveStep(_c,x){const i=state.onboardingSteps.findIndex(y=>y.id===x.id);if(i<0)state.onboardingSteps.push({...x});else state.onboardingSteps[i]={...x};},async criteria(_c,id){return state.activationCriteria.filter(x=>x.onboardingPlanId===id).map(x=>({...x}));},async saveCriterion(_c,x){state.activationCriteria.push({...x});},async events(_c,id){return state.customerValueEvents.filter(x=>x.customerAccountId===id).map(x=>({...x}));},async saveEvent(_c,x){if(state.customerValueEvents.some(y=>y.eventKey===x.eventKey))return;state.customerValueEvents.push({...x});},async activationSnapshot(_c,id){return state.activationSnapshots.find(x=>x.customerAccountId===id)??null;},async saveSnapshot(_c,x){const i=state.activationSnapshots.findIndex(y=>y.customerAccountId===x.customerAccountId);if(i<0)state.activationSnapshots.push({...x});else state.activationSnapshots[i]={...x};}},
    health:{async metadata(){return state.customerMetadata.map(x=>({...x}));},async saveMetadata(_c,x){const i=state.customerMetadata.findIndex(y=>y.customerAccountId===x.customerAccountId);if(i<0)state.customerMetadata.push({...x});else state.customerMetadata[i]={...x};},async snapshots(){return state.customerHealthSnapshots.map(x=>({...x}));},async saveSnapshot(_c,x){state.customerHealthSnapshots.push({...x});}},
    support:{async sessions(){return state.supportSessions.map(x=>({...x}));},async saveSession(_c,x){const i=state.supportSessions.findIndex(y=>y.id===x.id);if(i<0)state.supportSessions.push({...x});else state.supportSessions[i]={...x};},async events(){return state.supportAccessEvents.map(x=>({...x}));},async appendEvent(_c,x){state.supportAccessEvents.push({...x});}},
    insights:{async usage(){return state.usageEvents.map(x=>({...x}));},async saveUsage(_c,x){if(!state.usageEvents.some(y=>y.eventKey===x.eventKey))state.usageEvents.push({...x});},async feedback(){return state.customerFeedback.map(x=>({...x}));},async saveFeedback(_c,x){const i=state.customerFeedback.findIndex(y=>y.id===x.id);if(i<0)state.customerFeedback.push({...x});else state.customerFeedback[i]={...x};}},
    operations:{async flags(){return state.featureFlags.map(x=>({...x}));},async saveFlag(_c,x){const i=state.featureFlags.findIndex(y=>y.id===x.id);if(i<0)state.featureFlags.push({...x});else state.featureFlags[i]={...x};},async targets(){return state.featureTargets.map(x=>({...x}));},async saveTarget(_c,x){const i=state.featureTargets.findIndex(y=>y.id===x.id);if(i<0)state.featureTargets.push({...x});else state.featureTargets[i]={...x};},async traces(){return state.aiTraces.map(x=>({...x}));},async saveTrace(_c,x){state.aiTraces.push({...x});},async system(){return state.systemStatuses.map(x=>({...x}));},async saveSystem(_c,x){const i=state.systemStatuses.findIndex(y=>y.componentKey===x.componentKey);if(i<0)state.systemStatuses.push({...x});else state.systemStatuses[i]={...x};}},
  };
}
