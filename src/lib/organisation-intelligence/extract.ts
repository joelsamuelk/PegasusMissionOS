import { sanitiseSourceText } from "./sanitise";
import { normaliseUrl } from "./url";
import type {
  CandidateField,
  ExtractionMethod,
  ProfileCandidate,
  ResearchSource,
} from "./types";

/**
 * Deterministic extractors.
 *
 * No model is involved here. Structured markup (JSON-LD `schema.org/Organization`,
 * OpenGraph, meta) states facts unambiguously, and registration numbers,
 * emails and phone numbers are pattern-matched. This delivers real extraction
 * with zero AI dependency, and establishes the provenance contract that
 * semantic (AI) extraction must satisfy later.
 *
 * Every extracted value carries a `locator` describing exactly where in the
 * source it came from, so "where did you get this?" is answerable precisely.
 */

export interface ExtractionInput {
  source: ResearchSource;
  html: string;
  organisationId: string;
  extractedAt: string;
  /** Injected so ids are deterministic in tests. */
  makeId: () => string;
}

interface RawFact {
  field: CandidateField;
  value: string;
  confidence: number;
  method: ExtractionMethod;
  locator: string;
}

// --- Small, dependency-free HTML helpers ---------------------------------

function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  return input.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (named[key]) return named[key]!;
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function metaContent(html: string, matcher: RegExp): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!matcher.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (content?.[1]) return decodeEntities(content[1]).trim();
  }
  return null;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ? decodeEntities(match[1]).trim() : null;
}

// --- JSON-LD -------------------------------------------------------------

type JsonLdNode = Record<string, unknown>;

function collectJsonLdNodes(html: string): JsonLdNode[] {
  const blocks = html.match(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return [];

  const nodes: JsonLdNode[] = [];
  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Malformed JSON-LD is common. Skip it rather than failing the page.
      continue;
    }
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const item = queue.shift();
      if (Array.isArray(item)) queue.push(...item);
      else if (item && typeof item === "object") {
        nodes.push(item as JsonLdNode);
        const graph = (item as JsonLdNode)["@graph"];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    }
  }
  return nodes;
}

const ORGANISATION_TYPES = new Set([
  "organization",
  "organisation",
  "ngo",
  "nonprofit",
  "nonprofitorganization",
  "charitableorganization",
  "corporation",
  "localbusiness",
]);

function isOrganisationNode(node: JsonLdNode): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === "string" && ORGANISATION_TYPES.has(t.toLowerCase()),
  );
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function extractJsonLd(html: string): RawFact[] {
  const facts: RawFact[] = [];

  for (const node of collectJsonLdNodes(html)) {
    if (!isOrganisationNode(node)) continue;

    const map: [CandidateField, unknown, string][] = [
      ["legalName", node.legalName ?? node.name, "name"],
      ["tradingName", node.alternateName, "alternateName"],
      ["description", node.description, "description"],
      ["websiteUrl", node.url, "url"],
      ["contactEmail", node.email, "email"],
      ["contactPhone", node.telephone, "telephone"],
      ["yearFounded", node.foundingDate, "foundingDate"],
      ["logoUrl", typeof node.logo === "string" ? node.logo : undefined, "logo"],
    ];

    for (const [field, raw, key] of map) {
      const value = asText(raw);
      if (!value) continue;
      facts.push({
        field,
        value: field === "yearFounded" ? value.slice(0, 4) : value,
        // Structured markup the organisation published about itself: the
        // extractor is certain what the source says. That is not the same as
        // the statement being verified — see ProfileCandidate.
        confidence: 0.98,
        method: "json-ld",
        locator: `json-ld:Organization.${key}`,
      });
    }

    const address = node.address;
    if (address && typeof address === "object") {
      const parts = ["streetAddress", "addressLocality", "addressRegion", "postalCode"]
        .map((k) => asText((address as JsonLdNode)[k]))
        .filter((v): v is string => Boolean(v));
      if (parts.length) {
        facts.push({
          field: "registeredAddress",
          value: parts.join(", "),
          confidence: 0.95,
          method: "json-ld",
          locator: "json-ld:Organization.address",
        });
      }
      const region = asText((address as JsonLdNode).addressRegion);
      if (region) {
        facts.push({
          field: "operatingRegions",
          value: region,
          confidence: 0.6,
          method: "json-ld",
          locator: "json-ld:Organization.address.addressRegion",
        });
      }
    }
  }

  return facts;
}

// --- OpenGraph and meta --------------------------------------------------

