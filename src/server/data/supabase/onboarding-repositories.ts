import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Document,
  DocumentSource,
  DocumentVersion,
  ExtractedClaim,
  OnboardingRun,
} from "@/types/domain";
import { applyReview, candidateToClaim } from "@/lib/organisation-intelligence/approve";
import type { ProfileCandidate, ResearchSource } from "@/lib/organisation-intelligence/types";
import type { RequestContext } from "@/server/context/request-context";
import type { DocumentRepository, OnboardingRepository } from "../types";
import type { Row } from "./mapping";

/**
 * Documents and onboarding, against Postgres.
 *
 * Split from `adapter.ts` to keep both navigable, not because they are
 * different in kind: they satisfy the same contract and follow the same two
 * rules, tenant scope on every query and null rather than throw for a missing
 * or cross-tenant id.
 *
 * The one rule specific to this module is the MG-3 review boundary. `decide`
 * is the only method that turns a candidate into a claim, and it delegates to
 * `applyReview` rather than restating the confirm/edit/reject semantics, so
 * the two adapters cannot drift on the single transition a human is required
 * to make.
 */

type ClientFactory = () => Promise<SupabaseClient>;

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

const str = (value: unknown, fallback = ""): string =>
  value === null || value === undefined ? fallback : String(value);

const opt = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

function documentFrom(row: Row): Document {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    title: str(row.title),
    kind: str(row.kind, "other") as Document["kind"],
    description: opt(row.description),
    reportingPeriod: opt(row.reporting_period),
    currentVersionId: opt(row.current_version_id),
    containsPersonalData: Boolean(row.contains_personal_data),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    audit: {
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at, str(row.created_at)),
      createdBy: opt(row.created_by),
      archivedAt: (row.archived_at as string | null) ?? null,
    },
  };
}

function versionFrom(row: Row): DocumentVersion {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    documentId: str(row.document_id),
    version: Number(row.version ?? 1),
    format: str(row.format, "unknown") as DocumentVersion["format"],
    fileName: str(row.file_name),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    contentHash: str(row.content_hash),
    storageKey: opt(row.storage_key),
    parseStatus: str(row.parse_status, "pending") as DocumentVersion["parseStatus"],
    parseNote: opt(row.parse_note),
    textContent: opt(row.text_content),
    pageCount: row.page_count === null || row.page_count === undefined ? undefined : Number(row.page_count),
    wordCount: row.word_count === null || row.word_count === undefined ? undefined : Number(row.word_count),
    uploadedBy: opt(row.uploaded_by),
    createdAt: str(row.created_at),
  };
}

function sourceFrom(row: Row): DocumentSource {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    documentId: str(row.document_id),
    versionId: opt(row.version_id),
    origin: str(row.origin, "upload") as DocumentSource["origin"],
    authority: str(row.authority, "supporting") as DocumentSource["authority"],
    url: opt(row.url),
    publisher: opt(row.publisher),
    retrievedAt: str(row.retrieved_at),
    researchSourceId: opt(row.research_source_id),
  };
}

function extractedClaimFrom(row: Row): ExtractedClaim {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    documentId: str(row.document_id),
    versionId: str(row.version_id),
    predicate: str(row.predicate),
    value: (row.value ?? { type: "text", text: "" }) as ExtractedClaim["value"],
    excerpt: str(row.excerpt),
    locator: str(row.locator),
    extractionMethod: str(row.extraction_method),
    confidence: Number(row.confidence ?? 0),
    injectionSuspected: Boolean(row.injection_suspected),
    status: str(row.status, "pending") as ExtractedClaim["status"],
    claimId: opt(row.claim_id),
    reviewedBy: opt(row.reviewed_by),
    reviewedAt: opt(row.reviewed_at),
    createdAt: str(row.created_at),
  };
}

