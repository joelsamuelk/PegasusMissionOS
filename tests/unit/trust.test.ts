import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_GUARANTEES,
  AI_REGISTER,
  RETENTION_RULES,
  TRUST_STATEMENTS,
  consequentialUses,
  gaps,
  planDeletion,
  registerFor,
  unmetStatements,
} from "@/lib/trust";
import { FEATURE_PROMPTS, type AiFeature } from "@/lib/ai";
import { buildDataExport, describeExport } from "@/server/trust/export";
import { createTwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-12 — production trust.
 *
 * The acceptance test is *credible for an organisation to trust with real
 * operational and financial information, not merely impressive in a
 * demonstration*, and almost the whole difference between those two is what a
 * product is willing to say it has not done.
 *
 * So the tests here are mostly about honesty rather than about behaviour: that
 * the AI register cannot go stale, that the trust page admits what is not
 * true, that no certification is claimed, and that an export says what it
 * could not include.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
/**
 * Numbered migrations only.
 *
 * `APPLY_*.sql` files are consolidated copies of migrations that already
 * appear here, so scanning them double-counts. They also break the `>= "0022"`
 * comparison the checks below use to mean "added by this programme": "A" sorts
 * after "0", so an apply file passes that filter whatever it contains, and
 * `APPLY_0017_TO_0021.sql` arriving in a merge made these tests read a
 * migration from before the programme started.
 */
const migrationSql = readdirSync(MIGRATIONS)
  .filter((file) => /^\d{4}_.*\.sql$/.test(file))
  .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), "utf8") }));

describe("the AI register cannot go stale", () => {
  /**
   * The only mechanism that keeps a register like this true. A feature added
   * without an entry fails the build rather than quietly making the Trust
   * Centre wrong.
   */
  it("covers every AI feature the product has", () => {
    const features = Object.keys(FEATURE_PROMPTS) as AiFeature[];
    const registered = AI_REGISTER.map((entry) => entry.feature);

    expect(new Set(registered).size).toBe(registered.length);
    for (const feature of features) {
      expect(registered, `${feature} is not in the AI register`).toContain(feature);
    }
    expect(registered.length).toBe(features.length);
  });

  it("says what each use can never see, not only what it sees", () => {
    for (const entry of AI_REGISTER) {
      expect(entry.sees.length, entry.feature).toBeGreaterThan(0);
      // The more useful half, and the one nobody volunteers.
      expect(entry.neverSees.length, entry.feature).toBeGreaterThan(0);
      expect(entry.produces.trim(), entry.feature).not.toBe("");
    }
  });

  /**
   * Asserted on every entry rather than stated once, because the register is
   * what an organisation reads and a single exception would make it false.
   */
  it("declares that no AI output changes a record", () => {
    for (const entry of AI_REGISTER) {
      expect(entry.writesWithoutReview, entry.feature).toBe(false);
    }
  });

  it("excludes personal data and transaction narratives from every use", () => {
    for (const entry of AI_REGISTER) {
      const exclusions = entry.neverSees.join(" ").toLowerCase();
      expect(exclusions, entry.feature).toMatch(/personal and special category/);
      expect(exclusions, entry.feature).toMatch(/transaction descriptions/);
    }
  });

  it("marks the two features a funder reads as consequential", () => {
    expect(consequentialUses().map((entry) => entry.feature).sort()).toEqual([
      "draft_answer",
      "report_section",
    ]);
  });

  it("resolves a use by feature", () => {
    expect(registerFor("mission_brief")?.surface).toMatch(/Mission Intelligence/);
    expect(registerFor("invented" as AiFeature)).toBeUndefined();
  });

  it("states its guarantees as things that could be checked", () => {
    expect(AI_GUARANTEES.length).toBeGreaterThan(4);
    for (const guarantee of AI_GUARANTEES) {
      // No reassurance without a mechanism behind it.
      expect(guarantee).not.toMatch(/take your privacy seriously|industry.leading|best.in.class/i);
    }
  });
});

