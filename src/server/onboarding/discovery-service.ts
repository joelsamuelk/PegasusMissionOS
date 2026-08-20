import type { OrganisationType } from "@/types/domain";
import {
  registersFor,
  registryCandidates,
  type RegistryLookup,
  type RegistryRecord,
} from "@/lib/organisation-intelligence/registry";
import { normaliseUrl } from "@/lib/organisation-intelligence/url";
import type { ProfileCandidate, ResearchSource } from "@/lib/organisation-intelligence/types";

/**
 * OrganisationDiscoveryService — identity resolution.
 *
 * The first stage of onboarding, and the one everything downstream depends on:
 * establishing *which* organisation this is, before researching it.
 *
 * The reason it is a stage rather than a form field is that the four things a
 * user can type — name, website, country, registration number — are each
 * fallible in a different way. A name is ambiguous, a website may belong to a
 * campaign rather than the charity, a registration number may be mistyped, and
 * a country only narrows which register applies. Resolving them against each
 * other catches the common mistakes early, while a person is still present to
 * correct them.
 *
 * What it will not do is guess. Where the register disagrees with what was
 * typed, that is surfaced as a discrepancy for a human, never silently
 * corrected — a workspace quietly created for the wrong charity is close to
 * unrecoverable.
 */

export interface OnboardingInput {
  name: string;
  websiteUrl?: string;
  /** ISO 3166-1 alpha-2. Decides which registers can answer. */
  country?: string;
  registrationNumber?: string;
  organisationType?: OrganisationType;
}

export interface IdentityDiscrepancy {
  field: "name" | "website" | "status";
  entered: string;
  found: string;
  /** Phrased for the person who typed it, not for a log. */
  message: string;
}

export interface IdentityResolution {
  input: OnboardingInput;
  /** Normalised, or undefined when what was typed was not a usable address. */
  websiteUrl?: string;
  records: RegistryRecord[];
  sources: ResearchSource[];
  candidates: ProfileCandidate[];
  discrepancies: IdentityDiscrepancy[];
  /** Registers that could have answered but were unreachable or unconfigured. */
  unavailableRegisters: { register: string; reason: string }[];
  /** Documents the register publishes, handed to document discovery. */
  registryDocuments: { title: string; url: string; kind?: string; publishedAt?: string }[];
}

export interface DiscoveryDependencies {
  registers: readonly RegistryLookup[];
  now: () => Date;
  makeId: (prefix: string) => string;
}

/**
 * Compare two organisation names loosely enough to tolerate the real
 * variation — "The Henderson Trust" against "HENDERSON TRUST (THE)" — and
 * strictly enough to notice a different organisation.
 */
function namesAgree(a: string, b: string): boolean {
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(the|limited|ltd|cic|charity|trust|foundation|uk)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

export class OrganisationDiscoveryService {
  constructor(private readonly deps: DiscoveryDependencies) {}

  async resolve(input: OnboardingInput, organisationId: string): Promise<IdentityResolution> {
    const { registers, now, makeId } = this.deps;

    const websiteUrl = input.websiteUrl ? (normaliseUrl(input.websiteUrl) ?? undefined) : undefined;

    const resolution: IdentityResolution = {
      input,
      websiteUrl,
      records: [],
      sources: [],
      candidates: [],
      discrepancies: [],
      unavailableRegisters: [],
      registryDocuments: [],
    };

    if (input.websiteUrl && !websiteUrl) {
      resolution.discrepancies.push({
        field: "website",
        entered: input.websiteUrl,
        found: "",
        message:
          "That website address could not be read, so Pegasus did not research the site. " +
          "Check it and try again, or continue without it.",
      });
    }

    if (!input.registrationNumber?.trim()) return resolution;

    const applicable = registersFor(registers, input.country);
    if (applicable.length === 0) {
      resolution.unavailableRegisters.push({
        register: input.country ?? "unknown",
        reason:
          "No official register is connected for that country, so registration details " +
          "could not be confirmed.",
      });
      return resolution;
    }

    for (const register of applicable) {
      let record: RegistryRecord | null = null;
      try {
        record = await register.lookup({
          registrationNumber: input.registrationNumber.trim(),
          country: input.country,
          name: input.name,
        });
      } catch (error) {
        // Unreachable is not the same as "no such record". Reporting an outage
        // as evidence that a charity is unregistered would be a serious thing
        // to get wrong on a funder-facing profile.
        resolution.unavailableRegisters.push({
          register: register.register,
          reason: `The register could not be reached (${
            error instanceof Error ? error.message : "unknown error"
          }). Registration details were not confirmed.`,
        });
        continue;
      }

      if (!record) continue;

      const source: ResearchSource = {
        id: makeId("src"),
        organisationId,
        type: "regulator",
        title: `${record.register} record for ${record.registrationNumber}`,
        url: record.sourceUrl,
        publisher: record.register,
        authority: "regulator",
        discoveredAt: now().toISOString(),
        retrievedAt: record.retrievedAt,
        extractionStatus: "extracted",
      };

      resolution.records.push(record);
      resolution.sources.push(source);
      resolution.candidates.push(
        ...registryCandidates({
          record,
          source,
          organisationId,
          makeId: () => makeId("cand"),
        }),
      );
      resolution.registryDocuments.push(...(record.publishedDocuments ?? []));

      if (!namesAgree(input.name, record.legalName)) {
        resolution.discrepancies.push({
          field: "name",
          entered: input.name,
          found: record.legalName,
          message:
            `The register holds this number under "${record.legalName}". ` +
            "Check the registration number is right before continuing.",
        });
      }

      if (record.status !== "registered") {
        resolution.discrepancies.push({
          field: "status",
          entered: input.registrationNumber,
          found: record.status,
          message:
            record.status === "removed"
              ? "The register shows this organisation as removed. Funders check this, so it is worth resolving."
              : record.status === "dissolved"
                ? "The register shows this organisation as dissolved."
                : "The register did not state a registration status.",
        });
      }

      if (websiteUrl && record.websiteUrl) {
        const registered = normaliseUrl(record.websiteUrl);
        if (registered && new URL(registered).host !== new URL(websiteUrl).host) {
          resolution.discrepancies.push({
            field: "website",
            entered: websiteUrl,
            found: registered,
            message:
              "The register lists a different website. Either may be right, because a campaign site " +
              "and a charity site are often separate, but it is worth checking.",
          });
        }
      }
    }

    return resolution;
  }
}
