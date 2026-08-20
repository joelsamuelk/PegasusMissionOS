import type {
  RegistryLookup,
  RegistryQuery,
  RegistryRecord,
} from "@/lib/organisation-intelligence/registry";
import type { FetchLike } from "@/server/commercial/live-providers";

/**
 * Register implementations.
 *
 * These are the only files in the customer product that know the names of
 * specific registers. Everything above them depends on `RegistryLookup`, so
 * adding the Scottish or Northern Irish regulator, or an American Form 990
 * source, is a new file here and no change anywhere else.
 *
 * Two behaviours are shared and both matter more than the field mapping:
 *
 * - **Not found returns null; unreachable throws.** The caller reports the
 *   first to the user and the second as an outage. Collapsing them would let a
 *   register having a bad afternoon look like evidence that a charity is not
 *   registered, on a profile funders will read.
 * - **Absent fields stay absent.** No empty strings, no zeroes standing in for
 *   "not published". A missing income figure must not become an income of nil.
 */

const timeout = (ms: number) => AbortSignal.timeout(ms);

class RegisterUnavailable extends Error {
  constructor(register: string, detail: string) {
    super(`${register}: ${detail}`);
    this.name = "RegisterUnavailable";
  }
}

async function readJson(response: Response, register: string): Promise<unknown> {
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new RegisterUnavailable(register, `responded ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new RegisterUnavailable(register, "response was not readable JSON");
  }
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const money = (value: unknown, currency = "GBP", periodEnd?: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? { amountMinorUnits: Math.round(value * 100), currency, periodEnd }
    : undefined;

/**
 * The Charity Commission for England and Wales.
 *
 * Looked up by registered charity number, which is the identifier a user has
 * to hand. The search-by-name provider that already exists for prospecting is
 * a different operation and is deliberately not reused: prospecting asks "who
 * matches this description", onboarding asks "confirm this exact organisation".
 */
export class CharityCommissionRegister implements RegistryLookup {
  readonly register = "charity_commission_ew" as const;
  readonly authority = "regulator" as const;
  readonly countries = ["GB", "UK", "EW"] as const;

  constructor(
    private readonly apiKey = process.env.CHARITY_COMMISSION_API_KEY ?? "",
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = process.env.CHARITY_COMMISSION_API_URL ??
      "https://api.charitycommission.gov.uk/register/api",
  ) {}

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async lookup(query: RegistryQuery): Promise<RegistryRecord | null> {
    if (!this.available) {
      throw new RegisterUnavailable(this.register, "no API key is configured");
    }

    const number = query.registrationNumber.replace(/[^0-9]/g, "");
    if (!number) return null;

    const response = await this.fetcher(
      `${this.baseUrl}/charitydetails/${encodeURIComponent(number)}/0`,
      {
        headers: { Accept: "application/json", "Ocp-Apim-Subscription-Key": this.apiKey },
        signal: timeout(8000),
      },
    );

    const body = (await readJson(response, this.register)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return null;

    const name = text(body.charity_name);
    if (!name) return null;

    const status = text(body.reg_status);
    const periodEnd = text(body.latest_acc_fin_period_end_date)?.slice(0, 10);

    return {
      register: this.register,
      registrationNumber: number,
      legalName: name,
      // "R" is registered; "RM" is removed. Anything else is not guessed at.
      status: status === "R" ? "registered" : status === "RM" ? "removed" : "unknown",
      sourceUrl: `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${number}`,
      retrievedAt: new Date().toISOString(),
      tradingNames: Array.isArray(body.other_names)
        ? body.other_names
            .map((entry) =>
              entry && typeof entry === "object"
                ? text((entry as Record<string, unknown>).charity_name)
                : undefined,
            )
            .filter((value): value is string => Boolean(value))
        : undefined,
      registeredAddress: joinAddress(body),
      websiteUrl: text(body.web),
      registrationDate: text(body.date_of_registration)?.slice(0, 10),
      activities: text(body.activities),
      objects: text(body.charitable_objects),
      areaOfOperation: Array.isArray(body.area_of_operation)
        ? body.area_of_operation
            .map((entry) =>
              entry && typeof entry === "object"
                ? text((entry as Record<string, unknown>).geographic_area_description)
                : text(entry),
            )
            .filter((value): value is string => Boolean(value))
        : undefined,
      financialYearEnd: text(body.fin_period_end_date)?.slice(0, 10) ?? periodEnd,
      latestIncome: money(body.latest_income, "GBP", periodEnd),
      latestExpenditure: money(body.latest_expenditure, "GBP", periodEnd),
      regulatoryNotes: Array.isArray(body.reg_notes)
        ? body.reg_notes
            .map((entry) => text(entry))
            .filter((value): value is string => Boolean(value))
        : undefined,
    };
  }
}

function joinAddress(body: Record<string, unknown>): string | undefined {
  const parts = [
    text(body.address_line_one),
    text(body.address_line_two),
    text(body.address_line_three),
    text(body.address_line_four),
    text(body.address_post_code),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Companies House, for CICs and charitable companies. */
export class CompaniesHouseRegister implements RegistryLookup {
  readonly register = "companies_house" as const;
  readonly authority = "regulator" as const;
  readonly countries = ["GB", "UK"] as const;

  constructor(
    private readonly apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? "",
    private readonly fetcher: FetchLike = fetch,
  ) {}

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async lookup(query: RegistryQuery): Promise<RegistryRecord | null> {
    if (!this.available) {
      throw new RegisterUnavailable(this.register, "no API key is configured");
    }

    const number = query.registrationNumber.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (!number) return null;

    const response = await this.fetcher(
      `https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
        },
        signal: timeout(8000),
      },
    );

    const body = (await readJson(response, this.register)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return null;

    const name = text(body.company_name);
    if (!name) return null;

    const status = text(body.company_status);
    const office = (body.registered_office_address ?? {}) as Record<string, unknown>;

    return {
      register: this.register,
      registrationNumber: number,
      legalName: name,
      status:
        status === "active" ? "registered" : status === "dissolved" ? "dissolved" : "unknown",
      sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${number}`,
      retrievedAt: new Date().toISOString(),
      tradingNames: Array.isArray(body.previous_company_names)
        ? body.previous_company_names
            .map((entry) =>
              entry && typeof entry === "object"
                ? text((entry as Record<string, unknown>).name)
                : undefined,
            )
            .filter((value): value is string => Boolean(value))
        : undefined,
      registeredAddress: [
        text(office.address_line_1),
        text(office.address_line_2),
        text(office.locality),
        text(office.postal_code),
      ]
        .filter(Boolean)
        .join(", "),
      registrationDate: text(body.date_of_creation),
      financialYearEnd: (() => {
        const accounts = body.accounts as Record<string, unknown> | undefined;
        const reference = accounts?.accounting_reference_date as
          | Record<string, unknown>
          | undefined;
        const day = text(reference?.day);
        const month = text(reference?.month);
        return day && month ? `${day}/${month}` : undefined;
      })(),
      regulatoryNotes: (() => {
        const accounts = body.accounts as Record<string, unknown> | undefined;
        return accounts?.overdue === true
          ? ["The register shows accounts as overdue."]
          : undefined;
      })(),
    };
  }
}

/**
 * The registers configured in this deployment.
 *
 * Unconfigured registers are still returned, so `available: false` reaches the
 * discovery service and the user is told that registration could not be
 * confirmed. Filtering them out here would make an unconfigured deployment
 * look like an organisation with no register entry.
 */
export function configuredRegisters(fetcher: FetchLike = fetch): RegistryLookup[] {
  return [new CharityCommissionRegister(undefined, fetcher), new CompaniesHouseRegister(undefined, fetcher)];
}
