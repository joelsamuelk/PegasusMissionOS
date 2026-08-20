import type { ParsedDocument } from "@/lib/documents";
import type {
  EvidenceType,
  ReportRequirement,
  ReportRequirementKind,
  ReportSectionDefinition,
  ReportTemplateIngestion,
} from "@/types/domain";

/**
 * Reading a funder's reporting template.
 *
 * The brief's sequence is *extract → human reviews extraction → build the
 * report workspace*, and the middle step is not a formality. A requirement
 * lifted from a PDF is a **reading** of that PDF, and misreading a funder's
 * template is exactly the error that costs an organisation a grant. So nothing
 * here writes a requirement: it produces a `ReportTemplateIngestion` full of
 * candidates, every one marked `needs_review`, and a person accepts them.
 *
 * The extraction itself is deterministic — pattern matching over recovered
 * text, not a model. Three reasons, in order of importance:
 *
 * 1. A funder's template is a legal-ish document and the organisation must be
 *    able to see exactly why Pegasus thinks question 4 has a 500-word limit.
 *    "The model said so" is not an answer anyone can check.
 * 2. The document is untrusted input. Handing it to a model as instructions is
 *    the injection surface audit finding S4 names.
 * 3. It is testable against fixtures, which a prompt is not.
 *
 * What the parser cannot classify it still records, as a narrative
 * requirement with the original text. Silently dropping a question is the one
 * failure mode that produces a confident, incomplete workspace.
 */

/** Words that mark a line as asking for a number the organisation measures. */
const INDICATOR_HINTS = [
  "how many",
  "number of",
  "how much",
  "indicator",
  "target",
  "output",
  "beneficiaries reached",
  "people supported",
  "participants",
];

/** Words that mark a line as asking about money. */
const FINANCIAL_HINTS = [
  "budget",
  "expenditure",
  "spend",
  "spent",
  "income",
  "financial",
  "underspend",
  "variance",
  "cost",
  "£",
];

/** Words that mark a line as asking for something to be supplied. */
const EVIDENCE_HINTS = [
  "evidence",
  "case study",
  "case studies",
  "testimonial",
  "photograph",
  "photo",
  "evaluation",
  "attach",
  "enclose",
  "supporting document",
];

const ATTACHMENT_HINTS = ["attach", "enclose", "upload", "append a copy"];

const EVIDENCE_TYPE_HINTS: [string, EvidenceType][] = [
  ["case study", "case_study"],
  ["case studies", "case_study"],
  ["testimonial", "testimonial"],
  ["quote", "testimonial"],
  ["evaluation", "evaluation"],
  ["survey", "survey"],
  ["statistic", "statistic"],
  ["photograph", "image"],
  ["photo", "image"],
  ["accounts", "financial"],
  ["financial statement", "financial"],
  ["policy", "policy"],
];

/**
 * A line that reads as a question a funder is asking.
 *
 * Three shapes, because funder templates use all three and an organisation
 * that pastes in a numbered list should not be told nothing was found:
 * an interrogative, a numbered item, and an imperative ("Please describe…").
 */
const NUMBERED = /^\s*(?:(?:Q|Question)\s*)?(\d{1,2})[.)]\s+(.{12,})$/i;
const IMPERATIVE =
  /^\s*(please\s+)?(describe|explain|tell us|outline|summarise|summarize|list|provide|detail|set out|give)\b(.{8,})$/i;

const WORD_LIMIT_PATTERNS = [
  /(?:max(?:imum)?|no more than|up to|within)\s*(\d{2,5})\s*words/i,
  /\((\d{2,5})\s*words?(?:\s*max(?:imum)?)?\)/i,
  /(\d{2,5})\s*words?\s*(?:max(?:imum)?|limit)/i,
];

const DATE_PATTERNS = [
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
];

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function detectWordLimit(text: string): number | undefined {
  for (const pattern of WORD_LIMIT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const value = Number(match[1]);
      // A "word limit" below 20 is almost always a page number or a heading
      // number that happened to sit next to the word "words".
      if (Number.isFinite(value) && value >= 20 && value <= 20_000) return value;
    }
  }
  return undefined;
}

