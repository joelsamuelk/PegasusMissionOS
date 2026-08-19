import type {
  DiscoveryCandidate,
  DiscoveryCapability,
  DiscoveryJob,
  ProviderContext,
  ProspectDiscoveryProvider,
} from "@/lib/commercial/discovery";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "not_configured"
      | "rate_limited"
      | "timeout"
      | "malformed_response"
      | "upstream_failure",
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
const timeoutSignal = (milliseconds: number) => AbortSignal.timeout(milliseconds);
async function json(response: Response) {
  if (response.status === 429)
    throw new ProviderError(
      "Provider rate limit reached.",
      "rate_limited",
      Number(response.headers.get("retry-after") ?? 60),
    );
  if (!response.ok)
    throw new ProviderError(
      `Provider returned HTTP ${response.status}.`,
      "upstream_failure",
    );
  try {
    return await response.json();
  } catch {
    throw new ProviderError("Provider returned malformed JSON.", "malformed_response");
  }
}

export class BraveSearchDiscoveryProvider implements ProspectDiscoveryProvider {
  readonly id = "brave_search";
  readonly capabilities: ReadonlySet<DiscoveryCapability> = new Set([
    "organisationDiscovery",
    "newsSignals",
    "fundingSignals",
    "jobSignals",
    "websiteResearch",
    "publicDocumentResearch",
  ]);
  constructor(
    private readonly apiKey = process.env.BRAVE_SEARCH_API_KEY ?? "",
    private readonly fetcher: FetchLike = fetch,
  ) {}
  async discover(
    job: DiscoveryJob,
    context: ProviderContext,
  ): Promise<DiscoveryCandidate[]> {
    if (!this.apiKey)
      throw new ProviderError("Brave Search is not configured.", "not_configured");
    const query = [
      job.searchCriteria,
      ...job.signalRequirements,
      ...job.geography,
      ...job.sectors,
      "official",
    ]
      .filter(Boolean)
      .join(" ");
    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(25, Math.max(1, 25))}&country=gb&search_lang=en`,
        {
          headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
          signal: timeoutSignal(8000),
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError")
        throw new ProviderError("Brave Search timed out.", "timeout");
      throw error;
    }
    const body = (await json(response)) as { web?: { results?: unknown[] } };
    if (!Array.isArray(body.web?.results))
      throw new ProviderError(
        "Brave Search response omitted web results.",
        "malformed_response",
      );
    const seen = new Set<string>();
    return body.web.results.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>,
        url = typeof item.url === "string" ? item.url : "",
        title = typeof item.title === "string" ? item.title.trim() : "";
      let host: string;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return [];
      }
      if (!title || seen.has(host)) return [];
      seen.add(host);
      return [
        {
          providerRecordId: `brave:${host}`,
          name: title.replace(/\s+[|–-].*$/, "").trim(),
          website: `https://${host}`,
          description:
            typeof item.description === "string" ? item.description : undefined,
          sourceUrl: url,
          discoveredAt: context.now.toISOString(),
        },
      ];
    });
  }
}

