import type {
  ClaimValue,
  Document,
  DocumentSource,
  DocumentVersion,
  ExtractedClaim,
} from "@/types/domain";
import type { DocumentRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapDocument(row: Row): Document {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    title: String(row.title),
    kind: row.kind as Document["kind"],
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.reporting_period ? { reportingPeriod: String(row.reporting_period) } : {}),
    ...(row.current_version_id ? { currentVersionId: String(row.current_version_id) } : {}),
    // Declared rather than inferred. Documents are the most likely route for
    // personal data to enter the product, and the default must not be
    // "share with a model".
    containsPersonalData: Boolean(row.contains_personal_data),
    tags: arrayFrom(row.tags),
    audit: auditFrom(row),
  };
}

function mapVersion(row: Row): DocumentVersion {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    documentId: String(row.document_id),
    version: numberFrom(row.version),
    format: row.format as DocumentVersion["format"],
    fileName: String(row.file_name),
    fileSizeBytes: numberFrom(row.file_size_bytes),
    contentHash: String(row.content_hash),
    ...(row.storage_key ? { storageKey: String(row.storage_key) } : {}),
    parseStatus: row.parse_status as DocumentVersion["parseStatus"],
    // Always set when parsing did not produce usable text.
    ...(row.parse_note ? { parseNote: String(row.parse_note) } : {}),
    ...(row.text_content ? { textContent: String(row.text_content) } : {}),
    ...(row.page_count != null ? { pageCount: optionalNumberFrom(row.page_count) } : {}),
    ...(row.word_count != null ? { wordCount: optionalNumberFrom(row.word_count) } : {}),
    ...(row.uploaded_by ? { uploadedBy: String(row.uploaded_by) } : {}),
    createdAt: String(row.created_at),
  };
}

function mapSource(row: Row): DocumentSource {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    documentId: String(row.document_id),
    ...(row.version_id ? { versionId: String(row.version_id) } : {}),
    origin: row.origin as DocumentSource["origin"],
    authority: row.authority as DocumentSource["authority"],
    ...(row.url ? { url: String(row.url) } : {}),
    ...(row.publisher ? { publisher: String(row.publisher) } : {}),
    retrievedAt: String(row.retrieved_at),
    ...(row.research_source_id ? { researchSourceId: String(row.research_source_id) } : {}),
  };
}

function mapExtractedClaim(row: Row): ExtractedClaim {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    documentId: String(row.document_id),
    versionId: String(row.version_id),
    predicate: String(row.predicate),
    value: row.value as ClaimValue,
    // The sentence as it appeared, so a reviewer checks the claim rather than
    // the label.
    excerpt: String(row.excerpt),
    locator: String(row.locator),
    extractionMethod: String(row.extraction_method),
    confidence: numberFrom(row.confidence),
    // Forces human review regardless of confidence.
    injectionSuspected: Boolean(row.injection_suspected),
    status: row.status as ExtractedClaim["status"],
    ...(row.claim_id ? { claimId: String(row.claim_id) } : {}),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
    createdAt: String(row.created_at),
  };
}