export function detectDates(text: string): string[] {
  const found = new Set<string>();

  const iso = new RegExp(DATE_PATTERNS[0]!.source, "g");
  let match: RegExpExecArray | null;
  while ((match = iso.exec(text)) !== null) {
    found.add(`${match[1]}-${match[2]}-${match[3]}`);
  }

  const long = new RegExp(DATE_PATTERNS[1]!.source, "gi");
  while ((match = long.exec(text)) !== null) {
    const month = MONTHS[match[2]!.toLowerCase()];
    if (!month) continue;
    found.add(`${match[3]}-${month}-${match[1]!.padStart(2, "0")}`);
  }

  return [...found].sort();
}

export function classifyRequirement(text: string): ReportRequirementKind {
  const lower = text.toLowerCase();
  // Order matters. A question asking to attach a case study is an attachment
  // *and* evidence; the more specific action wins, because that is what the
  // organisation has to do.
  if (includesAny(lower, ATTACHMENT_HINTS)) return "attachment";
  if (includesAny(lower, FINANCIAL_HINTS)) return "financial";
  if (includesAny(lower, INDICATOR_HINTS)) return "indicator";
  if (includesAny(lower, EVIDENCE_HINTS)) return "evidence";
  return "narrative";
}

export function detectEvidenceTypes(text: string): EvidenceType[] {
  const lower = text.toLowerCase();
  const types = new Set<EvidenceType>();
  for (const [hint, type] of EVIDENCE_TYPE_HINTS) {
    if (lower.includes(hint)) types.add(type);
  }
  return [...types];
}

export interface IngestionInput {
  id: string;
  organisationId: string;
  parsed: ParsedDocument;
  fileName?: string;
  funderId?: string;
  documentId?: string;
  /** The definition these requirements will attach to once accepted. */
  definitionId: string;
  now: Date;
  requirementId: (index: number) => string;
}

/**
 * Extract candidate requirements from a parsed funder template.
 *
 * Returns an ingestion in `awaiting_review`, or in `failed` where the document
 * could not be read at all. It never returns `accepted`: acceptance is an act
 * a person performs.
 */
export function ingestReportTemplate(input: IngestionInput): ReportTemplateIngestion {
  const { parsed, now } = input;
  const notes: string[] = [];

  if (parsed.status !== "parsed" || parsed.blocks.length === 0) {
    return {
      id: input.id,
      organisationId: input.organisationId,
      definitionId: input.definitionId,
      documentId: input.documentId,
      fileName: input.fileName,
      funderId: input.funderId,
      status: "failed",
      candidates: [],
      detectedDueDates: [],
      notes: [
        parsed.note ??
          "The document could not be read. Nothing was extracted, and nothing has been guessed.",
      ],
      createdAt: now.toISOString(),
    };
  }

  const candidates: ReportRequirement[] = [];
  const blocks = parsed.blocks;
  let order = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const text = block.text.trim();
    if (text.length < 12) continue;

    const numbered = NUMBERED.exec(text);
    const imperative = IMPERATIVE.exec(text);
    const interrogative = text.endsWith("?");
    if (!numbered && !imperative && !interrogative) continue;

    const prompt = (numbered?.[2] ?? text).trim();

    // Guidance is normally the line or two after the question, and word limits
    // are normally in it rather than in the question itself. Looking ahead two
    // blocks recovers both without pulling in the following question.
    const following = blocks
      .slice(index + 1, index + 3)
      .map((next) => next.text.trim())
      .filter((next) => !NUMBERED.test(next) && !next.endsWith("?"));
    const guidance = following.join(" ").trim() || undefined;

    const scope = `${prompt} ${guidance ?? ""}`;
    const kind = classifyRequirement(scope);
    const evidenceTypes = kind === "evidence" ? detectEvidenceTypes(scope) : [];

    candidates.push({
      id: input.requirementId(order),
      organisationId: input.organisationId,
      definitionId: input.definitionId,
      sectionKey: sectionKeyFor(order, prompt),
      kind,
      prompt,
      guidance,
      wordLimit: detectWordLimit(scope),
      evidenceTypes: evidenceTypes.length ? evidenceTypes : undefined,
      required: true,
      order,
      sourceRef: input.documentId
        ? { type: "document", id: input.documentId, label: block.locator }
        : undefined,
      // Never `ai_extracted` or `provided`. A reading of a document is a
      // candidate until a person confirms it, and the state must make that
      // unmissable.
      verification: "needs_review",
    });
    order += 1;
  }

  if (candidates.length === 0) {
    notes.push(
      `No questions were recognised in ${parsed.wordCount} words of recovered text. The template may use a layout the extractor cannot read; the questions can be added by hand.`,
    );
  } else {
    notes.push(
      `${candidates.length} question${candidates.length === 1 ? "" : "s"} recognised across ${parsed.blocks.length} blocks of text. Every one needs review before it is used.`,
    );
    const unclassified = candidates.filter((c) => c.kind === "narrative").length;
    if (unclassified > 0) {
      // Said plainly rather than left implicit: a workspace built from
      // requirements that are all "narrative" will not check any figures.
      notes.push(
        `${unclassified} could not be classified beyond narrative. Set the kind by hand where the funder is asking for a figure, evidence or an attachment.`,
      );
    }
  }

  const detectedDueDates = detectDates(parsed.text);
  if (detectedDueDates.length === 0) {
    notes.push("No deadline was found in the document. Set the due date by hand.");
  }

  return {
    id: input.id,
    organisationId: input.organisationId,
    definitionId: input.definitionId,
    documentId: input.documentId,
    fileName: input.fileName,
    funderId: input.funderId,
    status: "awaiting_review",
    candidates,
    detectedDueDates,
    notes,
    createdAt: now.toISOString(),
  };
}

