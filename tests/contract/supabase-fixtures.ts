import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createRequestContext } from "@/server/context/request-context";
import { createSupabaseRepository } from "@/server/data/supabase/adapter";
import type { AdapterOptions } from "@/server/data/supabase/query";
import type { ContractHarness } from "./repository-contract";

/**
 * Two seeded tenants in a real Postgres, for the shared repository contract.
 *
 * This writes to whatever database the environment points at, so it is gated
 * behind an explicit opt-in rather than the presence of credentials: a test
 * run that quietly seeded somebody's project because their `.env` happened to
 * be loaded would be a nasty surprise. Set PEGASUS_CONTRACT_DB=1 to allow it.
 *
 * It seeds with the **service role**, which bypasses row level security. That
 * is deliberate and it is the point of this suite: with RLS out of the way,
 * the only thing scoping a read is the adapter's own `organisation_id` filter,
 * so a missing `.eq()` leaks here rather than being masked by a policy. The
 * policies get their own tests, against SQL, in tests/database.
 */

export function contractDatabaseConfigured(): boolean {
  return (
    process.env.PEGASUS_CONTRACT_DB === "1" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/**
 * Fixed ids, so a failed run leaves something recognisable to clean up.
 *
 * The leading digit is a **suite namespace**, and it is not decoration. Vitest
 * runs test files in parallel, and both files that seed here also tear down;
 * sharing one set of ids meant each suite deleting the other's organisation
 * mid-run, which surfaced as foreign key violations on rows that had existed a
 * moment earlier. Two namespaces, no shared rows, no race.
 */
type Suite = "contract" | "rls";

const NAMESPACE: Record<Suite, [string, string]> = {
  contract: ["1", "2"],
  rls: ["3", "4"],
};

const ids = (suite: Suite) => {
  const [a, b] = NAMESPACE[suite];
  const build = (d: string, n: number) =>
    `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${String(n).padStart(12, "0")}`;
  return {
    ORG_A: build(a, 1_000_000_000_01),
    ORG_B: build(b, 1_000_000_000_02),
    USER_A: build(a, 1_000_000_000_11),
    USER_B: build(b, 1_000_000_000_12),
    id: (tenant: "a" | "b", n: number) => build(tenant === "a" ? a : b, n),
  };
};

/** Everything one suite's fixtures resolve to. Nothing is shared between them. */
function fixturesFor(suite: Suite) {
  const { ORG_A, ORG_B, USER_A, USER_B, id } = ids(suite);
  const FIXTURES = {
  funderA: id("a", 1),
  opportunityId: id("a", 2),
  applicationId: id("a", 3),
  answerId: id("a", 4),
  grantId: id("a", 5),
  programmeId: id("a", 6),
  outcomeA: id("a", 7),
  indicatorId: id("a", 8),
  evidenceId: id("a", 9),
  reportId: id("a", 10),
  claimId: id("a", 11),
  };

  const FOREIGN = {
  funderB: id("b", 1),
  opportunityId: id("b", 2),
  grantId: id("b", 3),
  evidenceId: id("b", 4),
  claimId: id("b", 5),
  };
  return { ORG_A, ORG_B, USER_A, USER_B, FIXTURES, FOREIGN };
}

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * A fixed password for the two seeded auth users.
 *
 * They exist only while the contract suite runs, are created and deleted by
 * it, and can do nothing but be the two tenants it seeds. A generated password
 * would have to be carried between processes for no gain.
 */
const CONTRACT_PASSWORD = "pegasus-contract-suite-only";

export function contractUsers(suite: Suite = "contract") {
  const { ORG_A, ORG_B, USER_A, USER_B } = fixturesFor(suite);
  return {
    a: { id: USER_A, organisationId: ORG_A, email: `contract-${suite}-a@pegasus.test` },
    b: { id: USER_B, organisationId: ORG_B, email: `contract-${suite}-b@pegasus.test` },
  };
}

/**
 * Create the auth users the RLS tests need.
 *
 * `is_org_member` resolves membership through `auth.uid()`, so proving that
 * row level security isolates requires a real session -- not a service-role
 * key, which bypasses RLS entirely and would prove the opposite.
 *
 * The ids match the `users` rows deliberately: `organisation_members.user_id`
 * has to equal `auth.uid()` for a policy to see the membership at all.
 */
export async function seedAuthUsers(
  client: SupabaseClient,
  suite: Suite = "contract",
): Promise<void> {
  for (const user of Object.values(contractUsers(suite))) {
    await client.auth.admin.deleteUser(user.id).catch(() => undefined);
    const { error } = await client.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: CONTRACT_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create the contract auth user: ${error.message}`);
  }
}

export async function removeAuthUsers(
  client: SupabaseClient,
  suite: Suite = "contract",
): Promise<void> {
  for (const user of Object.values(contractUsers(suite))) {
    await client.auth.admin.deleteUser(user.id).catch(() => undefined);
  }
}

/** A client carrying a real session, so row level security applies to it. */
export async function signedInClient(
  who: "a" | "b",
  suite: Suite = "contract",
): Promise<SupabaseClient> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: contractUsers(suite)[who].email,
    password: CONTRACT_PASSWORD,
  });
  if (error) throw new Error(`Could not sign in the contract user: ${error.message}`);
  return client;
}

/** Remove everything this module writes, in dependency order. */
export async function teardown(client: SupabaseClient, suite: Suite = "contract"): Promise<void> {
  const { ORG_A, ORG_B, USER_A, USER_B } = fixturesFor(suite);
  const byOrg = [
    "claim_sources",
    "claim_usages",
    "claims",
    "impact_report_sections",
    "impact_reports",
    "evidence_items",
    "indicators",
    "outcomes",
    "programmes",
    "grant_reports",
    "grants",
    "application_answers",
    "applications",
    "funding_opportunities",
    "funders",
    "audit_events",
    "activity_events",
    "organisation_members",
  ];
  for (const table of byOrg) {
    await client.from(table).delete().in("organisation_id", [ORG_A, ORG_B]);
  }
  await client.from("organisations").delete().in("id", [ORG_A, ORG_B]);
  await client.from("users").delete().in("id", [USER_A, USER_B]);
}

async function seed(client: SupabaseClient, suite: Suite): Promise<void> {
  const { ORG_A, ORG_B, USER_A, USER_B, FIXTURES, FOREIGN } = fixturesFor(suite);
  await teardown(client, suite);

  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    const { error } = await client.from(table).insert(rows);
    if (error) throw new Error(`Seeding ${table} failed: ${error.message}`);
  };

  // Emails carry the suite too. `users.email` is unique across the table, so
  // two suites seeding the same address collide even though their ids do not.
  await insert("users", [
    { id: USER_A, email: `contract-${suite}-a@pegasus.test`, name: "Contract A" },
    { id: USER_B, email: `contract-${suite}-b@pegasus.test`, name: "Contract B" },
  ]);
  await insert("organisations", [
    {
      id: ORG_A, name: "Contract Northstar", legal_name: "Contract Northstar Ltd",
      type: "charity", operating_regions: [], is_demo: false, ai_enabled: true,
    },
    {
      id: ORG_B, name: "Contract Beacon", legal_name: "Contract Beacon Ltd",
      type: "charity", operating_regions: [], is_demo: false, ai_enabled: true,
    },
  ]);
  await insert("organisation_members", [
    { organisation_id: ORG_A, user_id: USER_A, role: "owner", status: "active" },
    { organisation_id: ORG_B, user_id: USER_B, role: "owner", status: "active" },
  ]);

  await insert("funders", [
    { id: FIXTURES.funderA, organisation_id: ORG_A, name: "Contract Trust", is_demo: false },
    { id: FOREIGN.funderB, organisation_id: ORG_B, name: "Beacon Trust", is_demo: false },
  ]);

  await insert("funding_opportunities", [
    {
      id: FIXTURES.opportunityId, organisation_id: ORG_A, funder_id: FIXTURES.funderA,
      programme_name: "Contract Fund", currency: "GBP", funding_type: "project",
      eligible_org_types: [], eligible_locations: [], priority_themes: [],
      required_documents: [], reporting_requirements: [], stage: "qualified",
      probability: 50, saved: false, is_demo: false,
    },
    {
      id: FOREIGN.opportunityId, organisation_id: ORG_B, funder_id: FOREIGN.funderB,
      programme_name: "Beacon Fund", currency: "GBP", funding_type: "project",
      eligible_org_types: [], eligible_locations: [], priority_themes: [],
      required_documents: [], reporting_requirements: [], stage: "reviewing",
      probability: 40, saved: false, is_demo: false,
    },
  ]);

  await insert("applications", [
    {
      id: FIXTURES.applicationId, organisation_id: ORG_A,
      opportunity_id: FIXTURES.opportunityId, title: "Contract application",
      status: "in_progress", contributor_ids: [], reviewer_ids: [],
      required_documents: [], submission_checklist: [],
    },
  ]);
  await insert("application_answers", [
    {
      id: FIXTURES.answerId, organisation_id: ORG_A,
      application_id: FIXTURES.applicationId, ord: 1,
      question_text: "What will you do?", draft: "", status: "not_started",
      evidence_ids: [],
    },
  ]);

  await insert("grants", [
    {
      id: FIXTURES.grantId, organisation_id: ORG_A, funder_id: FIXTURES.funderA,
      title: "Contract grant", award_value: 50000, currency: "GBP", restricted: true,
      start_date: "2026-01-01", end_date: "2026-12-31", spent_to_date: 0,
      conditions: [], status: "active",
    },
    {
      id: FOREIGN.grantId, organisation_id: ORG_B, funder_id: FOREIGN.funderB,
      title: "Beacon grant", award_value: 20000, currency: "GBP", restricted: false,
      start_date: "2026-01-01", end_date: "2026-12-31", spent_to_date: 0,
      conditions: [], status: "active",
    },
  ]);

  await insert("programmes", [
    {
      id: FIXTURES.programmeId, organisation_id: ORG_A, name: "Contract programme",
      status: "active", communities_served: [], activities: [], outputs: [],
      delivery_partners: [], risks: [],
    },
  ]);
  await insert("outcomes", [
    {
      id: FIXTURES.outcomeA, organisation_id: ORG_A,
      programme_id: FIXTURES.programmeId, title: "Contract outcome", level: "outcome",
    },
  ]);
  await insert("indicators", [
    {
      id: FIXTURES.indicatorId, organisation_id: ORG_A, outcome_id: FIXTURES.outcomeA,
      name: "People supported", baseline: 0, target: 100, current_value: 40,
      unit: "people", confidence: "medium",
    },
  ]);

  await insert("evidence_items", [
    {
      id: FIXTURES.evidenceId, organisation_id: ORG_A, title: "Contract evidence",
      type: "statistic", verification: "provided", tags: [],
    },
    {
      id: FOREIGN.evidenceId, organisation_id: ORG_B, title: "Beacon evidence",
      type: "statistic", verification: "provided", tags: [],
    },
  ]);

  await insert("impact_reports", [
    {
      id: FIXTURES.reportId, organisation_id: ORG_A, title: "Contract report",
      type: "impact", status: "draft", reporting_period: "2026",
      included_indicator_ids: [], included_evidence_ids: [],
      contributor_ids: [], reviewer_ids: [], approver_ids: [],
    },
  ]);

  // A report with no sections is a report `saveSection` cannot write to and
  // `cutVersion` pins nothing from, which would make the version tests pass
  // for the wrong reason.
  await insert("impact_report_sections", [
    {
      organisation_id: ORG_A, report_id: FIXTURES.reportId, key: "executive_summary",
      title: "Executive summary", type: "narrative", content: "", claim_ids: [], ord: 0,
    },
    {
      organisation_id: ORG_A, report_id: FIXTURES.reportId, key: "outcomes",
      title: "Outcomes", type: "metrics", content: "", claim_ids: [], ord: 1,
    },
  ]);

  await insert("claims", [
    {
      id: FIXTURES.claimId, organisation_id: ORG_A,
      subject_type: "programme", subject_id: FIXTURES.programmeId,
      predicate: "participants_supported",
      value: { type: "number", number: 40 }, text: "40 people supported",
      kind: "fact", verification: "provided", derived_from: [],
      producer_method: "human", producer_detail: { actorId: USER_A },
      assumptions: [], caveats: [],
    },
    {
      id: FOREIGN.claimId, organisation_id: ORG_B,
      subject_type: "organisation", subject_id: ORG_B,
      predicate: "participants_supported",
      value: { type: "number", number: 10 }, text: "10 people supported",
      kind: "fact", verification: "provided", derived_from: [],
      producer_method: "human", producer_detail: { actorId: USER_B },
      assumptions: [], caveats: [],
    },
  ]);
}

const NOW = new Date("2026-07-21T10:00:00Z");

export async function seedContractTenants(
  client: SupabaseClient,
  suite: Suite = "contract",
): Promise<void> {
  await seed(client, suite);
}

export async function createSupabaseContractHarness(
  options: AdapterOptions = {},
): Promise<ContractHarness> {
  const client = serviceClient();
  const { ORG_A, ORG_B, USER_A, USER_B, FIXTURES, FOREIGN } = fixturesFor("contract");
  await seed(client, "contract");

  return {
    repo: createSupabaseRepository(async () => client, options),
    ctxA: createRequestContext({
      organisationId: ORG_A, userId: USER_A, role: "owner", now: () => NOW,
    }),
    ctxB: createRequestContext({
      organisationId: ORG_B, userId: USER_B, role: "owner", now: () => NOW,
    }),
    fixtures: {
      opportunityId: FIXTURES.opportunityId,
      applicationId: FIXTURES.applicationId,
      answerId: FIXTURES.answerId,
      grantId: FIXTURES.grantId,
      programmeId: FIXTURES.programmeId,
      indicatorId: FIXTURES.indicatorId,
      evidenceId: FIXTURES.evidenceId,
      reportId: FIXTURES.reportId,
      claimId: FIXTURES.claimId,
    },
    foreign: {
      opportunityId: FOREIGN.opportunityId,
      grantId: FOREIGN.grantId,
      evidenceId: FOREIGN.evidenceId,
      claimId: FOREIGN.claimId,
    },
    teardown: () => teardown(client, "contract").then(() => undefined),
  };
}