function runFrom(row: Row): OnboardingRun {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    input: {
      name: str(row.input_name),
      websiteUrl: opt(row.input_website_url),
      country: opt(row.input_country),
      registrationNumber: opt(row.input_registration_number),
      organisationType: opt(row.input_organisation_type) as OnboardingRun["input"]["organisationType"],
    },
    stage: str(row.stage, "identity") as OnboardingRun["stage"],
    status: str(row.status, "running") as OnboardingRun["status"],
    startedAt: str(row.started_at),
    completedAt: opt(row.completed_at),
    counts: {
      sourcesDiscovered: Number(row.count_sources_discovered ?? 0),
      pagesRead: Number(row.count_pages_read ?? 0),
      documentsFound: Number(row.count_documents_found ?? 0),
      documentsParsed: Number(row.count_documents_parsed ?? 0),
      candidatesFound: Number(row.count_candidates_found ?? 0),
      conflicts: Number(row.count_conflicts ?? 0),
    },
    // Both halves or neither: a degraded run without guidance tells the user
    // something is wrong and nothing about what to do.
    degraded:
      row.degraded_reason && row.degraded_guidance
        ? { reason: str(row.degraded_reason), guidance: str(row.degraded_guidance) }
        : undefined,
    startedBy: opt(row.started_by),
    audit: {
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at, str(row.created_at)),
      archivedAt: null,
    },
  };
}

function researchSourceFrom(row: Row): ResearchSource {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    type: str(row.type, "website") as ResearchSource["type"],
    title: opt(row.title),
    url: str(row.url),
    publisher: opt(row.publisher),
    authority: str(row.authority, "supporting") as ResearchSource["authority"],
    discoveredAt: str(row.discovered_at),
    retrievedAt: opt(row.retrieved_at),
    publishedAt: opt(row.published_at),
    contentHash: opt(row.content_hash),
    extractionStatus: str(row.extraction_status, "discovered") as ResearchSource["extractionStatus"],
    failureReason: opt(row.failure_reason),
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  };
}

function candidateFrom(row: Row): ProfileCandidate {
  return {
    id: str(row.id),
    organisationId: str(row.organisation_id),
    field: str(row.field) as ProfileCandidate["field"],
    value: str(row.value),
    confidence: Number(row.confidence ?? 0),
    method: str(row.method, "pattern") as ProfileCandidate["method"],
    sourceId: str(row.source_id),
    sourceUrl: str(row.source_url),
    authority: str(row.authority, "supporting") as ProfileCandidate["authority"],
    locator: str(row.locator),
    extractedAt: str(row.extracted_at),
    verificationState: str(row.verification, "ai_extracted") as ProfileCandidate["verificationState"],
    injectionSuspected: row.injection_suspected ? true : undefined,
    documentId: opt(row.document_id),
    documentVersionId: opt(row.document_version_id),
    excerpt: opt(row.excerpt),
  };
}

