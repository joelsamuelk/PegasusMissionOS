import { describe, expect, it } from "vitest";
import { createInMemoryControlRepository, type ControlMemoryState } from "@/server/control-plane/in-memory";
import { createControlRequestContext } from "@/server/control-plane/context";
import { runDiscoveryJob } from "@/server/control-plane/discovery-service";
import { importProspectCsv, parseCsv } from "@/server/control-plane/prospect-import";
import { ProviderError } from "@/server/commercial/live-providers";
import type { DiscoveryCandidate, DiscoveryCapability, ProspectDiscoveryProvider } from "@/lib/commercial/discovery";
import type { PilotDiscoveryJob } from "@/lib/commercial/pilot";
import { registerUrl } from "@/lib/commercial/discovery";

const state = (): ControlMemoryState => ({ users: [], audit: [], prospects: [], prospectPeople: [], prospectSources: [], prospectFacts: [], salesOpportunities: [], prospectQualifications: [], internalTasks: [], outreachTemplates: [], outreachSequences: [], sequenceSteps: [], sequenceEnrollments: [], contactCompliance: [], outreachSendRequests: [], customerAccounts: [], customerConversions: [], provisioningRuns: [], onboardingPlans: [], onboardingSteps: [], activationCriteria: [], customerValueEvents: [], activationSnapshots: [], customerMetadata: [], customerHealthSnapshots: [], supportSessions: [], supportAccessEvents: [], usageEvents: [], customerFeedback: [], featureFlags: [], featureTargets: [], aiTraces: [], systemStatuses: [] });
const ctx = (role: "sales" | "read_only" = "sales") => createControlRequestContext({ internalUserId: "internal-1", role, requestId: "request-1", now: () => new Date("2026-08-19T10:00:00Z") });

const job = (providers: string[], searchTerms = ["youth"]): PilotDiscoveryJob => ({ id: "pilot-test", name: "Test Pilot", motion: "mission_os", icpId: "mission-os", criteria: "UK mission-driven organisations", searchTerms, geography: ["United Kingdom"], signalRequirements: [], providers, status: "pilot" });

const candidate = (name: string, host: string): DiscoveryCandidate => ({ providerRecordId: `test:${host}`, name, website: `https://${host}`, geography: "United Kingdom", sourceUrl: `https://${host}/about`, discoveredAt: "2026-08-19T10:00:00Z" });

function provider(id: string, behaviour: (term: string) => DiscoveryCandidate[]): ProspectDiscoveryProvider {
  return { id, capabilities: new Set<DiscoveryCapability>(["organisationDiscovery"]), async discover(discoveryJob) { return behaviour(discoveryJob.searchCriteria); } };
}
const researchOnly: ProspectDiscoveryProvider = { id: "bounded_public_web", capabilities: new Set<DiscoveryCapability>(["websiteResearch"]), async discover() { return []; } };

