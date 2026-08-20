import type { SupabaseClient } from "@supabase/supabase-js";

import type { MissionRepository } from "../types";
import { createActivityRecorder } from "./activity";
import { type AdapterOptions, type Deps, Query } from "./query";
import { createOrganisationRepository } from "./repositories/organisations";
import { createClaimRepository } from "./repositories/claims";
import { createGraphRepository } from "./repositories/graph";
import { createDocumentRepository } from "./repositories/documents";
import { createOnboardingRepository } from "./repositories/onboarding";
import { createStrategyRepository } from "./repositories/strategy";
import { createFinanceRepository } from "./repositories/finance";
import { createRequirementRepository } from "./repositories/requirements";
import { createFundingRepository } from "./repositories/funding";
import { createApplicationRepository } from "./repositories/applications";
import { createGrantRepository } from "./repositories/grants";
import { createProgrammeRepository } from "./repositories/programmes";
import { createEvidenceRepository } from "./repositories/evidence";
import { createReportRepository } from "./repositories/reports";
import { createRelationshipRepository } from "./repositories/relationships";
import { createWorkspaceRepository } from "./repositories/workspace";
import { createFormRepository } from "./repositories/forms";
import { createPublicFormRepository } from "./repositories/public-forms";
import { createFundraisingRepository } from "./repositories/fundraising";
import { createIntegrationRepository } from "./repositories/integrations";
import { createPortalRepository } from "./repositories/portals";
import { createPortalAccessRepository } from "./repositories/portal-access";
import { createAutomationRepository } from "./repositories/automation";
import { createAuditRepository } from "./repositories/audit";

/**
 * The Supabase adapter.
 *
 * The second implementation of `MissionRepository`, and the reason the
 * interface exists. Everything above the data layer is written against the
 * interface, so which of the two is in use is a configuration decision made in
 * `src/server/data/index.ts` and nowhere else.
 *
 * Reads and writes are scoped twice: once here, by the adapter's own
 * `organisation_id` filter, and once in the database, by row level security.
 * The redundancy is the point -- see {@link TenantFilter}.
 */
export function createSupabaseRepository(
  client: SupabaseClient,
  options: AdapterOptions = {},
): MissionRepository {
  const q = new Query(client, options.tenantFilter ?? "on");
  const audit = createAuditRepository(q);
  const recordActivity = createActivityRecorder(q);
  // Audit and graph are built first: other repositories record events through
  // the one and edges through the other. Both depend only on what precedes
  // them, so the order is a fact about the dependency graph, not a convention.
  const graph = createGraphRepository(q, { audit });
  const claims = createClaimRepository(q, { audit });
  const deps: Deps = { audit, recordActivity, graph, claims };
  return {
    name: "supabase",
    organisations: createOrganisationRepository(q, deps),
    claims,
    graph,
    documents: createDocumentRepository(q, deps),
    onboarding: createOnboardingRepository(q, deps),
    strategy: createStrategyRepository(q, deps),
    finance: createFinanceRepository(q, deps),
    requirements: createRequirementRepository(q, deps),
    funding: createFundingRepository(q, deps),
    applications: createApplicationRepository(q, deps),
    grants: createGrantRepository(q, deps),
    programmes: createProgrammeRepository(q, deps),
    evidence: createEvidenceRepository(q, deps),
    reports: createReportRepository(q, deps),
    relationships: createRelationshipRepository(q, deps),
    workspace: createWorkspaceRepository(q, deps),
    forms: createFormRepository(q, deps),
    publicForms: createPublicFormRepository(q, deps),
    fundraising: createFundraisingRepository(q, deps),
    integrations: createIntegrationRepository(q, deps),
    portals: createPortalRepository(q, deps),
    portalAccess: createPortalAccessRepository(q, deps),
    automation: createAutomationRepository(q, deps),
    audit,
  };
}