function extractMeta(html: string): RawFact[] {
  const facts: RawFact[] = [];

  const ogSiteName = metaContent(html, /property\s*=\s*["']og:site_name["']/i);
  if (ogSiteName) {
    facts.push({
      field: "tradingName",
      value: ogSiteName,
      confidence: 0.75,
      method: "meta",
      locator: "meta:og:site_name",
    });
  }

  const description =
    metaContent(html, /property\s*=\s*["']og:description["']/i) ??
    metaContent(html, /name\s*=\s*["']description["']/i);
  if (description) {
    facts.push({
      field: "description",
      value: description,
      // A meta description is marketing copy, not a mission statement.
      confidence: 0.55,
      method: "meta",
      locator: "meta:description",
    });
  }

  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    // Titles are usually "Org Name | Tagline"; the first segment is the name.
    const name = title.split(/[|·—–-]/)[0]?.trim();
    if (name && name.length > 2) {
      facts.push({
        field: "tradingName",
        value: name,
        confidence: 0.4,
        method: "meta",
        locator: "html:title",
      });
    }
  }

  return facts;
}

// --- Patterns ------------------------------------------------------------

/**
 * Registration numbers.
 *
 * Only matched when adjacent to an explicit label. A bare six-digit number on
 * a page is not a charity number, and guessing would hand a fabricated
 * regulatory identifier to a funder-facing profile.
 */
const REGISTRATION_PATTERNS: { pattern: RegExp; label: string; confidence: number }[] = [
  {
    pattern:
      /\b(?:registered\s+)?charity\s+(?:registration\s+)?(?:no\.?|number|#)\s*[:\s]\s*([0-9]{6,8}(?:-[0-9]+)?)/i,
    label: "charity number",
    confidence: 0.9,
  },
  {
    pattern: /\bSCIO\s*(?:no\.?|number)?\s*[:\s]\s*(SC[0-9]{6})\b/i,
    label: "Scottish charity number",
    confidence: 0.9,
  },
  {
    pattern: /\b(SC0[0-9]{5})\b/,
    label: "Scottish charity number",
    confidence: 0.7,
  },
  {
    pattern:
      /\b(?:company|companies house)\s+(?:registration\s+)?(?:no\.?|number|#)\s*[:\s]\s*([0-9]{6,8}|[A-Z]{2}[0-9]{6})/i,
    label: "company number",
    confidence: 0.85,
  },
  {
    pattern: /\bEIN\s*[:\s]\s*([0-9]{2}-[0-9]{7})\b/i,
    label: "EIN",
    confidence: 0.9,
  },
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?){2,4}\d{2,4}/;

function extractPatterns(text: string): RawFact[] {
  const facts: RawFact[] = [];

  for (const { pattern, label, confidence } of REGISTRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      facts.push({
        field: "registrationNumber",
        value: `${label}: ${match[1]}`,
        confidence,
        method: "pattern",
        locator: `pattern:${label}`,
      });
      break; // One registration number per source; conflicts handle the rest.
    }
  }

  const email = text.match(EMAIL_PATTERN);
  if (email?.[0] && !/\.(png|jpe?g|svg|gif)$/i.test(email[0])) {
    facts.push({
      field: "contactEmail",
      value: email[0].toLowerCase(),
      confidence: 0.8,
      method: "pattern",
      locator: "pattern:email",
    });
  }

  const phoneContext = text.match(
    /(?:tel|telephone|phone|call us)\s*[:\s]\s*(\+?[\d\s()-]{9,20})/i,
  );
  if (phoneContext?.[1]) {
    const digits = phoneContext[1].replace(/[^\d+]/g, "");
    if (digits.length >= 9 && PHONE_PATTERN.test(phoneContext[1])) {
      facts.push({
        field: "contactPhone",
        value: phoneContext[1].trim(),
        confidence: 0.7,
        method: "pattern",
        locator: "pattern:telephone",
      });
    }
  }

  const founded = text.match(
    /\b(?:founded|established|since|formed)\s+(?:in\s+)?((?:18|19|20)\d{2})\b/i,
  );
  if (founded?.[1]) {
    facts.push({
      field: "yearFounded",
      value: founded[1],
      confidence: 0.7,
      method: "pattern",
      locator: "pattern:founded",
    });
  }

  return facts;
}

// --- Entry point ---------------------------------------------------------

/**
 * Extract profile candidates from one fetched page.
 *
 * Never throws: a malformed page yields no candidates rather than failing the
 * whole onboarding run.
 */
export function extractFromPage(input: ExtractionInput): ProfileCandidate[] {
  const { source, html, organisationId, extractedAt, makeId } = input;

  let raw: RawFact[] = [];
  try {
    const text = stripTags(html).slice(0, 200_000);
    raw = [...extractJsonLd(html), ...extractMeta(html), ...extractPatterns(text)];
  } catch {
    return [];
  }

  const candidates: ProfileCandidate[] = [];
  for (const fact of raw) {
    // Every value is sanitised before it can travel further. Anything
    // instruction-shaped is flagged and forced into review.
    const { text, injectionSuspected } = sanitiseSourceText(fact.value);
    if (!text) continue;

    const value =
      fact.field === "websiteUrl" || fact.field === "logoUrl"
        ? (normaliseUrl(text, source.url) ?? text)
        : text;

    candidates.push({
      id: makeId(),
      organisationId,
      field: fact.field,
      value,
      confidence: injectionSuspected ? Math.min(fact.confidence, 0.3) : fact.confidence,
      method: fact.method,
      sourceId: source.id,
      sourceUrl: source.url,
      authority: source.authority,
      locator: fact.locator,
      extractedAt,
      // Nothing extracted is ever verified. Only a human can promote it.
      verificationState: "ai_extracted",
      ...(injectionSuspected ? { injectionSuspected: true } : {}),
    });
  }

  return candidates;
}
