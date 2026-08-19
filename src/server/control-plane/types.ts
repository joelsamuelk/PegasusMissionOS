import type { InternalRole } from "@/lib/control-plane/permissions";
import type { InternalAuditEvent } from "./audit";

export type InternalUserStatus = "invited" | "active" | "suspended";

export interface InternalUser {
  id: string;
  email: string;
  name: string;
  role: InternalRole;
  status: InternalUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredInternalAuditEvent extends InternalAuditEvent {
  id: string;
}

export type ProspectStatus = "discovered" | "researching" | "researched" | "archived" | "converted";
export interface ProspectOrganisation {
  id: string; name: string; website?: string; registrationIdentifier?: string;
  country?: string; organisationType?: string; focusAreas: string[];
  sizeIndicators: string[]; publicFinancialIndicators: string[];
  publicProgrammeIndicators: string[]; status: ProspectStatus;
  ownerId?: string; source: string; createdAt: string; updatedAt: string;
}
export interface ProspectPerson {
  id: string; prospectOrganisationId: string; name: string; role?: string;
  email?: string; phone?: string; sourceUrl?: string; verificationState: "provided" | "needs_review" | "verified";
  createdAt: string; updatedAt: string;
}
export interface ProspectResearchSource {
  id: string; prospectOrganisationId: string; type: string; title?: string;
  url: string; publisher?: string; authority: "regulator" | "organisation" | "supporting" | "discovery";
  retrievedAt?: string; extractionStatus: string; failureReason?: string;
}
export interface ProspectFact {
  id: string; prospectOrganisationId: string; field: string; value: string;
  sourceId: string; sourceUrl: string; locator: string; authority: ProspectResearchSource["authority"];
  verificationState: "ai_extracted" | "needs_review" | "provided" | "verified" | "outdated";
  confidence: number; extractionMethod: string; injectionSuspected: boolean; conflictGroup?: string;
  extractedAt: string;
}
export type SalesPipelineStage = "discovered"|"researched"|"qualified"|"contacted"|"engaged"|"demo"|"evaluating"|"proposal"|"won"|"lost"|"nurture";
export interface SalesOpportunity { id:string; prospectOrganisationId:string; stage:SalesPipelineStage; ownerId?:string; nextAction?:string; lastInteractionAt?:string; expectedValue?:number; probability?:number; closeTarget?:string; lostReason?:string; lostNotes?:string; createdAt:string; updatedAt:string }
export interface ProspectQualification { id:string; prospectOrganisationId:string; score:number; computedCategory:string; effectiveCategory:string; methodologyVersion:string; factors:unknown[]; missingInformation:string[]; overrideReason?:string; overriddenBy?:string; assessedAt:string }
export type InternalTaskStatus="open"|"in_progress"|"completed"|"cancelled";
export interface InternalTask { id:string; title:string; description?:string; ownerId?:string; dueAt?:string; priority:"low"|"medium"|"high"|"urgent"; status:InternalTaskStatus; source:"manual"|"system"|"intelligence"; relatedEntity:{type:"prospect"|"customer"|"opportunity"|"onboarding"|"support"|"product"|"system";id:string}; createdAt:string; updatedAt:string }
export interface OutreachTemplate { id:string; name:string; subject:string; body:string; status:"draft"|"active"|"archived"; createdBy:string; createdAt:string; updatedAt:string }
export interface OutreachSequence { id:string; name:string; status:"draft"|"active"|"paused"|"archived"; createdBy:string; createdAt:string; updatedAt:string }
export interface SequenceStep { id:string; sequenceId:string; position:number; templateId:string; delayDays:number }
export interface ContactCompliance { prospectPersonId:string; contactSourceUrl:string; contactSourceRetrievedAt:string; lawfulBasis:"consent"|"legitimate_interests"|"contract"|"none_recorded"; lawfulBasisNote?:string; consentRecordedAt?:string; doNotContact:boolean; unsubscribedAt?:string; updatedAt:string }
export interface SequenceEnrollment { id:string; sequenceId:string; prospectPersonId:string; status:"pending_approval"|"active"|"paused"|"completed"|"cancelled"|"suppressed"; currentStep:number; enrolledBy:string; enrolledAt:string; updatedAt:string }
export interface OutreachSendRequest { id:string; prospectPersonId:string; sequenceEnrollmentId?:string; templateId?:string; subject:string; body:string; state:"draft"|"pending_approval"|"approved"|"blocked"|"queued"|"sent"|"failed"|"replied"; initialOutbound:boolean; approvedBy?:string; approvedAt?:string; blockedReason?:string; idempotencyKey:string; createdBy:string; createdAt:string; updatedAt:string }
export interface CustomerAccount { id:string; prospectOrganisationId:string; organisationId:string; status:"provisioning"|"active"|"failed"; createdAt:string; updatedAt:string }
export interface CustomerConversion { id:string; prospectOrganisationId:string; customerAccountId:string; idempotencyKey:string; convertedBy:string; reason:string; convertedAt:string }
export interface ProvisioningRun { id:string; customerConversionId:string; state:"started"|"completed"|"failed"; idempotencyKey:string; failureReason?:string; startedAt:string; completedAt?:string }
export interface OnboardingPlan{id:string;customerAccountId:string;status:"not_started"|"in_progress"|"completed"|"paused";templateVersion:string;ownerId?:string;startedAt?:string;setupCompletedAt?:string;targetActivationAt?:string;createdAt:string;updatedAt:string}
export interface OnboardingStep{id:string;onboardingPlanId:string;stepKey:string;title:string;position:number;required:boolean;status:"pending"|"completed"|"skipped";completedAt?:string;completedBy?:string}
export interface ActivationCriterion{id:string;onboardingPlanId:string;criterionKey:string;title:string;eventName:string;threshold:number;required:boolean}
export interface CustomerValueEvent{id:string;customerAccountId:string;eventName:string;eventKey:string;occurredAt:string;recordedBy:string;createdAt:string}
export interface ActivationSnapshot{id:string;customerAccountId:string;criteriaResults:unknown[];activatedAt?:string;firstValueAt?:string;timeToValueSeconds?:number;computedAt:string}
export interface CustomerMetadataProjection{customerAccountId:string;lifecycleStage:"onboarding"|"active"|"at_risk"|"churned";planName?:string;customerSuccessOwnerId?:string;renewalTarget?:string;activeMemberCount?:number;lastAggregateActivityAt?:string;updatedAt:string}
export interface CustomerHealthSnapshot{id:string;customerAccountId:string;score:number;computedCategory:"healthy"|"watch"|"at_risk"|"critical";effectiveCategory:"healthy"|"watch"|"at_risk"|"critical";methodologyVersion:string;reasons:unknown[];missingInformation:string[];overrideReason?:string;overriddenBy?:string;computedAt:string}
export interface SupportAccessSession{id:string;requesterId:string;organisationId:string;customerAccountId:string;caseReference:string;reason:string;requestedScope:"read_only"|"troubleshooting"|"elevated";approvedScope:"read_only"|"troubleshooting"|"elevated";status:"active"|"ended"|"revoked"|"expired";startedAt:string;expiresAt:string;endedAt?:string;endedBy?:string}
export interface SupportAccessEvent{id:string;supportSessionId?:string;actorId:string;organisationId:string;action:string;resourceClassification:string;resourceIdentifier:string;outcome:"allowed"|"denied";reason?:string;requestId:string;occurredAt:string}
export interface PrivacySafeUsageEvent{id:string;customerAccountId:string;eventName:string;properties:Record<string,unknown>;eventKey:string;occurredAt:string;receivedAt:string}
export interface CustomerFeedback{id:string;customerAccountId:string;category:"product"|"support"|"onboarding"|"outcome"|"other";sentiment:"positive"|"neutral"|"negative";summary:string;status:"new"|"reviewing"|"planned"|"resolved"|"closed";submittedAt:string;createdAt:string}
export interface ControlFeatureFlag{id:string;key:string;description:string;enabledByDefault:boolean;status:"draft"|"active"|"archived";updatedBy:string;updatedAt:string}export interface ControlFeatureTarget{id:string;featureFlagId:string;customerAccountId:string;enabled:boolean;reason:string;updatedBy:string;updatedAt:string}
export interface AiOperationTrace{id:string;customerAccountId?:string;operation:string;provider:string;model:string;status:"started"|"succeeded"|"failed"|"blocked";inputTokens?:number;outputTokens?:number;latencyMs?:number;sourcesOffered:unknown[];sourcesCited:unknown[];errorCode?:string;requestId:string;occurredAt:string}
export interface SystemComponentStatus{id:string;componentKey:string;adapterName:string;state:"operational"|"degraded"|"outage"|"unknown"|"not_configured";detail:string;observedAt?:string;reportedAt:string}
