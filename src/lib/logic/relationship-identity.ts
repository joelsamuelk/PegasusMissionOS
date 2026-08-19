import type { ExternalOrganisation, Person } from "@/types/domain";

/**
 * Identity resolution and duplicate detection.
 *
 * This ships in Phase 1, before any email integration, deliberately: the point
 * of syncing a mailbox is to attach a message to the right person, and a
 * matcher that guesses is worse than no matcher at all. It is built here, as a
 * pure function with tests, so the sync pipeline has something trustworthy to
 * call when it arrives.
 *
 * The confidence ladder:
 *
 * | Signal                                   | Confidence | Applied automatically |
 * |------------------------------------------|------------|-----------------------|
 * | Exact normalised email match             | high       | yes                   |
 * | Confirmed provider identity mapping      | high       | yes (Phase 5)         |
 * | Email domain ↔ organisation website host | medium     | suggested only        |
 * | Name similarity                          | low        | **never**             |
 *
 * Names are not identity. "S. Ahmed" and "Sarah Ahmed" may be one person or
 * two, and merging them silently destroys data that cannot be recovered.
 */

export type MatchConfidence = "high" | "medium" | "low";

export interface Match<T> {
  record: T;
  confidence: MatchConfidence;
  /** Human-readable justification, shown wherever the match is surfaced. */
  reason: string;
  /** Only ever true for `high`. Everything else requires confirmation. */
  autoApply: boolean;
}

/** Lowercase, trim, and drop the display name from "Name <addr@host>" forms. */
export function normaliseEmail(value: string): string {
  const trimmed = value.trim();
  const angled = /<([^>]+)>/.exec(trimmed);
  return (angled?.[1] ?? trimmed).trim().toLowerCase();
}

export function emailDomain(value: string): string | null {
  const normalised = normaliseEmail(value);
  const at = normalised.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = normalised.slice(at + 1);
  return domain.length > 0 ? domain : null;
}

/** Host of a website URL, without protocol, `www.` or path. */
export function websiteHost(value?: string): string | null {
  if (!value) return null;
  const cleaned =
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] ?? "";
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Resolve a person by email address.
 *
 * Exact match on any of the person's contact points, normalised. This is the
 * only person-level match applied without human confirmation.
 */
export function resolvePersonByEmail(people: Person[], email: string): Match<Person> | null {
  const target = normaliseEmail(email);
  if (!target.includes("@")) return null;

  for (const person of people) {
    const hit = person.emails.find((c) => normaliseEmail(c.value) === target);
    if (hit) {
      return {
        record: person,
        confidence: "high",
        reason: `Exact match on the recorded address ${hit.value}.`,
        autoApply: true,
      };
    }
  }
  return null;
}

/**
 * Suggest an external organisation from an email domain.
 *
 * Medium confidence at best: shared mailboxes, personal addresses and
 * consultants working across bodies all break the assumption. Never applied
 * automatically.
 */
export function suggestOrganisationByEmail(
  organisations: ExternalOrganisation[],
  email: string,
): Match<ExternalOrganisation> | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (FREE_MAIL_HOSTS.has(domain)) return null;

  for (const organisation of organisations) {
    const host = websiteHost(organisation.website);
    if (!host) continue;
    if (host === domain || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)) {
      return {
        record: organisation,
        confidence: "medium",
        reason: `The address domain ${domain} matches this organisation's website.`,
        autoApply: false,
      };
    }
  }
  return null;
}

/** Consumer mail hosts tell you nothing about which organisation someone is at. */
const FREE_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
]);

/**
 * Legal-form suffixes and filler words that carry no identifying signal.
 * "Comic Relief", "Comic Relief UK" and "Comic Relief Ltd" normalise alike.
 */
const NOISE_WORDS = new Set([
  "ltd",
  "limited",
  "plc",
  "llp",
  "inc",
  "incorporated",
  "cic",
  "cio",
  "uk",
  "gb",
  "the",
  "and",
  "of",
  "for",
  "trust",
  "foundation",
  "charity",
  "charitable",
  "group",
  "company",
]);

/** Normalise an organisation name for comparison only. Never for display. */
export function normaliseOrganisationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !NOISE_WORDS.has(word))
    .join(" ")
    .trim();
}

export interface DuplicateCandidate {
  a: ExternalOrganisation;
  b: ExternalOrganisation;
  confidence: MatchConfidence;
  reason: string;
  /**
   * Always false. Merging rewrites foreign keys across grants, applications,
   * interactions and commitments; it is not reversible by an ordinary user and
   * is never done on a name heuristic.
   */
  autoMergeAllowed: false;
}

/**
 * Find external organisations that may be duplicates.
 *
 * Returns candidates for a human to judge. Distinct signals are reported
 * separately so the reviewer knows *why* two records were paired: an identical
 * charity number is far stronger evidence than a similar name, and the UI
 * should say so.
 */
export function findDuplicateCandidates(
  organisations: ExternalOrganisation[],
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (let i = 0; i < organisations.length; i++) {
    for (let j = i + 1; j < organisations.length; j++) {
      const a = organisations[i];
      const b = organisations[j];
      if (!a || !b) continue;

      if (a.charityNumber && b.charityNumber && a.charityNumber === b.charityNumber) {
        candidates.push({
          a,
          b,
          confidence: "high",
          reason: `Both records carry charity number ${a.charityNumber}.`,
          autoMergeAllowed: false,
        });
        continue;
      }

      const hostA = websiteHost(a.website);
      const hostB = websiteHost(b.website);
      if (hostA && hostB && hostA === hostB) {
        candidates.push({
          a,
          b,
          confidence: "medium",
          reason: `Both records use the website ${hostA}.`,
          autoMergeAllowed: false,
        });
        continue;
      }

      const normA = normaliseOrganisationName(a.name);
      const normB = normaliseOrganisationName(b.name);
      if (normA.length > 0 && normA === normB) {
        candidates.push({
          a,
          b,
          confidence: "low",
          reason: `The names "${a.name}" and "${b.name}" differ only by legal form or region.`,
          autoMergeAllowed: false,
        });
      }
    }
  }

  return candidates;
}