describe("discovery run", () => {
  it("turns provider candidates into prospects the operator can review", async () => {
    const data = state();
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(data), job(["fixture"]), () => provider("fixture", () => [candidate("Northstar Youth Trust", "northstar.example")]));
    expect(summary).toMatchObject({ found: 1, created: 1, duplicates: 0, rejected: 0 });
    expect(data.prospects[0]).toMatchObject({ name: "Northstar Youth Trust", status: "discovered", source: "discovery:pilot-test" });
    expect(data.audit.at(-1)).toMatchObject({ action: "prospect.discovery_run", targetId: "pilot-test" });
  });

  it("queries once per search term and interleaves the results", async () => {
    const seen: string[] = [];
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["fixture"], ["youth", "climate"]), () => provider("fixture", (term) => { seen.push(term); return [candidate(`${term} one`, `${term}-one.example`)]; }));
    expect(seen).toEqual(["youth", "climate"]);
    expect(summary.created).toBe(2);
  });

  it("reports an unconfigured provider instead of failing the run", async () => {
    const data = state();
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(data), job(["missing", "fixture"]), (id) => id === "fixture" ? provider(id, () => [candidate("Relay Health", "relay.example")]) : provider(id, () => { throw new ProviderError("no key", "not_configured"); }));
    expect(summary.providers).toEqual([{ provider: "missing", found: 0, failure: "not_configured" }, { provider: "fixture", found: 1, failure: undefined }]);
    expect(summary.created).toBe(1);
    expect(data.prospects).toHaveLength(1);
  });

  it("stops calling a provider that has no credential rather than retrying every term", async () => {
    let calls = 0;
    await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["missing"], ["a", "b", "c"]), (id) => provider(id, () => { calls++; throw new ProviderError("no key", "not_configured"); }));
    expect(calls).toBe(1);
  });

  it("names a research-only provider rather than pretending it discovered nothing", async () => {
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["bounded_public_web"]), () => researchOnly);
    expect(summary.providers).toEqual([{ provider: "bounded_public_web", found: 0, failure: "no_discovery_capability" }]);
  });

  it("keeps register candidates distinct even though they share one register", async () => {
    const data = state();
    const fromRegister = (name: string, number: string): DiscoveryCandidate => ({ providerRecordId: `ccew:${number}`, name, registrationIdentifier: `ccew:${number}`, geography: "England and Wales", sourceUrl: `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${number}`, discoveredAt: "2026-08-19T10:00:00Z" });
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(data), job(["fixture"]), () => provider("fixture", () => [fromRegister("Northstar Youth Trust", "1000001"), fromRegister("Relay Youth Trust", "1000002"), fromRegister("Harbour Youth Trust", "1000003")]));
    expect(summary).toMatchObject({ found: 3, created: 3, duplicates: 0 });
    expect(data.prospects.map((p) => p.registrationIdentifier)).toEqual(["ccew:1000001", "ccew:1000002", "ccew:1000003"]);
    expect(data.prospects.every((p) => p.website === undefined)).toBe(true);
    expect(registerUrl(data.prospects[0]!.registrationIdentifier)).toContain("1000001");
  });

  it("still recognises the same register entry on a later run", async () => {
    const data = state();
    const repo = createInMemoryControlRepository(data);
    const candidateFor = () => [{ providerRecordId: "ccew:1000001", name: "Northstar Youth Trust", registrationIdentifier: "ccew:1000001", sourceUrl: "https://register.example/1000001", discoveredAt: "2026-08-19T10:00:00Z" }];
    const run = () => runDiscoveryJob(ctx(), repo, job(["fixture"]), () => provider("fixture", candidateFor));
    await run();
    expect(await run()).toMatchObject({ created: 0, duplicates: 1 });
    expect(data.prospects).toHaveLength(1);
  });

  it("does not create a second prospect for an organisation already known", async () => {
    const data = state();
    const repo = createInMemoryControlRepository(data);
    const run = () => runDiscoveryJob(ctx(), repo, job(["fixture"]), () => provider("fixture", () => [candidate("Northstar Youth Trust", "northstar.example")]));
    await run();
    expect(await run()).toMatchObject({ found: 1, created: 0, duplicates: 1 });
    expect(data.prospects).toHaveLength(1);
  });

  it("skips a candidate that cannot become a prospect and keeps the rest", async () => {
    const data = state();
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(data), job(["fixture"]), () => provider("fixture", () => [{ ...candidate("Bad", "bad.example"), website: "javascript:alert(1)" }, candidate("Good", "good.example")]));
    expect(summary).toMatchObject({ created: 1, rejected: 1 });
    expect(data.prospects.map((p) => p.name)).toEqual(["Good"]);
  });

  it("holds a run to the pilot candidate cap", async () => {
    const many = Array.from({ length: 40 }, (_, index) => candidate(`Org ${index}`, `org-${index}.example`));
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["fixture"]), () => provider("fixture", () => many));
    expect(summary.found).toBe(25);
    expect(summary.created).toBe(25);
  });

  it("calls providers together rather than one after the other", async () => {
    let live = 0, peak = 0;
    const slow = (id: string): ProspectDiscoveryProvider => ({ id, capabilities: new Set<DiscoveryCapability>(["organisationDiscovery"]), async discover() { live++; peak = Math.max(peak, live); await new Promise((resolve) => setTimeout(resolve, 5)); live--; return [candidate(`From ${id}`, `${id}.example`)]; } });
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["one", "two"]), slow);
    expect(peak).toBe(2);
    expect(summary.created).toBe(2);
  });

  it("stops querying terms once the run is out of time and says so", async () => {
    const seen: string[] = [];
    const summary = await runDiscoveryJob(ctx(), createInMemoryControlRepository(state()), job(["fixture"], ["youth", "climate", "education"]), () => provider("fixture", (term) => { seen.push(term); return []; }), Date.now() - 1);
    expect(seen).toEqual([]);
    expect(summary.providers).toEqual([{ provider: "fixture", found: 0, failure: "timeout" }]);
  });

  it("refuses a role that cannot create prospects", async () => {
    await expect(runDiscoveryJob(ctx("read_only"), createInMemoryControlRepository(state()), job(["fixture"]), () => provider("fixture", () => []))).rejects.toThrow("lacks required capability");
  });
});

describe("prospect CSV import", () => {
  it("reads quoted fields and doubled quotes", () => {
    expect(parseCsv('name,website\r\n"Trust, The","https://a.example"\n"He said ""yes""",\n')).toEqual([["name", "website"], ["Trust, The", "https://a.example"], ['He said "yes"', ""]]);
  });

  it("creates one prospect per named row", async () => {
    const data = state();
    const summary = await importProspectCsv(ctx(), createInMemoryControlRepository(data), "Name,Website,Country\nNorthstar Youth Trust,https://northstar.example,United Kingdom\n");
    expect(summary).toEqual({ created: 1, duplicates: 0, rejected: 0 });
    expect(data.prospects[0]).toMatchObject({ name: "Northstar Youth Trust", country: "United Kingdom", source: "csv_import" });
  });

  it("counts a nameless or duplicate row instead of aborting the file", async () => {
    const data = state();
    const summary = await importProspectCsv(ctx(), createInMemoryControlRepository(data), "name,website\nRelay Health,https://relay.example\n,https://orphan.example\nRelay Health,https://relay.example\nNorthstar,https://northstar.example\n");
    expect(summary).toEqual({ created: 2, duplicates: 1, rejected: 1 });
    expect(data.prospects).toHaveLength(2);
  });

  it("refuses a file with no name column", async () => {
    await expect(importProspectCsv(ctx(), createInMemoryControlRepository(state()), "website\nhttps://a.example\n")).rejects.toThrow("'name' column");
  });
});
