import { appConfig } from "@/lib/config";
import { createAnonClient } from "@/server/data/supabase/client";
import type { ControlRepository } from "./repository";
import { createInMemoryControlRepository, type ControlMemoryState } from "./in-memory";
import { createSupabaseControlRepository } from "./supabase";

const mockNow = "2026-08-19T09:00:00.000Z";
const mockState: ControlMemoryState = {
  users: [
    {
      id: "internal-demo",
      email: "control@pegasus-studio.co",
      name: "Pegasus Operator",
      role: "super_admin",
      status: "active",
      createdAt: mockNow,
      updatedAt: mockNow,
    },
  ],
  audit: [],
  prospects: [{ id: "prospect-green-futures", name: "Green Futures", website: "https://green-futures.example", country: "United Kingdom", organisationType: "Charity", focusAreas: ["Climate", "Young people"], sizeIndicators: [], publicFinancialIndicators: [], publicProgrammeIndicators: [], status: "researched", ownerId: "internal-demo", source: "manual", createdAt: mockNow, updatedAt: mockNow }],
  prospectPeople: [{ id: "prospect-person-amina", prospectOrganisationId: "prospect-green-futures", name: "Amina Rahman", role: "Fundraising Lead", email: "amina@green-futures.example", sourceUrl: "https://green-futures.example/team", verificationState: "needs_review", createdAt: mockNow, updatedAt: mockNow }],
  prospectSources: [{ id: "prospect-source-home", prospectOrganisationId: "prospect-green-futures", type: "website", title: "Green Futures", url: "https://green-futures.example", publisher: "Green Futures", authority: "organisation", retrievedAt: mockNow, extractionStatus: "extracted" }],
  prospectFacts: [{ id: "prospect-fact-mission", prospectOrganisationId: "prospect-green-futures", field: "missionStatement", value: "Helping young people lead practical climate action in their communities.", sourceId: "prospect-source-home", sourceUrl: "https://green-futures.example/about", locator: "page:about#mission", authority: "organisation", verificationState: "needs_review", confidence: 0.92, extractionMethod: "heading", injectionSuspected: false, extractedAt: mockNow }],
  salesOpportunities: [{id:"sales-green-futures",prospectOrganisationId:"prospect-green-futures",stage:"researched",ownerId:"internal-demo",nextAction:"Review qualification",createdAt:mockNow,updatedAt:mockNow}], prospectQualifications: [],
  internalTasks:[{id:"task-green-review",title:"Review Green Futures qualification",ownerId:"internal-demo",priority:"high",status:"open",source:"system",relatedEntity:{type:"prospect",id:"prospect-green-futures"},createdAt:mockNow,updatedAt:mockNow}],
  outreachTemplates:[{id:"template-introduction",name:"Thoughtful introduction",subject:"A question about Green Futures",body:"Hello {{first_name}},\n\nI have been learning about Green Futures and would value a short conversation.",status:"draft",createdBy:"internal-demo",createdAt:mockNow,updatedAt:mockNow}],outreachSequences:[],sequenceSteps:[],sequenceEnrollments:[],
  contactCompliance:[{prospectPersonId:"prospect-person-amina",contactSourceUrl:"https://green-futures.example/team",contactSourceRetrievedAt:mockNow,lawfulBasis:"none_recorded",doNotContact:false,updatedAt:mockNow}],outreachSendRequests:[],
  customerAccounts:[],customerConversions:[],provisioningRuns:[],
  onboardingPlans:[],onboardingSteps:[],activationCriteria:[],customerValueEvents:[],activationSnapshots:[],
  customerMetadata:[],customerHealthSnapshots:[],
  supportSessions:[],supportAccessEvents:[],
  usageEvents:[],customerFeedback:[],
  featureFlags:[],featureTargets:[],aiTraces:[],systemStatuses:[{id:"system-email",componentKey:"email_delivery",adapterName:"none",state:"not_configured",detail:"No delivery provider is configured.",reportedAt:mockNow}],
};

let mockRepository: ControlRepository | null = null;

export async function getControlRepository(): Promise<ControlRepository> {
  if (appConfig.control.mockEnabled) {
    mockRepository ??= createInMemoryControlRepository(mockState);
    return mockRepository;
  }
  if (appConfig.isMockData) {
    throw new Error(
      "Control Plane is not configured. Configure Supabase or explicitly set CONTROL_PLANE_MOCK=true for local demonstration data.",
    );
  }
  return createSupabaseControlRepository(await createAnonClient());
}
