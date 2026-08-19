import { describe, expect, it } from "vitest";
import { createInMemoryControlRepository, type ControlMemoryState } from "@/server/control-plane/in-memory";
import { createControlRequestContext } from "@/server/control-plane/context";
import { addProspectPerson, createProspect, researchProspect } from "@/server/control-plane/prospect-service";

const state = (): ControlMemoryState => ({ users: [], audit: [], prospects: [], prospectPeople: [], prospectSources: [], prospectFacts: [], salesOpportunities: [], prospectQualifications: [], internalTasks: [], outreachTemplates: [], outreachSequences: [], sequenceSteps: [], sequenceEnrollments: [], contactCompliance: [], outreachSendRequests: [], customerAccounts: [], customerConversions: [], provisioningRuns: [], onboardingPlans: [], onboardingSteps: [], activationCriteria: [], customerValueEvents: [], activationSnapshots: [], customerMetadata: [], customerHealthSnapshots: [], supportSessions: [], supportAccessEvents: [], usageEvents: [], customerFeedback: [], featureFlags: [], featureTargets: [], aiTraces: [], systemStatuses: [] });
const ctx = (role: "sales" | "read_only" = "sales") => createControlRequestContext({ internalUserId: "internal-1", role, requestId: "request-1", now: () => new Date("2026-08-19T10:00:00Z") });
describe("prospect service", () => {
  it("creates one enduring prospect identity and an audit record", async () => {
    const data = state(); const id = await createProspect(ctx(), createInMemoryControlRepository(data), { name: " Green Futures ", website: "https://green.example", source: "manual" });
    expect(data.prospects[0]).toMatchObject({ id, name: "Green Futures", status: "discovered" }); expect(data.audit[0]).toMatchObject({ action: "prospect.create", targetId: id });
  });
  it("rejects unsafe websites before persistence", async () => { const data=state(); await expect(createProspect(ctx(), createInMemoryControlRepository(data), { name: "Bad", website: "javascript:alert(1)", source: "manual" })).rejects.toThrow("HTTP or HTTPS"); expect(data.prospects).toHaveLength(0); });
  it("enforces capabilities", async () => { await expect(createProspect(ctx("read_only"), createInMemoryControlRepository(state()), { name: "Blocked", source: "manual" })).rejects.toThrow("lacks required capability"); });
  it("links a sourced person to the same prospect", async () => { const data=state(); const repo=createInMemoryControlRepository(data); const id=await createProspect(ctx(),repo,{name:"Green Futures",source:"manual"}); await addProspectPerson(ctx(),repo,{prospectId:id,name:"Amina",sourceUrl:"https://green.example/team"}); expect(data.prospectPeople[0]).toMatchObject({ prospectOrganisationId:id, verificationState:"needs_review" }); });
  it("cannot attach a person to a missing prospect", async () => { await expect(addProspectPerson(ctx(),createInMemoryControlRepository(state()),{prospectId:"missing",name:"Amina"})).rejects.toThrow("not found"); });
  it("runs provider-neutral research and persists unapproved facts", async () => {
    const data=state(); const repo=createInMemoryControlRepository(data); const id=await createProspect(ctx(),repo,{name:"Green Futures",website:"https://green.example",source:"manual"});
    const provider={id:"fixture",async research(){const source={id:"11111111-1111-1111-1111-111111111111",organisationId:id,type:"website" as const,url:"https://green.example",authority:"organisation" as const,discoveredAt:"2026-08-19T10:00:00Z",extractionStatus:"extracted" as const};const fact={id:"22222222-2222-2222-2222-222222222222",organisationId:id,field:"missionStatement" as const,value:"Climate action",confidence:.9,method:"heading" as const,sourceId:source.id,sourceUrl:source.url,authority:source.authority,locator:"h1",extractedAt:"2026-08-19T10:00:00Z",verificationState:"ai_extracted" as const};return{sources:[source],candidates:[fact],reconciliation:{agreed:[fact],conflicts:[]}};}};
    expect(await researchProspect(ctx(),repo,provider,id)).toMatchObject({sourceCount:1,factCount:1}); expect(data.prospectFacts[0]?.verificationState).toBe("ai_extracted"); expect(data.audit.at(-1)?.action).toBe("prospect.research");
  });
});
