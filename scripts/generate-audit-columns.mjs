#!/usr/bin/env node
/**
 * Regenerate src/server/data/supabase/audit-columns.ts from the migrations.
 *
 * Applies every migration to a throwaway Postgres database and reads the
 * result, rather than parsing the SQL: the question is which columns exist
 * after all 28 migrations have run, and only Postgres can answer that.
 *
 * Requires a local Postgres. Usage: npm run generate:audit-columns
 */
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB = "pegasus_audit_columns_scratch";
const MIGRATIONS = "supabase/migrations";

const psql = (args, input) =>
  execFileSync("psql", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

try {
  execFileSync("dropdb", ["--if-exists", DB]);
  execFileSync("createdb", [DB]);

  // Supabase supplies the `auth` schema. Stub the parts the policies compile
  // against; nothing here is executed, only parsed.
  psql(["-q", "-d", DB], `
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;
    create role authenticated; create role anon; create role service_role;
  `);

  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    psql(["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-f", join(MIGRATIONS, file)]);
  }

  const tablesWith = (column) =>
    psql([
      "-d", DB, "-tAc",
      `select table_name from information_schema.columns where table_schema='public' ` +
        `and column_name='${column}' order by 1`,
    ])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const createdBy = tablesWith("created_by");
  const updatedBy = tablesWith("updated_by");
  const updatedAt = tablesWith("updated_at");
  const total = psql([
    "-d", DB, "-tAc",
    "select count(*) from information_schema.tables where table_schema='public'",
  ]).trim();

  const list = (names) => names.map((n) => `  "${n}",`).join("\n");

  writeFileSync(
    "src/server/data/supabase/audit-columns.ts",
    `/**
 * Which tables carry which audit columns.
 *
 * Audit stamping is not uniform: of ${total} tables, ${createdBy.length} have \`created_by\`,
 * ${updatedBy.length} have \`updated_by\` and ${updatedAt.length} have \`updated_at\`. Join tables,
 * append-only event tables and projections mostly have none. A write layer
 * that stamps every insert unconditionally fails on the majority of them, so
 * it has to ask.
 *
 * Generated from the migrations, not written by hand. To regenerate:
 *
 *   npm run generate:audit-columns
 *
 * tests/unit/audit-columns.test.ts fails if this file drifts from them.
 */

export const HAS_CREATED_BY: ReadonlySet<string> = new Set([
${list(createdBy)}
]);

export const HAS_UPDATED_BY: ReadonlySet<string> = new Set([
${list(updatedBy)}
]);

export const HAS_UPDATED_AT: ReadonlySet<string> = new Set([
${list(updatedAt)}
]);
`,
  );
  console.log(
    `audit-columns.ts: ${createdBy.length} created_by, ${updatedBy.length} updated_by, ` +
      `${updatedAt.length} updated_at, from ${total} tables`,
  );
} finally {
  try {
    execFileSync("dropdb", ["--if-exists", DB]);
  } catch {
    // The scratch database is disposable; failing to drop it is not an error
    // worth failing the generator over.
  }
}