export function createDocumentRepository(getClient: ClientFactory): DocumentRepository {
  return {
    async list(ctx) {
      const db = await getClient();
      const { data, error } = await db
        .from("documents")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .is("archived_at", null);
      if (error) throw new Error(error.message);
      return rows(data).map(documentFrom);
    },
    async get(ctx, id) {
      const db = await getClient();
      const { data } = await db
        .from("documents")
        .select("*")
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      return data ? documentFrom(data as Row) : null;
    },
    async versions(ctx, documentId) {
      const db = await getClient();
      const { data } = await db
        .from("document_versions")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("document_id", documentId)
        .order("version", { ascending: false });
      return rows(data).map(versionFrom);
    },
    async currentVersion(ctx, documentId) {
      const db = await getClient();
      const { data: document } = await db
        .from("documents")
        .select("current_version_id")
        .eq("id", documentId)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      const versionId = (document as Row | null)?.current_version_id;
      if (!versionId) return null;
      const { data } = await db
        .from("document_versions")
        .select("*")
        .eq("id", versionId)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      return data ? versionFrom(data as Row) : null;
    },
    async sources(ctx, documentId) {
      const db = await getClient();
      const { data } = await db
        .from("document_sources")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("document_id", documentId);
      return rows(data).map(sourceFrom);
    },
    async create(ctx, input) {
      const db = await getClient();

      // Identical bytes are not a new document. Enforced by a unique index on
      // (organisation_id, content_hash) as well as checked here, because the
      // race between two uploads is real and the index is what actually wins
      // it.
      const { data: existing } = await db
        .from("document_versions")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("content_hash", input.version.contentHash)
        .maybeSingle();

      if (existing) {
        const version = versionFrom(existing as Row);
        const { data: document } = await db
          .from("documents")
          .select("*")
          .eq("id", version.documentId)
          .eq("organisation_id", ctx.organisationId)
          .maybeSingle();
        if (document) {
          return { document: documentFrom(document as Row), version, deduplicated: true };
        }
      }

      const { data: documentRow, error: documentError } = await db
        .from("documents")
        .insert({
          organisation_id: ctx.organisationId,
          title: input.title,
          kind: input.kind,
          reporting_period: input.reportingPeriod,
          contains_personal_data: input.containsPersonalData,
          tags: input.tags ?? [],
          created_at: ctx.now().toISOString(),
          updated_at: ctx.now().toISOString(),
          created_by: ctx.userId,
        })
        .select("*")
        .single();
      if (documentError) throw new Error(documentError.message);

      const document = documentFrom(documentRow as Row);

      const { data: versionRow, error: versionError } = await db
        .from("document_versions")
        .insert({
          organisation_id: ctx.organisationId,
          document_id: document.id,
          version: 1,
          format: input.version.format,
          file_name: input.version.fileName,
          file_size_bytes: input.version.fileSizeBytes,
          content_hash: input.version.contentHash,
          storage_key: input.version.storageKey,
          parse_status: input.version.parseStatus,
          parse_note: input.version.parseNote,
          text_content: input.version.textContent,
          page_count: input.version.pageCount,
          word_count: input.version.wordCount,
          uploaded_by: ctx.userId,
          created_at: ctx.now().toISOString(),
        })
        .select("*")
        .single();
      if (versionError) throw new Error(versionError.message);

      const version = versionFrom(versionRow as Row);

      await db
        .from("documents")
        .update({ current_version_id: version.id })
        .eq("id", document.id)
        .eq("organisation_id", ctx.organisationId);

      await db.from("document_sources").insert({
        organisation_id: ctx.organisationId,
        document_id: document.id,
        version_id: version.id,
        origin: input.source.origin,
        authority: input.source.authority,
        url: input.source.url,
        publisher: input.source.publisher,
        retrieved_at: input.source.retrievedAt,
        research_source_id: input.source.researchSourceId,
      });

      return {
        document: { ...document, currentVersionId: version.id },
        version,
        deduplicated: false,
      };
    },
    async addVersion(ctx, documentId, version) {
      const db = await getClient();
      const { data: document } = await db
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      if (!document) return null;

      const { data: existing } = await db
        .from("document_versions")
        .select("version")
        .eq("organisation_id", ctx.organisationId)
        .eq("document_id", documentId)
        .order("version", { ascending: false })
        .limit(1);

      const next = Number(rows(existing)[0]?.version ?? 0) + 1;
      const { data, error } = await db
        .from("document_versions")
        .insert({
          organisation_id: ctx.organisationId,
          document_id: documentId,
          version: next,
          format: version.format,
          file_name: version.fileName,
          file_size_bytes: version.fileSizeBytes,
          content_hash: version.contentHash,
          storage_key: version.storageKey,
          parse_status: version.parseStatus,
          parse_note: version.parseNote,
          text_content: version.textContent,
          page_count: version.pageCount,
          word_count: version.wordCount,
          uploaded_by: ctx.userId,
          created_at: ctx.now().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const record = versionFrom(data as Row);
      // The new version becomes current and the previous one stays, so claims
      // extracted from it still resolve to the bytes they were read from.
      await db
        .from("documents")
        .update({ current_version_id: record.id, updated_at: ctx.now().toISOString() })
        .eq("id", documentId)
        .eq("organisation_id", ctx.organisationId);

      return record;
    },
    async extractedClaims(ctx, documentId) {
      const db = await getClient();
      const { data } = await db
        .from("extracted_claims")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("document_id", documentId);
      return rows(data).map(extractedClaimFrom);
    },
    async saveExtractedClaims(ctx, claims) {
      if (claims.length === 0) return [];
      const db = await getClient();

      // Only against documents this tenant holds. A claim attached to a
      // foreign document would be unreachable and misleading.
      const documentIds = [...new Set(claims.map((claim) => claim.documentId))];
      const { data: owned } = await db
        .from("documents")
        .select("id")
        .eq("organisation_id", ctx.organisationId)
        .in("id", documentIds);
      const allowed = new Set(rows(owned).map((row) => String(row.id)));

      const payload = claims
        .filter((claim) => allowed.has(claim.documentId))
        .map((claim) => ({
          organisation_id: ctx.organisationId,
          document_id: claim.documentId,
          version_id: claim.versionId,
          predicate: claim.predicate,
          value: claim.value,
          excerpt: claim.excerpt,
          locator: claim.locator,
          extraction_method: claim.extractionMethod,
          confidence: claim.confidence,
          injection_suspected: claim.injectionSuspected,
          status: "pending",
          created_at: ctx.now().toISOString(),
        }));
      if (payload.length === 0) return [];

      const { data, error } = await db.from("extracted_claims").insert(payload).select("*");
      if (error) throw new Error(error.message);
      return rows(data).map(extractedClaimFrom);
    },
    async setExtractedClaimStatus(ctx, id, status, claimId) {
      const db = await getClient();
      await db
        .from("extracted_claims")
        .update({
          status,
          claim_id: claimId,
          reviewed_by: ctx.userId,
          reviewed_at: ctx.now().toISOString(),
        })
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId);
    },
  };
}

export function createOnboardingRepository(getClient: ClientFactory): OnboardingRepository {
  const ownsRun = async (ctx: RequestContext, runId: string): Promise<boolean> => {
    const db = await getClient();
    const { data } = await db
      .from("onboarding_runs")
      .select("id")
      .eq("id", runId)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    return Boolean(data);
  };

  const repository: OnboardingRepository = {
    async runs(ctx) {
      const db = await getClient();
      const { data, error } = await db
        .from("onboarding_runs")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .order("started_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows(data).map(runFrom);
    },
    async getRun(ctx, id) {
      const db = await getClient();
      const { data } = await db
        .from("onboarding_runs")
        .select("*")
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      return data ? runFrom(data as Row) : null;
    },
    async latestRun(ctx) {
      const all = await repository.runs(ctx);
      return all[0] ?? null;
    },
    async startRun(ctx, input) {
      const db = await getClient();
      const { data, error } = await db
        .from("onboarding_runs")
        .insert({
          organisation_id: ctx.organisationId,
          input_name: input.name,
          input_website_url: input.websiteUrl,
          input_country: input.country,
          input_registration_number: input.registrationNumber,
          input_organisation_type: input.organisationType,
          stage: "identity",
          status: "running",
          started_at: ctx.now().toISOString(),
          started_by: ctx.userId,
          created_at: ctx.now().toISOString(),
          updated_at: ctx.now().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return runFrom(data as Row);
    },
    async updateRun(ctx, id, patch) {
      const db = await getClient();
      await db
        .from("onboarding_runs")
        .update({
          stage: patch.stage,
          status: patch.status,
          completed_at: patch.completedAt,
          ...(patch.counts
            ? {
                count_sources_discovered: patch.counts.sourcesDiscovered,
                count_pages_read: patch.counts.pagesRead,
                count_documents_found: patch.counts.documentsFound,
                count_documents_parsed: patch.counts.documentsParsed,
                count_candidates_found: patch.counts.candidatesFound,
                count_conflicts: patch.counts.conflicts,
              }
            : {}),
          ...("degraded" in patch
            ? {
                degraded_reason: patch.degraded?.reason ?? null,
                degraded_guidance: patch.degraded?.guidance ?? null,
              }
            : {}),
          updated_at: ctx.now().toISOString(),
        })
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId);
    },
    async sources(ctx, runId) {
      const db = await getClient();
      const { data } = await db
        .from("research_sources")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("run_id", runId);
      return rows(data).map(researchSourceFrom);
    },
    async saveSources(ctx, runId, sources) {
      if (sources.length === 0 || !(await ownsRun(ctx, runId))) return;
      const db = await getClient();
      await db.from("research_sources").insert(
        sources.map((source) => ({
          organisation_id: ctx.organisationId,
          run_id: runId,
          type: source.type,
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          authority: source.authority,
          discovered_at: source.discoveredAt,
          retrieved_at: source.retrievedAt,
          published_at: source.publishedAt,
          content_hash: source.contentHash,
          extraction_status: source.extractionStatus,
          failure_reason: source.failureReason,
          metadata: source.metadata,
        })),
      );
    },
    async candidates(ctx, runId) {
      const db = await getClient();
      const { data } = await db
        .from("profile_candidates")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("run_id", runId);
      return rows(data).map(candidateFrom);
    },
    async getCandidate(ctx, id) {
      const db = await getClient();
      const { data } = await db
        .from("profile_candidates")
        .select("*")
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      return data ? candidateFrom(data as Row) : null;
    },
    async saveCandidates(ctx, runId, candidates) {
      if (candidates.length === 0 || !(await ownsRun(ctx, runId))) return;
      const db = await getClient();
      const { error } = await db.from("profile_candidates").insert(
        candidates.map((candidate) => ({
          organisation_id: ctx.organisationId,
          run_id: runId,
          field: candidate.field,
          value: candidate.value,
          confidence: candidate.confidence,
          method: candidate.method,
          source_id: candidate.sourceId,
          source_url: candidate.sourceUrl,
          authority: candidate.authority,
          locator: candidate.locator,
          extracted_at: candidate.extractedAt,
          // The database refuses anything stronger than `ai_extracted` here,
          // so a caller that tried to write `verified` gets a constraint
          // violation rather than a quietly promoted value.
          verification: candidate.verificationState,
          injection_suspected: Boolean(candidate.injectionSuspected),
          document_id: candidate.documentId,
          document_version_id: candidate.documentVersionId,
          excerpt: candidate.excerpt,
        })),
      );
      if (error) throw new Error(error.message);
    },
    async decide(ctx, candidateId, decision, editedValue) {
      const candidate = await repository.getCandidate(ctx, candidateId);
      if (!candidate) return null;

      const db = await getClient();
      const { data: actor } = await db
        .from("users")
        .select("name")
        .eq("id", ctx.userId)
        .maybeSingle();

      // `applyReview` owns the confirm/edit/reject semantics: a confirmation
      // yields `verified`, an edit yields `provided` because the value became
      // the human's. Restating them here would be a second copy to drift.
      const outcome = applyReview(candidate, {
        decision,
        value: editedValue,
        reviewerId: ctx.userId,
        reviewerName: String((actor as Row | null)?.name ?? "Unknown reviewer"),
        at: ctx.now(),
      });

      let claimId: string | undefined;
      if (outcome.attested) {
        const claim = candidateToClaim(
          { ...candidate, value: outcome.attested.value },
          ctx.organisationId,
          ctx.now(),
          crypto.randomUUID(),
        );
        const { error } = await db.from("claims").insert({
          id: claim.id,
          organisation_id: ctx.organisationId,
          subject_type: claim.subject.type,
          subject_id: claim.subject.id,
          predicate: claim.predicate,
          value: claim.value,
          text: claim.text,
          kind: claim.kind,
          // The human decision is what lifts this out of `ai_extracted`, and
          // the producer becomes the person rather than the extractor.
          verification: outcome.verificationState,
          confidence: claim.confidence,
          derived_from: claim.derivedFrom,
          producer_method: "human",
          producer_detail: { actorId: ctx.userId },
          assumptions: claim.assumptions,
          caveats: claim.caveats,
          verified_by: ctx.userId,
          verified_at: ctx.now().toISOString(),
          created_at: ctx.now().toISOString(),
          updated_at: ctx.now().toISOString(),
          created_by: ctx.userId,
        });
        if (error) throw new Error(error.message);
        claimId = claim.id;
      }

      const { error: decisionError } = await db.from("candidate_decisions").insert({
        organisation_id: ctx.organisationId,
        run_id: (candidate as ProfileCandidate & { runId?: string }).runId ?? null,
        candidate_id: candidateId,
        decision,
        edited_value: editedValue ?? null,
        claim_id: claimId ?? null,
        decided_by: ctx.userId,
        decided_at: ctx.now().toISOString(),
      });
      if (decisionError) throw new Error(decisionError.message);

      return { candidate, claimId };
    },
    async decisions(ctx, runId) {
      const db = await getClient();
      const { data } = await db
        .from("candidate_decisions")
        .select("*")
        .eq("organisation_id", ctx.organisationId)
        .eq("run_id", runId);

      const out: Record<string, { decision: "confirm" | "edit" | "reject"; at: string; by?: string }> =
        {};
      for (const row of rows(data)) {
        out[String(row.candidate_id)] = {
          decision: String(row.decision) as "confirm" | "edit" | "reject",
          at: String(row.decided_at),
          by: opt(row.decided_by),
        };
      }
      return out;
    },
  };

  return repository;
}