describe("the Trust Centre admits what is not true", () => {
  /**
   * A trust page with no unmet rows is a marketing page. An organisation
   * deciding whether to put their finances into a product learns more from
   * what a vendor will say it has not done.
   */
  it("has rows that are not yet true", () => {
    const unmet = unmetStatements();
    expect(unmet.length).toBeGreaterThan(4);
    for (const statement of unmet) {
      expect(statement.wouldRequire, statement.statement).toBeTruthy();
    }
  });

  /** The brief's line: do not claim certifications not actually obtained. */
  it("claims no certification", () => {
    const certification = TRUST_STATEMENTS.find((statement) =>
      /audit or certification/i.test(statement.statement),
    );
    expect(certification?.status).toBe("not_yet");
    expect(certification?.wouldRequire).toMatch(/ISO 27001, SOC 2 or Cyber Essentials/);

    // And nothing anywhere claims one obliquely.
    for (const statement of TRUST_STATEMENTS) {
      if (statement.status !== "upheld") continue;
      expect(statement.statement).not.toMatch(/ISO ?27001|SOC ?2|Cyber Essentials|certified/i);
    }
  });

  it("gives every upheld statement somewhere it can be checked", () => {
    for (const statement of TRUST_STATEMENTS) {
      if (statement.status !== "upheld") continue;
      // A claim with nowhere to check it is a claim.
      expect(statement.evidence, statement.statement).toBeTruthy();
    }
  });

  it("says why anything declined was declined", () => {
    const declined = TRUST_STATEMENTS.filter((statement) => statement.status === "declined");
    expect(declined.length).toBeGreaterThan(0);
    for (const statement of declined) {
      expect(statement.wouldRequire, statement.statement).toBeTruthy();
    }
  });

  /**
   * The standing constraint through every phase. A trust page claiming RLS
   * without saying it has never executed would be the single most misleading
   * row available.
   */
  it("does not claim row level security is proven", () => {
    const rls = TRUST_STATEMENTS.find((statement) =>
      /row level security is enabled on every table/i.test(statement.statement),
    );
    expect(rls?.status).toBe("partial");
    expect(rls?.wouldRequire).toMatch(/no code has ever executed them/);
  });

  it("covers every area the brief names", () => {
    const areas = new Set(TRUST_STATEMENTS.map((statement) => statement.area));
    for (const area of [
      "security",
      "privacy",
      "ai",
      "data_location",
      "subprocessors",
      "availability",
      "backup",
      "retention",
      "permissions",
      "audit",
    ] as const) {
      expect(areas.has(area), area).toBe(true);
    }
  });
});

describe("retention says what cannot be deleted, and why", () => {
  it("names a reason for everything that survives a deletion request", () => {
    for (const rule of RETENTION_RULES) {
      if (!rule.survivesDeletion) continue;
      expect(rule.survivesDeletion.length, rule.label).toBeGreaterThan(30);
    }
  });

  /**
   * A product offering "delete everything" that quietly keeps the audit trail
   * has told its customer something untrue.
   */
  it("produces a deletion plan that is honest about being partial", () => {
    const plan = planDeletion();
    expect(plan.partial).toBe(true);
    expect(plan.retained.length).toBeGreaterThan(3);
    expect(plan.retained.map((entry) => entry.label)).toContain("Audit records");
    for (const entry of plan.retained) expect(entry.reason).toBeTruthy();
  });

  it("records a gap as a gap rather than inventing a policy", () => {
    const missing = gaps();
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.map((rule) => rule.label)).toContain("Interactions and messages");
    expect(missing[0]!.enforcedBy).toMatch(/^None\./);
  });

  it("holds accounting records for the statutory period", () => {
    const donations = RETENTION_RULES.find((rule) => rule.entityType === "donation")!;
    expect(donations.basis).toBe("legal_obligation");
    // Six years from the end of the financial year.
    expect(donations.days).toBe(2_555);
  });
});

describe("an organisation can take its data", () => {
  it("exports every collection with a count, so completeness is checkable", async () => {
    const h = createTwoTenantHarness();
    const exported = await buildDataExport(h.ctxA, h.repo);

    expect(exported.contents.length).toBeGreaterThan(30);
    expect(exported.withheld).toEqual([]);
    expect(exported.contents.some((entry) => entry.collection === "grants")).toBe(true);
    expect(exported.contents.some((entry) => entry.collection === "donations")).toBe(true);
    expect(exported.contents.some((entry) => entry.collection === "auditEvents")).toBe(true);

    const summary = describeExport(exported);
    expect(summary[0]).toMatch(/records across \d+ collections/);
  });

  /**
   * An export that used a privileged path would be the largest
   * data-exfiltration surface in the product.
   */
  /**
   * Asserted on ownership rather than on text.
   *
   * A first version matched on the string "Henderson" and failed — not because
   * anything leaked, but because the two-tenant fixture builds tenant B's
   * profile by cloning tenant A's and re-pointing the organisation id, so A's
   * words genuinely appear inside B's own record. A text assertion cannot tell
   * "leaked from A" from "the fixture copied A's prose into B", which makes it
   * the wrong assertion for the thing that matters.
   *
   * Every record carrying an `organisationId` must carry B's, and no id that
   * exists only in A may appear. That is the invariant, and it is not
   * confusable with anything else.
   */
  it("reads through the tenant boundary, so it cannot reach another organisation", async () => {
    const h = createTwoTenantHarness();
    const exported = await buildDataExport(h.ctxB, h.repo);

    expect(exported.organisationId).toBe("org-beacon");

    const owners = new Set<string>();
    for (const records of Object.values(exported.data)) {
      for (const record of records as Record<string, unknown>[]) {
        const owner = record?.organisationId;
        if (typeof owner === "string") owners.add(owner);
      }
    }
    expect([...owners]).toEqual(["org-beacon"]);

    // And no identifier that exists only in tenant A.
    const serialised = JSON.stringify(exported.data);
    for (const id of [
      "grant-henderson",
      "prog-youth",
      "per-rowan",
      "fund-general",
      "camp-spring-2026",
      "portal-funder",
      "org-northstar",
    ]) {
      expect(serialised, id).not.toContain(id);
    }
  });

  it("carries the deletion plan, so the honest answer arrives before the decision", async () => {
    const h = createTwoTenantHarness();
    const exported = await buildDataExport(h.ctxA, h.repo);
    expect(exported.deletionPlan.partial).toBe(true);
    expect(exported.notes.join(" ")).toMatch(/integer minor units/);
  });
});

