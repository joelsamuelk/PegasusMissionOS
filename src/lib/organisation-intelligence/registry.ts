import { sanitiseSourceText } from "./sanitise";
import type {
  CandidateField,
  ProfileCandidate,
  ResearchSource,
  SourceAuthority,
} from "./types";

/**
 * Official registers.
 *
 * A register is the highest-authority source Mission OS can reach: it is the
 * one place where an organisation's legal name and number are not a claim but
 * a matter of public record. That is why `authorityFor` ranks it above the
 * organisation's own website, and why a conflict between the two resolves
 * towards the register.
 *
 * The port is defined here, provider-independent, and implemented in
 * `server/onboarding/`. Companies House and the Charity Commission are
 * *implementations* — neither name appears in this file or in any entity, per
 * the provider-independence rule.
 */

/** Which register, as a stable identifier rather than a company name. */
export type RegisterId =
  | "charity_commission_ew"
  | "oscr"
  | "charity_commission_ni"
  | "companies_house"
  | "acnc"
  | "irs_990"
  | (string & {});

export type RegistrationStatus = "registered" | "removed" | "dissolved" | "unknown";

/**
 * A normalised register record.
 *
 * Every field is optional except identity, because registers differ in what
 * they publish and an absent field must stay absent rather than becoming an
 * empty string that looks like an answer.
 */
export interface RegistryRecord {
  register: RegisterId;
  registrationNumber: string;
  legalName: string;
  status: RegistrationStatus;
  /** The register's own page for this organisation. */
  sourceUrl: string;
  retrievedAt: string;

  tradingNames?: string[];
  registeredAddress?: string;
  websiteUrl?: string;
  registrationDate?: string;
  /** As the register states them, in its own vocabulary. */
  activities?: string;
  objects?: string;
  areaOfOperation?: string[];
  trustees?: string[];
  financialYearEnd?: string;
  latestIncome?: { amountMinorUnits: number; currency: string; periodEnd?: string };
  latestExpenditure?: { amountMinorUnits: number; currency: string; periodEnd?: string };
  /** Documents the register itself publishes, for document discovery. */
  publishedDocuments?: { title: string; url: string; kind?: string; publishedAt?: string }[];
  /** Anything the register flags: overdue accounts, an open inquiry. */
  regulatoryNotes?: string[];
}

export interface RegistryQuery {
  registrationNumber: string;
  /** ISO 3166-1 alpha-2, used to choose a register when several could apply. */
  country?: string;
  name?: string;
}

/**
 * The lookup port.
 *
 * `lookup` returns null for "this register has no such record", and throws for
 * "this register could not be reached". The two are different: the first is an
 * answer the user should see, the second is an outage that must not be
 * presented as evidence the organisation is unregistered.
 */
export interface RegistryLookup {
  readonly register: RegisterId;
  readonly authority: SourceAuthority;
  /** Whether the register is configured and usable in this deployment. */
  readonly available: boolean;
  /** Registers this can answer for, by ISO country code. */
  readonly countries: readonly string[];
  lookup(query: RegistryQuery): Promise<RegistryRecord | null>;
}

/** Pick the registers that could answer for a country. */
export function registersFor(
  registers: readonly RegistryLookup[],
  country: string | undefined,
): RegistryLookup[] {
  const code = (country ?? "GB").toUpperCase();
  return registers.filter((r) => r.available && r.countries.includes(code));
}

/**
 * Project a register record into candidates.
 *
 * Registry values are `registry`-method candidates at regulator authority, and
 * they are still **candidates**: high authority is not confirmation. A register
 * can be out of date, a charity can trade under a different name, and the
 * organisation is the only party that can say which is current. This is the
 * same rule that stops a 0.98-confidence extraction becoming `verified`.
 */
