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
});