export function createDocumentRepository(q: Query, _deps: Deps): DocumentRepository {
  type Ctx = Parameters<DocumentRepository["list"]>[0];

  function versionColumns(
    documentId: string,
    version: number,
    input: Omit<DocumentVersion, "id" | "organisationId" | "documentId" | "version" | "createdAt">,
  ) {
    return {
      documentId,
      version,
      format: input.format,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      contentHash: input.contentHash,
      storageKey: input.storageKey,
      parseStatus: input.parseStatus,
      parseNote: input.parseNote,
      textContent: input.textContent,
      pageCount: input.pageCount,
      wordCount: input.wordCount,
      uploadedBy: input.uploadedBy,
    };
  }

  async function versionsFor(ctx: Ctx, documentId: string): Promise<Row[]> {
    return q.many(ctx, "document_versions", { document_id: documentId }, {
      order: { column: "version" },
    });
  }

  return {
    async list(ctx) {
      const rows = await q.many(ctx, "documents", {}, {
        order: { column: "created_at", ascending: false },
        liveOnly: true,
      });
      return rows.map(mapDocument);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "documents", { id });
      return row ? mapDocument(row) : null;
    },

    async versions(ctx, documentId) {
      return (await versionsFor(ctx, documentId)).map(mapVersion);
    },

    async currentVersion(ctx, documentId) {
      const document = await q.maybeOne(ctx, "documents", { id: documentId });
      if (!document) return null;
      if (document.current_version_id) {
        const row = await q.maybeOne(ctx, "document_versions", {
          id: String(document.current_version_id),
        });
        if (row) return mapVersion(row);
      }
      // No pointer set: the highest version number is the authoritative one.
      const rows = await versionsFor(ctx, documentId);
      const last = rows[rows.length - 1];
      return last ? mapVersion(last) : null;
    },

    async sources(ctx, documentId) {
      const rows = await q.many(ctx, "document_sources", { document_id: documentId });
      return rows.map(mapSource);
    },

    async create(ctx, input) {
      // Re-uploading identical bytes is not a new version, and treating it as
      // one would duplicate every claim extracted from it. The hash is checked
      // across the tenant, not just within one document.
      const duplicate = await q.maybeOne(ctx, "document_versions", {
        content_hash: input.version.contentHash,
      });
      if (duplicate) {
        const documentRow = await q.maybeOne(ctx, "documents", {
          id: String(duplicate.document_id),
        });
        if (documentRow) {
          return {
            document: mapDocument(documentRow),
            version: mapVersion(duplicate),
            deduplicated: true,
          };
        }
      }

      const documentRow = await q.insert(ctx, "documents", {
        title: input.title,
        kind: input.kind,
        reportingPeriod: input.reportingPeriod,
        containsPersonalData: input.containsPersonalData,
        tags: input.tags ?? [],
      });
      const documentId = String(documentRow.id);

      const versionRow = await q.insert(
        ctx,
        "document_versions",
        versionColumns(documentId, 1, input.version),
        { audit: false },
      );
      await q.update(ctx, "documents", documentId, { currentVersionId: String(versionRow.id) });

      await q.insert(
        ctx,
        "document_sources",
        {
          documentId,
          versionId: String(versionRow.id),
          origin: input.source.origin,
          authority: input.source.authority,
          url: input.source.url,
          publisher: input.source.publisher,
          retrievedAt: input.source.retrievedAt,
          researchSourceId: input.source.researchSourceId,
        },
        { audit: false },
      );

      const document = await q.maybeOne(ctx, "documents", { id: documentId });
      return {
        document: mapDocument(document ?? documentRow),
        version: mapVersion(versionRow),
        deduplicated: false,
      };
    },

    async addVersion(ctx, documentId, version) {
      const document = await q.maybeOne(ctx, "documents", { id: documentId });
      if (!document) return null;
      const existing = await versionsFor(ctx, documentId);
      const next = existing.reduce((max, row) => Math.max(max, numberFrom(row.version)), 0) + 1;
      const row = await q.insert(
        ctx,
        "document_versions",
        versionColumns(documentId, next, version),
        { audit: false },
      );
      await q.update(ctx, "documents", documentId, { currentVersionId: String(row.id) });
      return mapVersion(row);
    },

    async extractedClaims(ctx, documentId) {
      const rows = await q.many(ctx, "extracted_claims", { document_id: documentId }, {
        order: { column: "created_at" },
      });
      return rows.map(mapExtractedClaim);
    },

    async saveExtractedClaims(ctx, claims) {
      const out: ExtractedClaim[] = [];
      for (const claim of claims) {
        const row = await q.insert(
          ctx,
          "extracted_claims",
          {
            documentId: claim.documentId,
            versionId: claim.versionId,
            predicate: claim.predicate,
            value: claim.value,
            excerpt: claim.excerpt,
            locator: claim.locator,
            extractionMethod: claim.extractionMethod,
            confidence: claim.confidence,
            injectionSuspected: claim.injectionSuspected,
            // Extraction is a candidate until a human confirms it, so a saved
            // claim always starts pending whatever the extractor concluded.
            status: "pending",
            createdAt: ctx.now().toISOString(),
          },
          { audit: false },
        );
        out.push(mapExtractedClaim(row));
      }
      return out;
    },

    async setExtractedClaimStatus(ctx, id, status, claimId) {
      await q.update(
        ctx,
        "extracted_claims",
        id,
        {
          status,
          claimId,
          reviewedBy: ctx.userId,
          reviewedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );
    },
  };
}
