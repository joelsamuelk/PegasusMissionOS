import { createHash } from "node:crypto";
import type { DocumentKind, DocumentOrigin, SourceAuthority } from "@/types/domain";
import { detectFormat, parseDocument, type ParsedDocument } from "@/lib/documents";
import { classifyDocument } from "@/lib/organisation-intelligence/classify";
import { extractFromDocument } from "@/lib/organisation-intelligence/extract-document";
import { looksLikeDocument, normaliseUrl } from "@/lib/organisation-intelligence/url";
import type { ProfileCandidate, ResearchSource } from "@/lib/organisation-intelligence/types";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data/types";

/**
 * DocumentDiscoveryService.
 *
 * Two ways a document arrives — found on the organisation's website or on a
 * register, or handed over by a person — and one path afterwards:
 *
 *     parse → structure → review → approve
 *
 * The rule the MG-3 brief states, and the reason this service exists at all:
 * **an uploaded file is not arbitrary AI context.** A charity's annual report
 * is a governance record. Recovering its text, locating each statement within
 * it, and putting every extracted value in front of a person is what separates
 * this from pasting a PDF into a prompt.
 *
 * Nothing here calls a model.
 */

export interface DiscoveredDocument {
  url: string;
  title: string;
  kind: DocumentKind;
  authority: SourceAuthority;
  origin: DocumentOrigin;
  publishedAt?: string;
}

export interface IngestionResult {
  documentId: string;
  versionId: string;
  title: string;
  format: string;
  parse: ParsedDocument;
  candidates: ProfileCandidate[];
  /** True when identical bytes were already held, so nothing new was created. */
  deduplicated: boolean;
}

export interface DocumentServiceDependencies {
  repo: MissionRepository;
  now: () => Date;
  makeId: (prefix: string) => string;
  /** Fetch a document's bytes. Injected so tests never touch the network. */
  fetchBytes?: (url: string) => Promise<Uint8Array | null>;
  /** Hard cap. A 200MB accounts pack is not worth the memory. */
  maxBytes?: number;
}

/** Map the research vocabulary onto the document vocabulary. */
const SOURCE_TYPE_TO_KIND: Record<string, DocumentKind> = {
  annual_report: "annual_report",
  impact_report: "impact_report",
  accounts: "accounts",
  strategy: "strategy",
  evaluation: "evaluation",
  regulator: "governance",
  other: "other",
};

/**
 * Documents whose contents are likely to name individuals.
 *
 * Not a guess about the file, a statement about the *class* of file: a
 * safeguarding policy or an evaluation routinely quotes beneficiaries.
 * Defaulting these to "contains personal data" means the cautious answer is
 * the one that happens automatically, and a person can correct it downwards
 * having actually looked.
 */
const LIKELY_PERSONAL: DocumentKind[] = ["evaluation", "policy", "governance"];

export class DocumentDiscoveryService {
  constructor(private readonly deps: DocumentServiceDependencies) {}

