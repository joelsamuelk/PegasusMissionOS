import type { ResearchOutcome } from "@/lib/organisation-intelligence/pipeline";
import type { ProspectFact, ProspectResearchSource } from "@/server/control-plane/types";

/** Maps reusable extraction output into Pegasus-owned prospect records. */
export function mapProspectResearch(prospectId: string, outcome: ResearchOutcome): { sources: ProspectResearchSource[]; facts: ProspectFact[] } {
  const conflicts = new Map<string, string>();
  for (const conflict of outcome.reconciliation.conflicts) {
    const group = crypto.randomUUID();
    for (const candidate of conflict.candidates) conflicts.set(candidate.id, group);
  }
  return {
    sources: outcome.sources.map((source) => ({ id: source.id, prospectOrganisationId: prospectId, type: source.type, title: source.title, url: source.url, publisher: source.publisher, authority: source.authority, retrievedAt: source.retrievedAt, extractionStatus: source.extractionStatus, failureReason: source.failureReason })),
    facts: outcome.candidates.map((candidate) => ({ id: candidate.id, prospectOrganisationId: prospectId, field: candidate.field, value: candidate.value, sourceId: candidate.sourceId, sourceUrl: candidate.sourceUrl, locator: candidate.locator, authority: candidate.authority, verificationState: candidate.injectionSuspected ? "needs_review" : "ai_extracted", confidence: candidate.confidence, extractionMethod: candidate.method, injectionSuspected: Boolean(candidate.injectionSuspected), conflictGroup: conflicts.get(candidate.id), extractedAt: candidate.extractedAt })),
  };
}
