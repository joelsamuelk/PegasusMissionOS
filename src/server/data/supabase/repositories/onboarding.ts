import { applyReview, candidateToClaim } from "@/lib/organisation-intelligence/approve";
import type {
  ProfileCandidate,
  ResearchSource,
} from "@/lib/organisation-intelligence/types";
import type { Claim, OnboardingRun, OrganisationType, SourceAuthority } from "@/types/domain";
import type { CandidateDecision, OnboardingRepository } from "../../types";
import { auditFrom, numberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapRun(row: Row): OnboardingRun {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    // The input is flattened across columns rather than stored as jsonb: the
    // name and registration number are looked up, not just read back.
    input: {
      name: String(row.input_name),
      ...(row.input_website_url ? { websiteUrl: String(row.input_website_url) } : {}),
      ...(row.input_country ? { country: String(row.input_country) } : {}),
      ...(row.input_registration_number
        ? { registrationNumber: String(row.input_registration_number) }
        : {}),
      ...(row.input_organisation_type
        ? { organisationType: row.input_organisation_type as OrganisationType }
        : {}),
    },
    stage: row.stage as OnboardingRun["stage"],
    status: row.status as OnboardingRun["status"],
    startedAt: String(row.started_at),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
    // Real counts from the run. Never a fabricated progress percentage.
    counts: {
      sourcesDiscovered: numberFrom(row.count_sources_discovered),
      pagesRead: numberFrom(row.count_pages_read),
      documentsFound: numberFrom(row.count_documents_found),
      documentsParsed: numberFrom(row.count_documents_parsed),
      candidatesFound: numberFrom(row.count_candidates_found),
      conflicts: numberFrom(row.count_conflicts),
    },
    // A degraded run is not a failure the user has to resolve before
    // continuing, so it carries guidance alongside the reason.
    ...(row.degraded_reason
      ? {
          degraded: {
            reason: String(row.degraded_reason),
            guidance: String(row.degraded_guidance ?? ""),
          },
        }
      : {}),
    ...(row.started_by ? { startedBy: String(row.started_by) } : {}),
    audit: auditFrom(row),
  };
}

function mapSource(row: Row): ResearchSource {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    type: row.type as ResearchSource["type"],
    ...(row.title ? { title: String(row.title) } : {}),
    url: String(row.url),
    ...(row.publisher ? { publisher: String(row.publisher) } : {}),
    authority: row.authority as SourceAuthority,
    discoveredAt: String(row.discovered_at),
    ...(row.retrieved_at ? { retrievedAt: String(row.retrieved_at) } : {}),
    ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
    ...(row.content_hash ? { contentHash: String(row.content_hash) } : {}),
    extractionStatus: row.extraction_status as ResearchSource["extractionStatus"],
    ...(row.failure_reason ? { failureReason: String(row.failure_reason) } : {}),
    ...(row.metadata ? { metadata: row.metadata as Record<string, unknown> } : {}),
  };
}

function mapCandidate(row: Row): ProfileCandidate & { runId: string } {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    runId: String(row.run_id),
    field: row.field as ProfileCandidate["field"],
    value: String(row.value),
    confidence: numberFrom(row.confidence),
    method: row.method as ProfileCandidate["method"],
    sourceId: String(row.source_id ?? ""),
    sourceUrl: String(row.source_url),
    authority: row.authority as SourceAuthority,
    locator: String(row.locator),
    extractedAt: String(row.extracted_at),
    verificationState: row.verification as ProfileCandidate["verificationState"],
    ...(row.injection_suspected != null
      ? { injectionSuspected: Boolean(row.injection_suspected) }
      : {}),
    ...(row.document_id ? { documentId: String(row.document_id) } : {}),
    ...(row.document_version_id ? { documentVersionId: String(row.document_version_id) } : {}),
    ...(row.excerpt ? { excerpt: String(row.excerpt) } : {}),
  };
}