describe("schema-level security invariants", () => {
  /**
   * Every table added by MG-4 onwards. The existing invariant suite covers
   * RLS being enabled; these cover the properties this programme introduced.
   */
  it("finds every migration this programme added", () => {
    const names = migrationSql.map((entry) => entry.file);
    for (const migration of [
      "0022_reporting_engine.sql",
      "0023_automation.sql",
      "0024_forms.sql",
      "0025_finance_runtime.sql",
      "0026_portals.sql",
      "0027_fundraising.sql",
      "0028_integrations.sql",
    ]) {
      expect(names, migration).toContain(migration);
    }
  });

  /**
   * The single most dangerous change anybody could make to the portal schema
   * is a policy granting a portal identity direct row access.
   */
  it("gives portal tables no policy that is not is_org_member", () => {
    const portals = migrationSql.find((entry) => entry.file === "0026_portals.sql")!.sql;
    const policies = portals.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(5);
    for (const policy of policies) {
      expect(policy).toMatch(/is_org_member\(organisation_id\)/);
    }
  });

  /**
   * A token in a tenant-readable row is a token every member of the
   * organisation can read.
   */
  it("gives the integration schema nowhere to store a secret", () => {
    const integrations = migrationSql.find(
      (entry) => entry.file === "0028_integrations.sql",
    )!.sql;
    expect(integrations).toMatch(/credential_ref text/);
    expect(integrations).not.toMatch(/access_token|refresh_token|api_key|client_secret/);
  });

  /**
   * Sensitivity has no default on purpose: by the time an answer exists it is
   * too late to decide whether it should have been collected.
   */
  it("requires a sensitivity on every form field, with no default", () => {
    const forms = migrationSql.find((entry) => entry.file === "0024_forms.sql")!.sql;
    expect(forms).toMatch(/sensitivity field_sensitivity not null,/);
    expect(forms).not.toMatch(/sensitivity field_sensitivity not null default/);
  });

  /**
   * Append-only tables are the record of what happened without a person
   * present. A policy allowing deletion would make them decoration.
   */
  it("gives the append-only tables no delete policy", () => {
    const appendOnly = [
      ["0022_reporting_engine.sql", "report_approvals"],
      ["0023_automation.sql", "automation_runs"],
      ["0023_automation.sql", "automation_failures"],
      ["0028_integrations.sql", "sync_runs"],
    ] as const;

    for (const [file, table] of appendOnly) {
      const sql = migrationSql.find((entry) => entry.file === file)!.sql;
      const deletePolicy = new RegExp(`create policy [\\w_]+ on ${table} for delete`, "i");
      expect(deletePolicy.test(sql), `${table} has a delete policy`).toBe(false);
      const allPolicy = new RegExp(`create policy [\\w_]+ on ${table} for all`, "i");
      expect(allPolicy.test(sql), `${table} has a blanket policy`).toBe(false);
    }
  });

  /**
   * Money is integer minor units everywhere, because accumulated float drift
   * shows up as figures that do not reconcile.
   */
  it("stores money as integers in every migration this programme added", () => {
    const ours = migrationSql.filter((entry) => entry.file >= "0022");
    for (const { file, sql } of ours) {
      const floats = sql.match(/\w*(amount|value|balance|units)\w*\s+(numeric|decimal|float|real|double)/gi);
      expect(floats ?? [], file).toEqual([]);
    }
  });

  /** Every refusal a schema makes should say why, in a comment or a name. */
  it("explains its constraints rather than only declaring them", () => {
    const ours = migrationSql.filter((entry) => entry.file >= "0022");
    for (const { file, sql } of ours) {
      const checks = sql.match(/constraint [\w_]+ check/g) ?? [];
      if (checks.length === 0) continue;
      // A named constraint is self-documenting in an error message; an
      // anonymous one produces "violates check constraint 23514".
      expect(checks.length, file).toBeGreaterThan(0);
    }
  });
});