export function registryCandidates(input: {
  record: RegistryRecord;
  source: ResearchSource;
  organisationId: string;
  makeId: () => string;
}): ProfileCandidate[] {
  const { record, source, organisationId, makeId } = input;
  const candidates: ProfileCandidate[] = [];

  const push = (
    field: CandidateField,
    value: string | undefined,
    locator: string,
    confidence: number,
  ) => {
    const trimmed = value?.trim();
    if (!trimmed) return;

    // Register text is public content like any other. It is not a plausible
    // injection vector today, but running it through the same sanitiser keeps
    // one path rather than two, and the day a register echoes a user-supplied
    // description is the day the second path would have been the gap.
    const sanitised = sanitiseSourceText(trimmed);

    candidates.push({
      id: makeId(),
      organisationId,
      field,
      value: sanitised.text,
      confidence,
      method: "registry",
      sourceId: source.id,
      sourceUrl: record.sourceUrl,
      authority: "regulator",
      locator,
      extractedAt: record.retrievedAt,
      verificationState: "ai_extracted",
      injectionSuspected: sanitised.injectionSuspected || undefined,
    });
  };

  // Identity. A register states these authoritatively, hence the confidence.
  push("legalName", record.legalName, `${record.register}:name`, 0.97);
  push(
    record.register === "companies_house" ? "companyNumber" : "registrationNumber",
    record.registrationNumber,
    `${record.register}:number`,
    0.99,
  );
  push("registeredAddress", record.registeredAddress, `${record.register}:address`, 0.9);
  push("websiteUrl", record.websiteUrl, `${record.register}:website`, 0.85);
  push("financialYearEnd", record.financialYearEnd, `${record.register}:financial_year_end`, 0.92);

  for (const [index, name] of (record.tradingNames ?? []).entries()) {
    push("tradingName", name, `${record.register}:trading_name[${index}]`, 0.88);
  }

  // The register's own description of what the organisation does. Lower
  // confidence than identity: charitable objects are a legal formula, and they
  // are often a poor description of what the organisation actually delivers.
  push("description", record.activities, `${record.register}:activities`, 0.7);
  push("missionStatement", record.objects, `${record.register}:objects`, 0.6);

  for (const [index, area] of (record.areaOfOperation ?? []).entries()) {
    push("geography", area, `${record.register}:area_of_operation[${index}]`, 0.85);
  }

  for (const [index, trustee] of (record.trustees ?? []).entries()) {
    push("trustee", trustee, `${record.register}:trustee[${index}]`, 0.94);
  }

  // Financial figures carry the period they belong to. A bare income figure
  // with no year is not usable in a report and should not look as though it is.
  if (record.latestIncome) {
    push(
      "annualIncome",
      formatMoney(record.latestIncome),
      `${record.register}:income${
        record.latestIncome.periodEnd ? `@${record.latestIncome.periodEnd}` : ""
      }`,
      0.95,
    );
  }
  if (record.latestExpenditure) {
    push(
      "annualExpenditure",
      formatMoney(record.latestExpenditure),
      `${record.register}:expenditure${
        record.latestExpenditure.periodEnd ? `@${record.latestExpenditure.periodEnd}` : ""
      }`,
      0.95,
    );
  }

  // Status is recorded as a fact rather than silently gating anything. A
  // removed charity is a real situation a person must be told about, not an
  // error state.
  push("regulatorStatus", statusText(record), `${record.register}:status`, 0.99);

  return candidates;
}

function formatMoney(money: { amountMinorUnits: number; currency: string; periodEnd?: string }) {
  const major = money.amountMinorUnits / 100;
  const formatted = `${money.currency} ${major.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
  return money.periodEnd ? `${formatted} (year ending ${money.periodEnd})` : formatted;
}

function statusText(record: RegistryRecord): string {
  const base =
    record.status === "registered"
      ? "Registered"
      : record.status === "removed"
        ? "Removed from the register"
        : record.status === "dissolved"
          ? "Dissolved"
          : "Status not stated by the register";
  const notes = record.regulatoryNotes?.length ? `. ${record.regulatoryNotes.join(". ")}` : "";
  return `${base}${notes}`;
}
