import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Schema invariants.
 *
 * No Supabase project is provisioned, so these migrations cannot yet be applied
 * and verified against a live database. What *can* be verified now is that the
 * SQL says what it must say — which is exactly how audit finding S1 went
 * unnoticed: `0001_schema.sql` issues `enable row level security` 37 times for
 * 38 tables, and nothing in the build noticed the omission.
 *
 * These are not a substitute for the database-level RLS tests scheduled in
 * Slice C. They are the cheapest check that would have caught S1.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/** Tables created across every migration, in order. */
function createdTables(sql: string): string[] {
  return [...sql.matchAll(/create table (?:if not exists )?([a-z_]+)\s*\(/g)].map((m) => m[1]!);
}

function tablesWithRls(sql: string): Set<string> {
  return new Set(
    [...sql.matchAll(/alter table ([a-z_]+) enable row level security/g)].map((m) => m[1]!),
  );
}

describe("schema invariants", () => {
  const sql = allSql();

  it("finds the migrations", () => {
    expect(createdTables(sql).length).toBeGreaterThan(30);
  });

  /**
   * Audit S1, critical. The `users_self_select` / `users_self_update` policies
   * are inert without this, leaving the table readable and updatable by any
   * authenticated client the moment Supabase is connected.
   */
  it("row level security is enabled on `users`", () => {
    expect(tablesWithRls(sql).has("users")).toBe(true);
  });

  it("every created table enables row level security", () => {
    const withRls = tablesWithRls(sql);
    const missing = createdTables(sql).filter((t) => !withRls.has(t));
    expect(missing).toEqual([]);
  });

  it("`activity_events` exists, so activity is not lost on migration", () => {
    // Audit §6: the entity was written by the repository with no table behind it.
    expect(createdTables(sql)).toContain("activity_events");
  });

  it("the knowledge tables exist and are tenant-owned", () => {
    const tables = createdTables(sql);
    for (const t of ["claims", "claim_sources", "claim_supports", "claim_usages", "claim_conflicts"]) {
      expect(tables).toContain(t);
    }
    // Every knowledge table carries the tenant key the RLS helpers are built on.
    const knowledge = sql.slice(sql.indexOf("create table claims"));
    expect(knowledge).toMatch(/organisation_id uuid not null references organisations/);
  });

  it("a verified claim cannot exist without an actor and a timestamp", () => {
    expect(sql).toMatch(/claims_verified_needs_actor/);
  });

  it("claims are immutable at the database level, not merely by convention", () => {
    expect(sql).toMatch(/claims_reject_value_mutation/);
    expect(sql).toMatch(/Claims are immutable/);
  });

  /**
   * MG-1. These assert the constraints that make the Mission Graph's new
   * tables *load-bearing* rather than merely present — the ones whose absence
   * would let the schema exist while the guarantee it exists for does not.
   */
  describe("Mission Graph (MG-1)", () => {
    const tables = createdTables(sql);

    it("the graph, money, requirement and strategy tables exist", () => {
      for (const t of [
        "relations",
        "funds",
        "financial_transactions",
        "financial_allocations",
        "budgets",
        "budget_lines",
        "reporting_requirements",
        "strategic_priorities",
      ]) {
        expect(tables).toContain(t);
      }
    });

    it("an allocation cannot be recorded without saying how it was made", () => {
      // The schema-level counterpart of `UnitCost` being unconstructable
      // without a `Methodology`. A figure whose apportionment cannot be
      // explained is what makes cost-per-outcome indefensible.
      const allocations = sql.slice(sql.indexOf("create table if not exists financial_allocations"));
      expect(allocations).toMatch(/allocation_method allocation_method not null/);
    });

    it("an allocation must attribute money to something", () => {
      expect(sql).toMatch(/financial_allocations_needs_a_target/);
    });

    it("a restricted fund must state what it is restricted to", () => {
      // A restricted fund without a purpose cannot be reported against, which
      // is the only reason to distinguish it from an unrestricted one.
      expect(sql).toMatch(/funds_restricted_needs_purpose/);
    });

    it("money is stored as integer minor units, never as a float", () => {
      expect(sql).toMatch(/amount_minor_units bigint not null/);
      expect(sql).toMatch(/planned_amount_minor_units bigint not null/);
      // No money column may be a floating-point type.
      expect(sql).not.toMatch(/(amount|value)_[a-z_]*\s+(real|double precision|float)/);
    });

    it("a relation cannot join an entity to itself", () => {
      expect(sql).toMatch(/relations_no_self_loop/);
    });

    it("a contribution weight cannot exceed the whole", () => {
      const relations = sql.slice(sql.indexOf("create table if not exists relations"));
      expect(relations).toMatch(/weight >= 0 and weight <= 1/);
    });

    it("a reporting requirement belongs to exactly one owner", () => {
      // Attached to neither, it is unreachable; attached to both, it is
      // ambiguous about who is owed the report.
      expect(sql).toMatch(/reporting_requirements_one_owner/);
    });

    it("both new statement kinds are added to the claim_kind enum", () => {
      expect(sql).toMatch(/alter type claim_kind add value if not exists 'inference'/);
      expect(sql).toMatch(/alter type claim_kind add value if not exists 'hypothesis'/);
    });
  });

  /**
   * MG-3. The review boundary is the whole point of onboarding intelligence,
   * so the constraints that hold it are asserted here rather than trusted to
   * the application layer alone.
   */
  describe("onboarding and documents (MG-3)", () => {
    const tables = createdTables(sql);

    it("the document and onboarding tables exist", () => {
      for (const t of [
        "documents",
        "document_versions",
        "document_sources",
        "extracted_claims",
        "onboarding_runs",
        "research_sources",
        "profile_candidates",
        "candidate_decisions",
      ]) {
        expect(tables).toContain(t);
      }
    });

    it("an extracted candidate can never be stored as verified", () => {
      // The database counterpart of `assertProducerMayAssign`. Extraction
      // cannot mint organisational truth however confident it is, and this
      // holds even if a future call site forgets.
      expect(sql).toMatch(/profile_candidates_never_self_verified/);
      const candidates = sql.slice(sql.indexOf("create table if not exists profile_candidates"));
      expect(candidates).toMatch(/verification in \('ai_extracted', 'needs_review', 'outdated'\)/);
    });

    it("an approved extraction must point at the claim it became", () => {
      expect(sql).toMatch(/extracted_claims_approved_has_claim/);
    });

    it("a candidate may only be decided once", () => {
      expect(sql).toMatch(/candidate_decisions_one_per_candidate_idx/);
    });

    it("an edit decision must carry the edited value", () => {
      expect(sql).toMatch(/candidate_decisions_edit_has_value/);
    });

    it("identical bytes cannot become a second document version", () => {
      // Without this the review queue doubles every time someone re-uploads
      // the same annual report.
      expect(sql).toMatch(/document_versions_hash_idx/);
    });

    it("a document declares whether it names individuals", () => {
      // Documents are the most likely route for beneficiary data to enter the
      // product, so the field is not optional.
      const documents = sql.slice(sql.indexOf("create table if not exists documents"));
      expect(documents).toMatch(/contains_personal_data boolean not null default false/);
    });

    it("a parse status is five-valued, so an unread document is distinguishable", () => {
      expect(sql).toMatch(
        /create type document_parse_status as enum \(\s*'pending', 'parsed', 'unreadable', 'unsupported_format', 'failed'\s*\)/,
      );
    });
  });
});