export function createOnboardingRepository(q: Query, deps: Deps): OnboardingRepository {
  return {
    async runs(ctx) {
      const rows = await q.many(ctx, "onboarding_runs", {}, {
        order: { column: "started_at", ascending: false },
      });
      return rows.map(mapRun);
    },

    async getRun(ctx, id) {
      const row = await q.maybeOne(ctx, "onboarding_runs", { id });
      return row ? mapRun(row) : null;
    },

    async latestRun(ctx) {
      const rows = await q.many(ctx, "onboarding_runs", {}, {
        order: { column: "started_at", ascending: false },
      });
      const first = rows[0];
      return first ? mapRun(first) : null;
    },

    async startRun(ctx, input) {
      const row = await q.insert(ctx, "onboarding_runs", {
        inputName: input.name,
        inputWebsiteUrl: input.websiteUrl,
        inputCountry: input.country,
        inputRegistrationNumber: input.registrationNumber,
        inputOrganisationType: input.organisationType,
        stage: "discovering",
        status: "running",
        startedAt: ctx.now().toISOString(),
        countSourcesDiscovered: 0,
        countPagesRead: 0,
        countDocumentsFound: 0,
        countDocumentsParsed: 0,
        countCandidatesFound: 0,
        countConflicts: 0,
        startedBy: ctx.userId,
      });
      return mapRun(row);
    },

    async updateRun(ctx, id, patch) {
      await q.update(ctx, "onboarding_runs", id, {
        stage: patch.stage,
        status: patch.status,
        completedAt: patch.completedAt,
        ...(patch.counts
          ? {
              countSourcesDiscovered: patch.counts.sourcesDiscovered,
              countPagesRead: patch.counts.pagesRead,
              countDocumentsFound: patch.counts.documentsFound,
              countDocumentsParsed: patch.counts.documentsParsed,
              countCandidatesFound: patch.counts.candidatesFound,
              countConflicts: patch.counts.conflicts,
            }
          : {}),
        ...(patch.degraded
          ? {
              degradedReason: patch.degraded.reason,
              degradedGuidance: patch.degraded.guidance,
            }
          : {}),
      });
    },

    async sources(ctx, runId) {
      const rows = await q.many(ctx, "research_sources", { run_id: runId }, {
        order: { column: "discovered_at" },
      });
      return rows.map(mapSource);
    },

    async saveSources(ctx, runId, sources) {
      // A run's sources are written as a set: re-running discovery replaces
      // what it found rather than accumulating duplicates of the same URLs.
      await q.remove(ctx, "research_sources", { run_id: runId });
      for (const source of sources) {
        await q.insert(
          ctx,
          "research_sources",
          {
            id: source.id,
            runId,
            type: source.type,
            title: source.title,
            url: source.url,
            publisher: source.publisher,
            authority: source.authority,
            discoveredAt: source.discoveredAt,
            retrievedAt: source.retrievedAt,
            publishedAt: source.publishedAt,
            contentHash: source.contentHash,
            extractionStatus: source.extractionStatus,
            failureReason: source.failureReason,
            metadata: source.metadata,
          },
          { audit: false },
        );
      }
    },

    async candidates(ctx, runId) {
      const rows = await q.many(ctx, "profile_candidates", { run_id: runId }, {
        order: { column: "field" },
      });
      return rows.map(mapCandidate);
    },

    async getCandidate(ctx, id) {
      const row = await q.maybeOne(ctx, "profile_candidates", { id });
      return row ? mapCandidate(row) : null;
    },

    async saveCandidates(ctx, runId, candidates) {
      await q.remove(ctx, "profile_candidates", { run_id: runId });
      for (const candidate of candidates) {
        await q.insert(
          ctx,
          "profile_candidates",
          {
            id: candidate.id,
            runId,
            field: candidate.field,
            value: candidate.value,
            confidence: candidate.confidence,
            method: candidate.method,
            sourceId: candidate.sourceId || undefined,
            sourceUrl: candidate.sourceUrl,
            authority: candidate.authority,
            locator: candidate.locator,
            extractedAt: candidate.extractedAt,
            verification: candidate.verificationState,
            injectionSuspected: candidate.injectionSuspected ?? false,
            documentId: candidate.documentId,
            documentVersionId: candidate.documentVersionId,
            excerpt: candidate.excerpt,
          },
          { audit: false },
        );
      }
    },

    async decide(ctx, candidateId, decision, editedValue) {
      const row = await q.maybeOne(ctx, "profile_candidates", { id: candidateId });
      if (!row) return null;
      const candidate = mapCandidate(row);

      const { data: user } = await q.raw
        .from("users")
        .select("name")
        .eq("id", ctx.userId)
        .maybeSingle();

      // `applyReview` owns the rule that a confirmation yields `verified` and
      // an edit yields `provided` -- the value became the human's, not the
      // source's. Restating it here would be a second copy to drift.
      const outcome = applyReview(candidate, {
        decision,
        value: editedValue,
        reviewerId: ctx.userId,
        reviewerName: (user?.name as string | undefined) ?? "Unknown reviewer",
        at: ctx.now(),
      });

      let claimId: string | undefined;
      if (outcome.attested) {
        // An approved candidate becomes a claim, which is what carries its
        // provenance everywhere else in the product. Rejection writes nothing
        // but the decision itself.
        //
        // Built by `candidateToClaim` and written through the claims
        // repository rather than inserted here, so the producer rules run:
        // a human confirming an extraction is the actor, and the resulting
        // claim says so.
        const built = candidateToClaim(
          { ...candidate, value: outcome.attested.value },
          ctx.organisationId,
          ctx.now(),
          crypto.randomUUID(),
        );
        const stored = await deps.claims.create(ctx, {
          subject: built.subject,
          predicate: built.predicate,
          value: built.value,
          text: built.text,
          kind: built.kind,
          verification: outcome.verificationState as Claim["verification"],
          confidence: built.confidence,
          sources: built.sources,
          derivedFrom: built.derivedFrom,
          supportedBy: built.supportedBy,
          producedBy: { method: "human", actorId: ctx.userId },
        });
        // `ClaimInit` carries no verifier, because most claims have none. This
        // one does: a person looked at the excerpt and decided.
        await q.update(
          ctx,
          "claims",
          stored.id,
          { verifiedBy: ctx.userId, verifiedAt: ctx.now().toISOString() },
          { audit: false },
        );
        claimId = stored.id;
      }

      await q.insert(
        ctx,
        "candidate_decisions",
        {
          runId: candidate.runId,
          candidateId,
          decision,
          editedValue,
          claimId,
          decidedBy: ctx.userId,
          decidedAt: ctx.now().toISOString(),
        },
        { audit: false },
      );

      await deps.audit.record(ctx, {
        action: `onboarding.candidate_${decision}`,
        entityType: "research_source",
        entityId: candidateId,
        summary: `${candidate.field}: ${decision}${
          editedValue ? " (edited)" : ""
        } from ${candidate.sourceUrl}`,
      });

      return { candidate, claimId };
    },

    async decisions(ctx, runId) {
      const run = await q.maybeOne(ctx, "onboarding_runs", { id: runId });
      if (!run) return {};
      const rows = await q.many(ctx, "candidate_decisions", { run_id: runId });
      const out: Record<string, { decision: CandidateDecision; at: string; by?: string }> = {};
      for (const row of rows) {
        out[String(row.candidate_id)] = {
          decision: row.decision as CandidateDecision,
          at: String(row.decided_at),
          ...(row.decided_by ? { by: String(row.decided_by) } : {}),
        };
      }
      return out;
    },
  };
}
