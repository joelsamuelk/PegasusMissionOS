import { sanitiseSourceText } from "./sanitise";
import type { CandidateField, ProfileCandidate, ResearchSource } from "./types";
import type { DocumentKind } from "@/types/domain";

/**
 * Extraction from parsed documents.
 *
 * Deterministic and label-driven, exactly like the HTML extractors: a value is
 * only taken when the document *labels* it. "Our mission is to…" is a mission
 * statement; a paragraph that happens to read like one is not.
 *
 * That conservatism is the point. An annual report is dense with sentences
 * that resemble mission statements, income figures and outcome claims, and an
 * extractor that guesses produces a review queue nobody can get through —
 * which is worse than a short one, because it trains people to approve in
 * bulk.
 *
 * No model is involved. Semantic extraction can be added behind the same
 * candidate contract later; it will have to satisfy the same provenance
 * requirements this establishes.
 */

export interface DocumentExtractionInput {
  source: ResearchSource;
  organisationId: string;
  /** Absent when the blocks came from a web page rather than a file. */
  documentId?: string;
  documentVersionId?: string;
  documentKind: DocumentKind;
  blocks: { text: string; locator: string }[];
  table?: { headers: string[]; rows: string[][] };
  extractedAt: string;
  makeId: () => string;
}

interface LabelRule {
  field: CandidateField;
  /** Group 1 must be the value. */
  pattern: RegExp;
  confidence: number;
  /** Only applied to these document kinds, where the label is ambiguous. */
  kinds?: DocumentKind[];
  /** Reject matches shorter than this — a two-word "mission" is a heading. */
  minLength?: number;
  maxLength?: number;
}

/**
 * The labels, in the words organisations actually use.
 *
 * Ordered by specificity: "our mission is" before "mission", so the longer
 * label wins and the value does not start with a stray verb.
 */
const RULES: LabelRule[] = [
  {
    field: "missionStatement",
    pattern: /\bour mission is(?: to)?[:\s]+([^.]{20,400}\.)/i,
    confidence: 0.8,
    minLength: 25,
  },
  {
    field: "missionStatement",
    pattern: /\bmission statement[:\s]+([^.]{20,400}\.)/i,
    confidence: 0.82,
    minLength: 25,
  },
  {
    field: "vision",
    pattern: /\bour vision is(?: (?:for|of|that|a|an))?[:\s]+([^.]{15,400}\.)/i,
    confidence: 0.8,
    minLength: 20,
  },
  {
    field: "vision",
    pattern: /\bvision statement[:\s]+([^.]{15,400}\.)/i,
    confidence: 0.82,
    minLength: 20,
  },
  {
    field: "value",
    pattern: /\bour values are[:\s]+([^.]{10,300}\.)/i,
    confidence: 0.72,
    minLength: 12,
  },
  {
    field: "strategicPriority",
    pattern: /\b(?:strategic (?:priority|aim|objective)|priority) \d+[:\s]+([^.]{10,240}\.?)/i,
    confidence: 0.75,
    minLength: 12,
  },
  {
    field: "impactFramework",
    pattern:
      /\b(?:we (?:use|apply|report against)|aligned (?:to|with)|measured using) (?:the )?([A-Z][\w\s]{3,60}(?:framework|theory of change|outcomes star|logic model))/,
    confidence: 0.7,
    minLength: 6,
  },
  {
    field: "annualIncome",
    pattern: /\btotal income(?: for the year)?[^\d£$€]{0,30}([£$€]\s?[\d,]+(?:\.\d{2})?)/i,
    confidence: 0.85,
    kinds: ["accounts", "annual_report"],
    minLength: 2,
  },
  {
    field: "annualExpenditure",
    pattern: /\btotal expenditure(?: for the year)?[^\d£$€]{0,30}([£$€]\s?[\d,]+(?:\.\d{2})?)/i,
    confidence: 0.85,
    kinds: ["accounts", "annual_report"],
    minLength: 2,
  },
  {
    field: "financialYearEnd",
    pattern: /\b(?:financial )?year end(?:ed|ing)?[:\s]+(\d{1,2} \w+ \d{4}|\d{4}-\d{2}-\d{2})/i,
    confidence: 0.88,
    minLength: 6,
  },
  {
    field: "safeguardingStatus",
    pattern: /\b(safeguarding policy(?:[^.]{0,160})\.)/i,
    confidence: 0.65,
    kinds: ["policy", "governance", "annual_report"],
    minLength: 20,
  },
];

/**
 * Headed lists.
 *
 * "Our programmes" followed by a run of short lines is how almost every
 * organisation presents its delivery, and it is far more reliable than trying
 * to identify a programme from prose. Each item becomes its own candidate, so
 * each is reviewed and located separately.
 */
const LIST_HEADINGS: { heading: RegExp; field: CandidateField; confidence: number }[] = [
  { heading: /^(?:our )?programmes?$/i, field: "programme", confidence: 0.7 },
  { heading: /^(?:our )?services?$/i, field: "service", confidence: 0.68 },
  { heading: /^(?:our )?(?:funders?|supporters?|with thanks to)$/i, field: "funder", confidence: 0.6 },
  { heading: /^(?:our )?partners?$/i, field: "partner", confidence: 0.6 },
  { heading: /^(?:our )?(?:outcomes|what changed)$/i, field: "outcome", confidence: 0.6 },
  { heading: /^(?:our )?(?:values|what we believe)$/i, field: "value", confidence: 0.68 },
  {
    heading: /^(?:our )?(?:trustees|board(?: of trustees)?)$/i,
    field: "trustee",
    confidence: 0.75,
  },
  {
    heading: /^(?:our )?(?:strategic priorities|strategic aims|priorities)$/i,
    field: "strategicPriority",
    confidence: 0.72,
  },
  {
    heading: /^(?:communities we serve|who we (?:help|support|serve))$/i,
    field: "communityServed",
    confidence: 0.7,
  },
];

