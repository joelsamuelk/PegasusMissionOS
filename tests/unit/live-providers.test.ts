import { describe, expect, it, vi } from "vitest";
import {
  BraveSearchDiscoveryProvider,
  CharityCommissionDiscoveryProvider,
  CompaniesHouseDiscoveryProvider,
  ProviderError,
  providerHealth,
} from "@/server/commercial/live-providers";
import { BoundedWebsiteResearchProvider } from "@/server/commercial/web-research";
import type { DiscoveryJob } from "@/lib/commercial/discovery";
const job: DiscoveryJob = {
  id: "j",
  name: "AI change",
  icpProfileId: "ai",
  commercialMotion: "studio",
  searchCriteria: "AI transformation",
  geography: ["UK"],
  sectors: ["Technology"],
  signalRequirements: ["AI initiative"],
  excludedCriteria: [],
  sources: ["web"],
  status: "ready",
  createdBy: "u",
  createdAt: "2026-08-19",
  resultCount: 0,
  qualifiedCount: 0,
};
const ctx = { requestId: "r", now: new Date("2026-08-19T10:00:00Z") };
describe("live discovery adapters", () => {
  it("maps and deduplicates Brave response shapes", async () => {
    const fetcher = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Acme | Home",
                  url: "https://www.acme.co.uk/news",
                  description: "AI initiative",
                },
                { title: "Acme news", url: "https://acme.co.uk/about" },
                { title: "Other", url: "bad" },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    const results = await new BraveSearchDiscoveryProvider("secret", fetcher).discover(
      job,
      ctx,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({
      name: "Acme",
      website: "https://acme.co.uk",
      providerRecordId: "brave:acme.co.uk",
    });
    expect(fetcher.mock.calls[0]![1]!.headers).toMatchObject({
      "X-Subscription-Token": "secret",
    });
  });
  it("maps Companies House and keeps vendor id outside canonical identity", async () => {
    const fetcher = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                company_number: "0123",
                title: "ACME LTD",
                description: "Private company",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const [result] = await new CompaniesHouseDiscoveryProvider("key", fetcher).discover(
      job,
      ctx,
    );
    expect(result!.providerRecordId).toBe("companies-house:0123");
    expect(result!.sourceUrl).toContain("0123");
  });
  it("maps Charity Commission identity and excludes removed charities", async () => {
    const fetcher = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify([
            {
              organisation_number: 1,
              reg_charity_number: 123456,
              group_subsid_suffix: 0,
              charity_name: "ACTIVE TRUST",
              reg_status: "R",
            },
            {
              organisation_number: 2,
              reg_charity_number: 999999,
              group_subsid_suffix: 0,
              charity_name: "OLD TRUST",
              reg_status: "RM",
            },
          ]),
          { status: 200 },
        ),
    );
    const results = await new CharityCommissionDiscoveryProvider(
      "key",
      fetcher,
      "https://charity.test/api",
    ).discover(job, ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.providerRecordId).toBe("ccew:123456:0");
    expect(results[0]!.description).toContain("not buying intent");
    expect(fetcher.mock.calls[0]![1]!.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "key",
    });
  });
  it("reports rate limiting and malformed responses", async () => {
    const limited = new BraveSearchDiscoveryProvider(
      "x",
      async () => new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );
    await expect(limited.discover(job, ctx)).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
    const malformed = new BraveSearchDiscoveryProvider(
      "x",
      async () => new Response("{}", { status: 200 }),
    );
    await expect(malformed.discover(job, ctx)).rejects.toMatchObject({
      kind: "malformed_response",
    });
  });
  it("never attempts network without a server credential", async () => {
    const fetcher = vi.fn();
    await expect(
      new BraveSearchDiscoveryProvider("", fetcher).discover(job, ctx),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("health checks credentials rather than treating presence as health", async () => {
    const previous = process.env.BRAVE_SEARCH_API_KEY;
    process.env.BRAVE_SEARCH_API_KEY = "x";
    expect(
      (await providerHealth("brave", async () => new Response("bad", { status: 503 })))
        .state,
    ).toBe("configured_unhealthy");
    if (previous === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = previous;
  });
});
describe("bounded website research", () => {
  it("respects page budget and records partial failures", async () => {
    const fetcher = vi.fn(async (url: string | URL) =>
      String(url).includes("about")
        ? new Response("failure", { status: 500 })
        : new Response(
            '<html><body>Acme officially announced an AI initiative focused on clinical operations and published details for customers and partners.<a href="/about">About</a><a href="/careers">Jobs</a></body></html>',
            { status: 200 },
          ),
    );
    const provider = new BoundedWebsiteResearchProvider(fetcher, {
      maxPages: 2,
      maxExternalSources: 0,
      maxCharacters: 10000,
      maxRuntimeMs: 5000,
      maxProviderCost: 0,
    });
    const result = await provider.research(
      {
        providerRecordId: "p",
        name: "Acme",
        website: "https://acme.test",
        sourceUrl: "https://acme.test",
        discoveredAt: ctx.now.toISOString(),
      },
      ctx,
    );
    expect(result.telemetry.pagesAttempted).toBe(2);
    expect(result.telemetry.pagesSuccessful).toBe(1);
    expect(result.claims).toHaveLength(1);
    expect(result.signals.map((s) => s.type)).toContain("ai_initiative");
  });
  it("stops at the character budget", async () => {
    const provider = new BoundedWebsiteResearchProvider(
      async () => new Response(`<body>${"growth ".repeat(100)}</body>`),
      {
        maxPages: 5,
        maxExternalSources: 0,
        maxCharacters: 100,
        maxRuntimeMs: 5000,
        maxProviderCost: 0,
      },
    );
    const result = await provider.research(
      {
        providerRecordId: "p",
        name: "Acme",
        website: "https://acme.test",
        sourceUrl: "https://acme.test",
        discoveredAt: ctx.now.toISOString(),
      },
      ctx,
    );
    expect(result.telemetry.stoppedReason).toBe("character_limit");
  });
});
