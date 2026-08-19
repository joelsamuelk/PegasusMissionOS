import type { ControlRequestContext } from "./context";
import type { InternalAuditEvent } from "./audit";
import type { InternalRole } from "@/lib/control-plane/permissions";
import type { InternalUser, InternalUserStatus, StoredInternalAuditEvent } from "./types";
import type { ProspectFact, ProspectOrganisation, ProspectPerson, ProspectResearchSource } from "./types";
import type { InternalTask, ProspectQualification, SalesOpportunity } from "./types";
import type { ContactCompliance, OutreachSendRequest, OutreachSequence, OutreachTemplate, SequenceEnrollment, SequenceStep } from "./types";
import type { CustomerAccount, CustomerConversion, ProvisioningRun } from "./types";
import type { ActivationCriterion,ActivationSnapshot,CustomerValueEvent,OnboardingPlan,OnboardingStep } from "./types";
import type { CustomerHealthSnapshot,CustomerMetadataProjection } from "./types";
import type { SupportAccessEvent,SupportAccessSession } from "./types";
import type { CustomerFeedback,PrivacySafeUsageEvent } from "./types";
import type { AiOperationTrace,ControlFeatureFlag,ControlFeatureTarget,SystemComponentStatus } from "./types";

export interface ControlRepository {
  readonly name: "in-memory" | "supabase";
  users: {
    current(ctx: ControlRequestContext): Promise<InternalUser | null>;
    list(ctx: ControlRequestContext): Promise<InternalUser[]>;
    changeRole(
      ctx: ControlRequestContext,
      id: string,
      role: InternalRole,
      event: InternalAuditEvent,
    ): Promise<void>;
    changeStatus(
      ctx: ControlRequestContext,
      id: string,
      status: InternalUserStatus,
      event: InternalAuditEvent,
    ): Promise<void>;
  };
  audit: {
    append(ctx: ControlRequestContext, event: InternalAuditEvent): Promise<void>;
    list(ctx: ControlRequestContext): Promise<StoredInternalAuditEvent[]>;
  };
  prospects: {
    list(ctx: ControlRequestContext): Promise<ProspectOrganisation[]>;
    get(ctx: ControlRequestContext, id: string): Promise<ProspectOrganisation | null>;
    create(ctx: ControlRequestContext, input: ProspectOrganisation): Promise<void>;
    people(ctx: ControlRequestContext, prospectId: string): Promise<ProspectPerson[]>;
    addPerson(ctx: ControlRequestContext, input: ProspectPerson): Promise<void>;
    sources(ctx: ControlRequestContext, prospectId: string): Promise<ProspectResearchSource[]>;
    facts(ctx: ControlRequestContext, prospectId: string): Promise<ProspectFact[]>;
    saveResearch(ctx: ControlRequestContext, prospectId: string, sources: ProspectResearchSource[], facts: ProspectFact[]): Promise<void>;
  };
  sales: { opportunities(ctx:ControlRequestContext):Promise<SalesOpportunity[]>; forProspect(ctx:ControlRequestContext,id:string):Promise<SalesOpportunity|null>; saveOpportunity(ctx:ControlRequestContext,item:SalesOpportunity):Promise<void>; qualification(ctx:ControlRequestContext,id:string):Promise<ProspectQualification|null>; saveQualification(ctx:ControlRequestContext,item:ProspectQualification):Promise<void> };
  tasks: { list(ctx:ControlRequestContext):Promise<InternalTask[]>; create(ctx:ControlRequestContext,item:InternalTask):Promise<void>; };
  outreach: { templates(ctx:ControlRequestContext):Promise<OutreachTemplate[]>; saveTemplate(ctx:ControlRequestContext,item:OutreachTemplate):Promise<void>; sequences(ctx:ControlRequestContext):Promise<OutreachSequence[]>; saveSequence(ctx:ControlRequestContext,item:OutreachSequence):Promise<void>; steps(ctx:ControlRequestContext,sequenceId:string):Promise<SequenceStep[]>; saveStep(ctx:ControlRequestContext,item:SequenceStep):Promise<void>; enrollments(ctx:ControlRequestContext):Promise<SequenceEnrollment[]>; saveEnrollment(ctx:ControlRequestContext,item:SequenceEnrollment):Promise<void>; compliance(ctx:ControlRequestContext,personId:string):Promise<ContactCompliance|null>; saveCompliance(ctx:ControlRequestContext,item:ContactCompliance):Promise<void>; sendRequests(ctx:ControlRequestContext):Promise<OutreachSendRequest[]>; saveSendRequest(ctx:ControlRequestContext,item:OutreachSendRequest):Promise<void>; };
  conversion:{list(ctx:ControlRequestContext):Promise<CustomerConversion[]>;provision(ctx:ControlRequestContext,input:{prospectId:string;adminEmail:string;adminName:string;reason:string;idempotencyKey:string}):Promise<{account:CustomerAccount;conversion:CustomerConversion;run:ProvisioningRun}>};
  onboarding:{accounts(ctx:ControlRequestContext):Promise<CustomerAccount[]>;plans(ctx:ControlRequestContext):Promise<OnboardingPlan[]>;savePlan(ctx:ControlRequestContext,item:OnboardingPlan):Promise<void>;steps(ctx:ControlRequestContext,planId:string):Promise<OnboardingStep[]>;saveStep(ctx:ControlRequestContext,item:OnboardingStep):Promise<void>;criteria(ctx:ControlRequestContext,planId:string):Promise<ActivationCriterion[]>;saveCriterion(ctx:ControlRequestContext,item:ActivationCriterion):Promise<void>;events(ctx:ControlRequestContext,accountId:string):Promise<CustomerValueEvent[]>;saveEvent(ctx:ControlRequestContext,item:CustomerValueEvent):Promise<void>;activationSnapshot(ctx:ControlRequestContext,accountId:string):Promise<ActivationSnapshot|null>;saveSnapshot(ctx:ControlRequestContext,item:ActivationSnapshot):Promise<void>};
  health:{metadata(ctx:ControlRequestContext):Promise<CustomerMetadataProjection[]>;saveMetadata(ctx:ControlRequestContext,item:CustomerMetadataProjection):Promise<void>;snapshots(ctx:ControlRequestContext):Promise<CustomerHealthSnapshot[]>;saveSnapshot(ctx:ControlRequestContext,item:CustomerHealthSnapshot):Promise<void>};
  support:{sessions(ctx:ControlRequestContext):Promise<SupportAccessSession[]>;saveSession(ctx:ControlRequestContext,item:SupportAccessSession):Promise<void>;events(ctx:ControlRequestContext):Promise<SupportAccessEvent[]>;appendEvent(ctx:ControlRequestContext,item:SupportAccessEvent):Promise<void>};
  insights:{usage(ctx:ControlRequestContext):Promise<PrivacySafeUsageEvent[]>;saveUsage(ctx:ControlRequestContext,item:PrivacySafeUsageEvent):Promise<void>;feedback(ctx:ControlRequestContext):Promise<CustomerFeedback[]>;saveFeedback(ctx:ControlRequestContext,item:CustomerFeedback):Promise<void>};
  operations:{flags(ctx:ControlRequestContext):Promise<ControlFeatureFlag[]>;saveFlag(ctx:ControlRequestContext,item:ControlFeatureFlag):Promise<void>;targets(ctx:ControlRequestContext):Promise<ControlFeatureTarget[]>;saveTarget(ctx:ControlRequestContext,item:ControlFeatureTarget):Promise<void>;traces(ctx:ControlRequestContext):Promise<AiOperationTrace[]>;saveTrace(ctx:ControlRequestContext,item:AiOperationTrace):Promise<void>;system(ctx:ControlRequestContext):Promise<SystemComponentStatus[]>;saveSystem(ctx:ControlRequestContext,item:SystemComponentStatus):Promise<void>};
}