  /**
   * Find documents linked from pages already read.
   *
   * Deliberately link-based rather than speculative: guessing at
   * `/annual-report-2025.pdf` produces requests for files that do not exist on
   * someone else's server, which is both rude and a poor signal.
   */
  discoverFromPages(
    pages: { url: string; html: string }[],
    siteRoot: string,
  ): DiscoveredDocument[] {
    const found = new Map<string, DiscoveredDocument>();

    for (const page of pages) {
      const anchors = page.html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) ?? [];
      for (const anchor of anchors) {
        const href = anchor.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!href) continue;
        const url = normaliseUrl(href, page.url);
        if (!url || !looksLikeDocument(url)) continue;
        if (found.has(url)) continue;

        const title =
          anchor
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim() || url.split("/").pop() || "Document";

        const sourceType = classifyDocument(url, title);
        found.set(url, {
          url,
          title,
          kind: SOURCE_TYPE_TO_KIND[sourceType] ?? "other",
          // A document on the organisation's own site speaks for the
          // organisation; one linked from elsewhere is only supporting.
          authority: url.startsWith(new URL(siteRoot).origin) ? "organisation" : "supporting",
          origin: "website_discovery",
        });
      }
    }

    return [...found.values()];
  }

  /** Documents a register publishes about the organisation. */
  fromRegistry(
    documents: { title: string; url: string; kind?: string; publishedAt?: string }[],
  ): DiscoveredDocument[] {
    return documents.flatMap((document) => {
      const url = normaliseUrl(document.url);
      if (!url) return [];
      const sourceType = classifyDocument(url, document.title);
      return [
        {
          url,
          title: document.title,
          kind: SOURCE_TYPE_TO_KIND[sourceType] ?? "other",
          // Published by the regulator, so it carries regulator authority.
          authority: "regulator" as SourceAuthority,
          origin: "registry" as DocumentOrigin,
          publishedAt: document.publishedAt,
        },
      ];
    });
  }

  /**
   * Take bytes, parse them, record the document, and extract candidates.
   *
   * The single entry point for both uploads and discovered files, so the
   * provenance a claim carries does not depend on how the file arrived.
   */
  async ingest(
    ctx: RequestContext,
    input: {
      bytes: Uint8Array;
      fileName: string;
      title?: string;
      kind?: DocumentKind;
      origin: DocumentOrigin;
      authority: SourceAuthority;
      url?: string;
      publisher?: string;
      containsPersonalData?: boolean;
    },
  ): Promise<IngestionResult> {
    const { repo, now, makeId } = this.deps;

    const format = detectFormat(input.bytes, input.fileName);
    const parse = parseDocument(input.bytes, input.fileName);
    const kind = input.kind ?? "other";
    const title = input.title?.trim() || input.fileName;

    const contentHash = createHash("sha256").update(input.bytes).digest("hex");

    const { document, version, deduplicated } = await repo.documents.create(ctx, {
      title,
      kind,
      containsPersonalData: input.containsPersonalData ?? LIKELY_PERSONAL.includes(kind),
      tags: [],
      version: {
        format,
        fileName: input.fileName,
        fileSizeBytes: input.bytes.byteLength,
        contentHash,
        parseStatus: parse.status,
        parseNote: parse.note,
        // Recovered text is held so a reviewer can see the excerpt a candidate
        // came from. It is never sent anywhere by default.
        textContent: parse.status === "parsed" ? parse.text : undefined,
        pageCount: parse.pageCount,
        wordCount: parse.wordCount,
        uploadedBy: ctx.userId,
      },
      source: {
        origin: input.origin,
        authority: input.authority,
        url: input.url,
        publisher: input.publisher,
        retrievedAt: now().toISOString(),
      },
    });

    // Re-uploading identical bytes must not duplicate the review queue.
    if (deduplicated || parse.status !== "parsed") {
      return {
        documentId: document.id,
        versionId: version.id,
        title,
        format,
        parse,
        candidates: [],
        deduplicated,
      };
    }

    const source: ResearchSource = {
      id: makeId("src"),
      organisationId: ctx.organisationId,
      type: kind === "accounts" ? "accounts" : kind === "impact_report" ? "impact_report" : "other",
      title,
      url: input.url ?? `document:${document.id}`,
      authority: input.authority,
      discoveredAt: now().toISOString(),
      retrievedAt: now().toISOString(),
      contentHash,
      extractionStatus: "extracted",
    };

    const candidates = extractFromDocument({
      source,
      organisationId: ctx.organisationId,
      documentId: document.id,
      documentVersionId: version.id,
      documentKind: kind,
      blocks: parse.blocks,
      table: parse.table,
      extractedAt: now().toISOString(),
      makeId: () => makeId("cand"),
    });

    // The same values are also written as `ExtractedClaim`s against the
    // document, because "what did this report tell us?" is a question about
    // the document, and "what do we believe about the organisation?" is a
    // question about the profile. They are answered from the same extraction
    // and reviewed once.
    await repo.documents.saveExtractedClaims(
      ctx,
      candidates.map((candidate) => ({
        documentId: document.id,
        versionId: version.id,
        predicate: candidate.field,
        value: { type: "text" as const, text: candidate.value },
        excerpt: candidate.excerpt ?? candidate.value,
        locator: candidate.locator,
        extractionMethod: candidate.method,
        confidence: candidate.confidence,
        injectionSuspected: Boolean(candidate.injectionSuspected),
      })),
    );

    return {
      documentId: document.id,
      versionId: version.id,
      title,
      format,
      parse,
      candidates,
      deduplicated: false,
    };
  }

  /** Fetch and ingest a discovered document, or record why it could not be. */
  async ingestDiscovered(
    ctx: RequestContext,
    discovered: DiscoveredDocument,
  ): Promise<IngestionResult | { skipped: string }> {
    const fetchBytes = this.deps.fetchBytes;
    if (!fetchBytes) {
      return { skipped: "Document retrieval is not configured in this environment." };
    }

    let bytes: Uint8Array | null = null;
    try {
      bytes = await fetchBytes(discovered.url);
    } catch {
      bytes = null;
    }

    if (!bytes) return { skipped: "The document could not be downloaded." };
    if (bytes.byteLength > (this.deps.maxBytes ?? 25_000_000)) {
      return { skipped: "The document was too large to read." };
    }

    return this.ingest(ctx, {
      bytes,
      fileName: discovered.url.split("/").pop() ?? "document",
      title: discovered.title,
      kind: discovered.kind,
      origin: discovered.origin,
      authority: discovered.authority,
      url: discovered.url,
    });
  }
}
