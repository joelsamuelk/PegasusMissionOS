import { requireControlCapability } from "@/lib/control-plane/permissions";
import { createInternalAuditEvent } from "./audit";
import type { ControlRequestContext } from "./context";
import type { ControlRepository } from "./repository";
import type { ProspectOrganisation, ProspectPerson } from "./types";
import type { ResearchOutcome, ResearchOptions } from "@/lib/organisation-intelligence/pipeline";
import { researchWebsite } from "@/lib/organisation-intelligence/pipeline";
import type { PageFetcher } from "@/lib/organisation-intelligence/types";
import { mapProspectResearch } from "@/lib/control-plane/prospect-research";

export interface ProspectResearchProvider {
  readonly id: string;
  research(input: Omit<ResearchOptions, "fetcher">): Promise<ResearchOutcome>;
}

export class WebsiteProspectResearchProvider implements ProspectResearchProvider {
  readonly id = "organisation-intelligence";
  constructor(private readonly fetcher: PageFetcher) {}
  research(input: Omit<ResearchOptions, "fetcher">): Promise<ResearchOutcome> {
    return researchWebsite({ ...input, fetcher: this.fetcher });
  }
}

export async function researchProspect(ctx: ControlRequestContext, repo: ControlRepository, provider: ProspectResearchProvider, prospectId: string): Promise<{ sourceCount: number; factCount: number; conflictCount: number; degradedReason?: string }> {
  requireControlCapability(ctx.role, "prospect:research");
  const prospect = await repo.prospects.get(ctx, prospectId);
  if (!prospect) throw new Error("Prospect not found.");
  if (!prospect.website) throw new Error("A website is required before research can run.");
  const outcome = await provider.research({ organisationId: prospectId, websiteUrl: prospect.website, now: ctx.now, makeId: () => crypto.randomUUID() });
  const mapped = mapProspectResearch(prospectId, outcome);
  await repo.prospects.saveResearch(ctx, prospectId, mapped.sources, mapped.facts);
  await repo.audit.append(ctx, createInternalAuditEvent(ctx, { action: "prospect.research", targetType: "prospect_organisation", targetId: prospectId, after: { provider: provider.id, sources: mapped.sources.length, facts: mapped.facts.length, conflicts: outcome.reconciliation.conflicts.length } }));
  return { sourceCount: mapped.sources.length, factCount: mapped.facts.length, conflictCount: outcome.reconciliation.conflicts.length, degradedReason: outcome.degraded?.reason };
}

export async function createProspect(ctx: ControlRequestContext, repo: ControlRepository, input: { name: string; website?: string; country?: string; organisationType?: string; source: string }): Promise<string> {
  requireControlCapability(ctx.role, "prospect:create");
  if (!input.name.trim()) throw new Error("Prospect name is required.");
  if (input.website) { const url = new URL(input.website); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Website must use HTTP or HTTPS."); }
  const now = ctx.now().toISOString();
  const id = crypto.randomUUID();
  const prospect: ProspectOrganisation = { id, name: input.name.trim(), website: input.website, country: input.country, organisationType: input.organisationType, focusAreas: [], sizeIndicators: [], publicFinancialIndicators: [], publicProgrammeIndicators: [], status: "discovered", ownerId: ctx.internalUserId, source: input.source, createdAt: now, updatedAt: now };
  await repo.prospects.create(ctx, prospect);
  await repo.audit.append(ctx, createInternalAuditEvent(ctx, { action: "prospect.create", targetType: "prospect_organisation", targetId: id, after: { name: prospect.name, source: prospect.source } }));
  return id;
}

export async function addProspectPerson(ctx: ControlRequestContext, repo: ControlRepository, input: { prospectId: string; name: string; role?: string; email?: string; sourceUrl?: string }): Promise<string> {
  requireControlCapability(ctx.role, "prospect:update");
  if (!(await repo.prospects.get(ctx, input.prospectId))) throw new Error("Prospect not found.");
  if (!input.name.trim()) throw new Error("Person name is required.");
  const now = ctx.now().toISOString(); const id = crypto.randomUUID();
  const person: ProspectPerson = { id, prospectOrganisationId: input.prospectId, name: input.name.trim(), role: input.role, email: input.email, sourceUrl: input.sourceUrl, verificationState: input.sourceUrl ? "needs_review" : "provided", createdAt: now, updatedAt: now };
  await repo.prospects.addPerson(ctx, person);
  await repo.audit.append(ctx, createInternalAuditEvent(ctx, { action: "prospect_person.create", targetType: "prospect_person", targetId: id, after: { prospectId: input.prospectId, name: person.name } }));
  return id;
}