export class CompaniesHouseDiscoveryProvider implements ProspectDiscoveryProvider {
  readonly id = "companies_house";
  readonly capabilities: ReadonlySet<DiscoveryCapability> = new Set([
    "organisationDiscovery",
  ]);
  constructor(
    private readonly apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? "",
    private readonly fetcher: FetchLike = fetch,
  ) {}
  async discover(
    job: DiscoveryJob,
    context: ProviderContext,
  ): Promise<DiscoveryCandidate[]> {
    if (!this.apiKey)
      throw new ProviderError("Companies House is not configured.", "not_configured");
    const response = await this.fetcher(
      `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(job.searchCriteria)}&items_per_page=25`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
        },
        signal: timeoutSignal(8000),
      },
    );
    const body = (await json(response)) as { items?: unknown[] };
    if (!Array.isArray(body.items))
      throw new ProviderError(
        "Companies House response omitted items.",
        "malformed_response",
      );
    return body.items.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const x = raw as Record<string, unknown>;
      if (typeof x.company_number !== "string" || typeof x.title !== "string") return [];
      // A dissolved or insolvent company is a register record, never a prospect.
      if (x.company_status !== "active") return [];
      return [
        {
          providerRecordId: `companies-house:${x.company_number}`,
          name: x.title,
          registrationIdentifier: `companies-house:${x.company_number}`,
          description: typeof x.description === "string" ? x.description : undefined,
          geography: "United Kingdom",
          sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${x.company_number}`,
          discoveredAt: context.now.toISOString(),
        },
      ];
    });
  }
}

export interface ProviderIntegrationMetadata {
  provider: string;
  providerRecordId: string;
  canonicalEntityId?: string;
  sourceUrl: string;
  retrievedAt: string;
  rawVersion: string;
}
export class CharityCommissionDiscoveryProvider implements ProspectDiscoveryProvider {
  readonly id = "charity_commission_ew";
  readonly capabilities: ReadonlySet<DiscoveryCapability> = new Set([
    "organisationDiscovery",
    "publicDocumentResearch",
  ]);
  constructor(
    private readonly apiKey = process.env.CHARITY_COMMISSION_API_KEY ?? "",
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = process.env.CHARITY_COMMISSION_API_URL ??
      "https://api.charitycommission.gov.uk/register/api",
  ) {}
  async discover(
    job: DiscoveryJob,
    context: ProviderContext,
  ): Promise<DiscoveryCandidate[]> {
    if (!this.apiKey)
      throw new ProviderError("Charity Commission is not configured.", "not_configured");
    const term = job.searchCriteria.trim();
    if (!term)
      throw new ProviderError(
        "Charity Commission name search requires a term.",
        "malformed_response",
      );
    const response = await this.fetcher(
      `${this.baseUrl}/searchCharityName/${encodeURIComponent(term)}`,
      {
        headers: { Accept: "application/json", "Ocp-Apim-Subscription-Key": this.apiKey },
        signal: timeoutSignal(8000),
      },
    );
    const body = await json(response);
    if (!Array.isArray(body))
      throw new ProviderError(
        "Charity Commission response was not a result list.",
        "malformed_response",
      );
    return body.slice(0, 25).flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const x = raw as Record<string, unknown>,
        number =
          typeof x.reg_charity_number === "number"
            ? String(x.reg_charity_number)
            : typeof x.reg_charity_number === "string"
              ? x.reg_charity_number
              : "",
        name = typeof x.charity_name === "string" ? x.charity_name.trim() : "";
      if (!number || !name || x.reg_status === "RM") return [];
      const suffix =
          typeof x.group_subsid_suffix === "number" ? x.group_subsid_suffix : 0,
        sourceUrl = `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${number}`;
      return [
        {
          providerRecordId: `ccew:${number}:${suffix}`,
          name,
          registrationIdentifier: `ccew:${number}`,
          description:
            "Registered charity in England and Wales. Registry presence is identity evidence, not buying intent.",
          geography: "England and Wales",
          sourceUrl,
          discoveredAt: context.now.toISOString(),
        },
      ];
    });
  }
}

export type ProviderHealthState = "connected" | "configured_unhealthy" | "not_configured";
export async function providerHealth(
  name: "brave" | "companies_house" | "charity_commission",
  fetcher: FetchLike = fetch,
): Promise<{ state: ProviderHealthState; detail: string; checkedAt: string }> {
  const checkedAt = new Date().toISOString(),
    key =
      name === "brave"
        ? process.env.BRAVE_SEARCH_API_KEY
        : name === "companies_house"
          ? process.env.COMPANIES_HOUSE_API_KEY
          : process.env.CHARITY_COMMISSION_API_KEY;
  if (!key)
    return { state: "not_configured", detail: "Server credential is absent.", checkedAt };
  try {
    const url =
      name === "brave"
        ? "https://api.search.brave.com/res/v1/web/search?q=Pegasus&count=1"
        : name === "companies_house"
          ? "https://api.company-information.service.gov.uk/search/companies?q=Pegasus&items_per_page=1"
          : `${process.env.CHARITY_COMMISSION_API_URL ?? "https://api.charitycommission.gov.uk/register/api"}/searchCharityName/Pegasus`;
    const headers: Record<string, string> =
      name === "brave"
        ? { "X-Subscription-Token": key, Accept: "application/json" }
        : name === "companies_house"
          ? { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` }
          : { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" };
    const response = await fetcher(url, { headers, signal: timeoutSignal(5000) });
    return response.ok
      ? {
          state: "connected",
          detail: "Credential passed a live read-only health check.",
          checkedAt,
        }
      : {
          state: "configured_unhealthy",
          detail: `Health check returned HTTP ${response.status}.`,
          checkedAt,
        };
  } catch {
    return {
      state: "configured_unhealthy",
      detail: "Health check could not reach the provider.",
      checkedAt,
    };
  }
}