/**
 * A stable, readable section key for an extracted question.
 *
 * One section per question, rather than trying to infer the funder's grouping.
 * Guessing groupings produces a workspace whose shape does not match the form
 * the organisation has to fill in, which is worse than a flat list.
 */
function sectionKeyFor(order: number, prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .split("_")
    .slice(0, 5)
    .join("_");
  return `q${order + 1}${slug ? `_${slug}` : ""}`;
}

/** Turn accepted requirements into the sections of a report definition. */
export function sectionsFromRequirements(
  requirements: ReportRequirement[],
): ReportSectionDefinition[] {
  const byKey = new Map<string, ReportSectionDefinition>();
  for (const requirement of [...requirements].sort((a, b) => a.order - b.order)) {
    if (byKey.has(requirement.sectionKey)) continue;
    byKey.set(requirement.sectionKey, {
      key: requirement.sectionKey,
      title: truncateTitle(requirement.prompt),
      type:
        requirement.kind === "financial"
          ? "financial"
          : requirement.kind === "indicator"
            ? "metrics"
            : requirement.kind === "evidence" || requirement.kind === "attachment"
              ? "evidence"
              : "narrative",
      required: requirement.required,
    });
  }
  return [...byKey.values()];
}

function truncateTitle(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77).replace(/[\s,;:]+\S*$/, "")}...`;
}

/**
 * Accept an ingestion.
 *
 * Only requirements the reviewer confirmed are carried through, and their
 * verification moves from `needs_review` to `provided` — the organisation has
 * stood behind the reading. It does not become `verified`: nobody has checked
 * it against the funder, and `assertProducerMayAssign` exists precisely to
 * stop that promotion happening by convenience.
 */
export function acceptIngestion(
  ingestion: ReportTemplateIngestion,
  acceptedIds: string[],
  reviewedBy: string,
  now: Date,
): { ingestion: ReportTemplateIngestion; requirements: ReportRequirement[] } {
  const accepted = new Set(acceptedIds);
  const requirements = ingestion.candidates
    .filter((candidate) => accepted.has(candidate.id))
    .map((candidate) => ({ ...candidate, verification: "provided" as const }));

  const rejected = ingestion.candidates.length - requirements.length;

  return {
    ingestion: {
      ...ingestion,
      status: requirements.length > 0 ? "accepted" : "rejected",
      reviewedBy,
      reviewedAt: now.toISOString(),
      notes: [
        ...ingestion.notes,
        `${requirements.length} of ${ingestion.candidates.length} candidates accepted${rejected ? `, ${rejected} discarded` : ""}.`,
      ],
    },
    requirements,
  };
}
