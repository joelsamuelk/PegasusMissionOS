import type {
  RegistryLookup,
  RegistryQuery,
  RegistryRecord,
} from "@/lib/organisation-intelligence/registry";

/**
 * A register, for tests.
 *
 * The port exists so the suite never touches a live regulator API. This
 * implementation covers the four outcomes that actually matter and that a
 * happy-path fixture would hide:
 *
 *   a record exists              → the normal case
 *   no such record               → null, which is an answer
 *   the register is unreachable  → throws, which is NOT an answer
 *   the register is unconfigured → `available: false`
 *
 * The third is the one worth being careful about. An outage reported as "no
 * record found" would tell a charity it is not registered, on a profile funders
 * read.
 */

export const FIXTURE_CHARITY_NUMBER = "1184023";

export const FIXTURE_RECORD: RegistryRecord = {
  register: "charity_commission_ew",
  registrationNumber: FIXTURE_CHARITY_NUMBER,
  legalName: "Northstar Community Foundation",
  status: "registered",
  sourceUrl: `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${FIXTURE_CHARITY_NUMBER}`,
  retrievedAt: "2026-08-17T09:00:00.000Z",
  registeredAddress: "12 Kirkgate, Leeds, LS1 6BY",
  websiteUrl: "https://northstarcf.org.uk",
  registrationDate: "2019-04-01",
  activities:
    "Supporting young people aged 14 to 25 in West Yorkshire into education, employment or training.",
  objects:
    "To advance the education and relieve the needs of young people in West Yorkshire, in particular by providing mentoring, employability support and digital access.",
  areaOfOperation: ["West Yorkshire", "Leeds", "Bradford"],
  trustees: ["Grace Bello", "Martin Adeyemi", "Susan Clarke"],
  financialYearEnd: "2026-03-31",
  latestIncome: { amountMinorUnits: 48_200_000, currency: "GBP", periodEnd: "2026-03-31" },
  latestExpenditure: { amountMinorUnits: 44_900_000, currency: "GBP", periodEnd: "2026-03-31" },
  publishedDocuments: [
    {
      title: "Annual report and accounts 2026",
      url: "https://register-of-charities.charitycommission.gov.uk/documents/1184023/accounts-2026.pdf",
      publishedAt: "2026-07-01",
    },
  ],
};

export interface FixtureRegisterOptions {
  record?: RegistryRecord | null;
  available?: boolean;
  /** Simulate an outage. Distinct from "no such record". */
  unreachable?: boolean;
}

export function createFixtureRegister(options: FixtureRegisterOptions = {}): RegistryLookup & {
  calls: RegistryQuery[];
} {
  const calls: RegistryQuery[] = [];

  return {
    calls,
    register: "charity_commission_ew",
    authority: "regulator",
    available: options.available ?? true,
    countries: ["GB"],
    async lookup(query) {
      calls.push(query);
      if (options.unreachable) {
        throw new Error("register timed out");
      }
      if (options.record === null) return null;
      const record = options.record ?? FIXTURE_RECORD;
      // Only answer for the number that was asked about.
      return record.registrationNumber === query.registrationNumber.replace(/[^0-9]/g, "")
        ? record
        : null;
    },
  };
}
