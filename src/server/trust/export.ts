import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import { planDeletion, type DeletionPlan } from "@/lib/trust";

/**
 * Everything an organisation holds, in a form they can read without this
 * product.
 *
 * The brief lists data export among the things that must be complete, and the
 * useful version of it has two properties that a JSON dump does not.
 *
 * **It is enumerable.** The export names every collection and its count, so an
 * organisation can tell whether it is complete. A file of unknown shape is not
 * something anybody can check they received all of.
 *
 * **It says what is missing.** Anything the acting person's role cannot read
 * is absent, and the export says so rather than quietly producing a smaller
 * file for a contributor than for an owner.
 */

export interface DataExport {
  organisationId: string;
  exportedAt: string;
  exportedBy: string;
  /** Every collection, with its count, so completeness is checkable. */
  contents: { collection: string; records: number }[];
  data: Record<string, unknown>;
  /** Collections the acting role could not read. Never silently omitted. */
  withheld: { collection: string; reason: string }[];
  /** What a deletion request would and would not remove. */
  deletionPlan: DeletionPlan;
  notes: string[];
}

/**
 * Build the export.
 *
 * Reads through the same tenant-scoped repository everything else uses, so an
 * export cannot reach further than the person requesting it. That is not a
 * limitation to work around: an export that used a privileged path would be
 * the largest data-exfiltration surface in the product.
 */
export async function buildDataExport(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<DataExport> {
  const data: Record<string, unknown> = {};
  const contents: DataExport["contents"] = [];
  const withheld: DataExport["withheld"] = [];

  const collect = async <T>(
    collection: string,
    read: () => Promise<T[]>,
  ): Promise<void> => {
    try {
      const records = await read();
      data[collection] = records;
      contents.push({ collection, records: records.length });
    } catch (error) {
      // A collection that threw is reported rather than omitted. An export
      // silently missing a table is worse than one that says which table.
      withheld.push({
        collection,
        reason: `Could not be read: ${(error as Error).message}`,
      });
    }
  };

  await collect("organisation", async () => {
    const organisation = await repo.organisations.get(ctx);
    return organisation ? [organisation] : [];
  });
  await collect("profile", async () => {
    const profile = await repo.organisations.profile(ctx);
    return profile ? [profile] : [];
  });
  await collect("members", () => repo.organisations.members(ctx));
  await collect("strategicPriorities", () => repo.strategy.priorities(ctx));
  await collect("programmes", () => repo.programmes.list(ctx));
  await collect("indicators", () => repo.programmes.allIndicators(ctx));
  await collect("grants", () => repo.grants.list(ctx));
  await collect("grantReports", () => repo.grants.allReports(ctx));
  await collect("requirements", () => repo.requirements.list(ctx));
  await collect("opportunities", () => repo.funding.listOpportunities(ctx));
  await collect("funders", () => repo.funding.listFunders(ctx));
  await collect("applications", () => repo.applications.list(ctx));
  await collect("evidence", () => repo.evidence.list(ctx));
  await collect("reports", () => repo.reports.list(ctx));
  await collect("claims", () => repo.claims.list(ctx));
  await collect("relations", () => repo.graph.list(ctx));
  await collect("relationships", () => repo.relationships.list(ctx));
  await collect("people", () => repo.relationships.listPeople(ctx));
  await collect("externalOrganisations", () => repo.relationships.listOrganisations(ctx));
  await collect("interactions", () => repo.relationships.listInteractions(ctx));
  await collect("commitments", () => repo.relationships.listCommitments(ctx));
  await collect("funds", () => repo.finance.funds(ctx));
  await collect("transactions", () => repo.finance.transactions(ctx));
  await collect("allocations", () => repo.finance.allocations(ctx));
  await collect("budgets", () => repo.finance.budgets(ctx));
  await collect("forms", () => repo.forms.list(ctx));
  await collect("formSubmissions", () => repo.forms.submissions(ctx));
  await collect("campaigns", () => repo.fundraising.campaigns(ctx));
  await collect("donations", () => repo.fundraising.donations(ctx));
  await collect("supporterProfiles", () => repo.fundraising.supporterProfiles(ctx));
  await collect("giftAidDeclarations", () => repo.fundraising.giftAidDeclarations(ctx));
  await collect("automations", () => repo.automation.list(ctx));
  await collect("automationRuns", () => repo.automation.runs(ctx));
  await collect("portals", () => repo.portals.list(ctx));
  await collect("portalIdentities", () => repo.portals.identities(ctx));
  await collect("integrationConnections", () => repo.integrations.connections(ctx));
  await collect("tasks", () => repo.workspace.tasks(ctx));
  await collect("auditEvents", () => repo.audit.list(ctx));
  await collect("aiGenerations", () => repo.audit.aiGenerations(ctx));

  const notes = [
    "Every record here is one this organisation owns. Nothing from another organisation can appear: the export reads through the same tenant-scoped boundary as every screen.",
    "Special category form answers are included only where the acting person holds the capability to read them. An export that ignored that would be a way around it.",
    "Money is in integer minor units with an explicit currency, never as a decimal, so nothing has been rounded on the way out.",
  ];

  return {
    organisationId: ctx.organisationId,
    exportedAt: ctx.now().toISOString(),
    exportedBy: ctx.userId,
    contents,
    data,
    withheld,
    deletionPlan: planDeletion(),
    notes,
  };
}

/**
 * The export's own summary, for somebody checking they got everything.
 *
 * A count per collection and a total, because "did I receive all of it?" is
 * the first question anybody asks of an export and the hardest to answer from
 * a large file.
 */
export function describeExport(exported: DataExport): string[] {
  const total = exported.contents.reduce((sum, entry) => sum + entry.records, 0);
  const lines = [
    `${total} records across ${exported.contents.length} collections, exported ${exported.exportedAt.slice(0, 10)}.`,
  ];
  if (exported.withheld.length > 0) {
    lines.push(
      `${exported.withheld.length} collection${exported.withheld.length === 1 ? "" : "s"} could not be included: ${exported.withheld.map((entry) => entry.collection).join(", ")}.`,
    );
  }
  if (exported.deletionPlan.partial) {
    lines.push(
      `${exported.deletionPlan.retained.length} kinds of record would survive a deletion request, and the export says which and why.`,
    );
  }
  return lines;
}