/** A list item, not a paragraph: short, and not a full sentence. */
function looksLikeListItem(text: string): boolean {
  if (text.length > 120) return false;
  if (text.split(/\s+/).length > 16) return false;
  // A line ending in a full stop mid-paragraph is prose continuing.
  return !/[.]\s*\S/.test(text);
}

export function extractFromDocument(input: DocumentExtractionInput): ProfileCandidate[] {
  const {
    source,
    organisationId,
    documentId,
    documentVersionId,
    documentKind,
    blocks,
    table,
    extractedAt,
    makeId,
  } = input;

  const candidates: ProfileCandidate[] = [];
  const seen = new Set<string>();

  const push = (args: {
    field: CandidateField;
    value: string;
    confidence: number;
    locator: string;
    excerpt: string;
  }) => {
    const value = args.value.replace(/\s+/g, " ").trim();
    if (!value) return;

    // Same value for the same field from the same document adds nothing but
    // review burden.
    const key = `${args.field}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    const sanitised = sanitiseSourceText(value);
    const excerpt = sanitiseSourceText(args.excerpt.slice(0, 300)).text;

    candidates.push({
      id: makeId(),
      organisationId,
      field: args.field,
      value: sanitised.text,
      confidence: args.confidence,
      // A page and a document are extracted the same way; only the origin
      // differs, and the locator says which.
      method: documentId ? "document" : "heading",
      sourceId: source.id,
      sourceUrl: source.url,
      authority: source.authority,
      locator: args.locator,
      extractedAt,
      verificationState: "ai_extracted",
      injectionSuspected: sanitised.injectionSuspected || undefined,
      documentId,
      documentVersionId,
      excerpt,
    });
  };

  // --- Labelled statements ------------------------------------------------
  for (const block of blocks) {
    for (const rule of RULES) {
      if (rule.kinds && !rule.kinds.includes(documentKind)) continue;

      const match = block.text.match(rule.pattern);
      const value = match?.[1]?.trim();
      if (!value) continue;
      if (rule.minLength && value.length < rule.minLength) continue;
      if (rule.maxLength && value.length > rule.maxLength) continue;

      push({
        field: rule.field,
        value,
        confidence: rule.confidence,
        locator: block.locator,
        excerpt: block.text,
      });
    }
  }

  // --- Headed lists -------------------------------------------------------
  for (const [index, block] of blocks.entries()) {
    const heading = block.text.replace(/[:.]$/, "").trim();
    const rule = LIST_HEADINGS.find((r) => r.heading.test(heading));
    if (!rule) continue;

    // Take the run of list-shaped blocks that follows, and stop at the first
    // thing that is not one. A heading followed by prose is a section title,
    // not a list, and must not swallow the paragraph beneath it.
    for (let i = index + 1; i < blocks.length && i <= index + 12; i += 1) {
      const item = blocks[i]!;
      if (!looksLikeListItem(item.text)) break;
      push({
        field: rule.field,
        value: item.text.replace(/^[-•*•]\s*/, ""),
        confidence: rule.confidence,
        locator: item.locator,
        excerpt: `${heading}: ${item.text}`,
      });
    }
  }

  // --- Tables -------------------------------------------------------------
  // A spreadsheet of indicators is the one place a list of measures is
  // reliably machine-readable, and re-typing it is exactly the work MG-3
  // exists to remove.
  if (table && table.headers.length > 0) {
    const column = (candidates: string[]) =>
      table.headers.findIndex((header) =>
        candidates.some((c) => header.trim().toLowerCase() === c),
      );

    const nameColumn = column(["indicator", "measure", "kpi", "metric"]);
    const outcomeColumn = column(["outcome", "result", "change"]);
    const programmeColumn = column(["programme", "program", "project"]);

    for (const [rowIndex, row] of table.rows.entries()) {
      const locator = `row ${rowIndex + 2}`;
      if (nameColumn >= 0 && row[nameColumn]?.trim()) {
        push({
          field: "indicator",
          value: row[nameColumn]!,
          confidence: 0.72,
          locator,
          excerpt: row.join(", "),
        });
      }
      if (outcomeColumn >= 0 && row[outcomeColumn]?.trim()) {
        push({
          field: "outcome",
          value: row[outcomeColumn]!,
          confidence: 0.65,
          locator,
          excerpt: row.join(", "),
        });
      }
      if (programmeColumn >= 0 && row[programmeColumn]?.trim()) {
        push({
          field: "programme",
          value: row[programmeColumn]!,
          confidence: 0.68,
          locator,
          excerpt: row.join(", "),
        });
      }
    }
  }

  return candidates;
}


/**
 * Turn a web page into the same blocks a document produces.
 *
 * The Phase 1 HTML extractors read structured markup and labelled patterns,
 * which covers identity well and covers *lists* not at all — so a site with a
 * perfectly clear "Our programmes" heading yielded nothing about programmes.
 *
 * Rather than write a second list extractor for HTML, the page is reduced to
 * headings and blocks and handed to the one that already exists. A heading
 * followed by list items looks identical whether it came from a PDF or a
 * `<ul>`, and having one implementation means the two cannot drift.
 */
export function htmlToBlocks(html: string): { text: string; locator: string }[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const blocks: { text: string; locator: string }[] = [];
  const pattern = /<(h[1-6]|p|li|td|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of body.matchAll(pattern)) {
    const tag = match[1]!.toLowerCase();
    const text = match[2]!
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length === 0) continue;
    blocks.push({ text, locator: `<${tag}> "${text.slice(0, 40)}"` });
  }

  return blocks;
}
