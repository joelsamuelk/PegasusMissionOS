import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  HAS_CREATED_BY,
  HAS_UPDATED_AT,
  HAS_UPDATED_BY,
} from "@/server/data/supabase/audit-columns";

/**
 * `audit-columns.ts` must not drift from the migrations.
 *
 * The Supabase write layer consults it to decide whether to stamp
 * `created_by`, `updated_by` and `updated_at`, because only 30 of 160 tables
 * have the first and only 4 have the second. If a migration adds a table with
 * audit columns and this file is not regenerated, writes to it silently lose
 * their attribution -- the insert succeeds, the row is anonymous, and nothing
 * reports a fault. That is exactly the failure the audit trail exists to
 * prevent.
 *
 * The check runs the generator against a throwaway Postgres. Where Postgres is
 * not available -- CI without a database service, a fresh checkout -- it
 * cannot run, and it says so rather than passing quietly.
 */

function postgresAvailable(): boolean {
  try {
    execFileSync("pg_isready", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const available = postgresAvailable();

describe.skipIf(!available)("audit-columns.ts matches the migrations", () => {
  it("regenerates identically", () => {
    const before = readFileSync("src/server/data/supabase/audit-columns.ts", "utf8");
    execFileSync("node", ["scripts/generate-audit-columns.mjs"], { stdio: "pipe" });
    const after = readFileSync("src/server/data/supabase/audit-columns.ts", "utf8");
    expect(
      after,
      "audit-columns.ts is stale. Run: npm run generate:audit-columns",
    ).toBe(before);
  }, 120_000);
});

describe("the audit column sets", () => {
  it("are a subset relationship, not three unrelated lists", () => {
    // Every table with `updated_by` must have `updated_at`: attribution
    // without a time is not an audit record. The reverse does not hold --
    // plenty of tables record when without recording who.
    for (const table of HAS_UPDATED_BY) {
      expect(HAS_UPDATED_AT.has(table), `${table} has updated_by but no updated_at`).toBe(true);
    }
  });

  it("is not empty, which would silently disable all stamping", () => {
    // A generator failure that produced empty sets would make every write
    // anonymous without any error, so the shape is asserted rather than
    // assumed.
    expect(HAS_CREATED_BY.size).toBeGreaterThan(20);
    expect(HAS_UPDATED_AT.size).toBeGreaterThan(50);
  });
});
