import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A throwaway Postgres carrying the real migrations.
 *
 * Row level security is the second half of tenant isolation and the only half
 * the application cannot get wrong on its own, so it is worth testing against
 * a database rather than reasoning about. These tests build one, apply every
 * migration, and drive it as the roles Supabase gives real callers.
 *
 * The `auth` schema is Supabase's. It is stubbed here because the policies
 * compile against `auth.uid()`, and the stub reads the same session setting
 * PostgREST sets -- so `set request.jwt.claim.sub` is exactly what a signed-in
 * request looks like to a policy.
 */

export const MIGRATIONS_DIR = "supabase/migrations";

export function postgresAvailable(): boolean {
  try {
    execFileSync("pg_isready", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function createDatabase(name: string): void {
  try {
    execFileSync("dropdb", ["--if-exists", name], { stdio: "ignore" });
  } catch {
    // Nothing to drop on a first run.
  }
  execFileSync("createdb", [name], { stdio: "ignore" });

  // Supabase grants table privileges to `anon` and `authenticated` and leaves
  // the row-level decision to RLS. Reproduced here, or every policy test would
  // pass for the wrong reason -- a permission error rather than an empty
  // result.
  run(
    name,
    `
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;
    -- Roles are cluster-wide, not per-database, so a second scratch database
    -- on the same server must not try to create them again.
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role;
      end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `,
  );

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()) {
    execFileSync(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-q", "-d", name, "-f", join(MIGRATIONS_DIR, file)],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  }

  // The mutation the isolation tests exist to survive. Setting this makes
  // `is_org_member` permissive, which must make every test in rls.test.ts fail
  // -- if any still passes, it was not testing isolation.
  if (process.env.PEGASUS_RLS_MUTATE === "1") {
    run(
      name,
      `create or replace function is_org_member(org uuid) returns boolean
         language sql security definer set search_path = public stable
         as $$ select true $$;`,
    );
  }
}

export function dropDatabase(name: string): void {
  try {
    execFileSync("dropdb", ["--if-exists", name], { stdio: "ignore" });
  } catch {
    // A leftover scratch database is not worth failing a test run over.
  }
}

/** Run SQL, returning nothing. Throws with the server's message on error. */
export function run(database: string, sql: string): void {
  execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", database], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "pipe"],
  });
}

/**
 * Run a query, returning rows of pipe-separated columns.
 *
 * `-q` matters: without it psql echoes a command tag for every statement, so
 * the `SET` lines that establish the session would arrive as result rows and
 * every assertion would read them instead of the answer.
 */
export function query(database: string, sql: string): string[][] {
  const out = execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-tAF|", "-d", database], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

/**
 * Run SQL expecting it to fail, and return the error.
 *
 * A refusal that this could not distinguish from success would make every
 * "cannot write across the boundary" assertion vacuous.
 */
export function expectFailure(database: string, sql: string): string {
  try {
    run(database, sql);
  } catch (error) {
    const err = error as { stderr?: Buffer | string };
    return String(err.stderr ?? error);
  }
  throw new Error("Expected the statement to be refused, but it succeeded.");
}

/**
 * Run SQL as a role, with a session that looks like a signed-in request.
 *
 * Wrapped in a transaction because `set local` only takes effect inside one --
 * outside, it warns and does nothing, which would leave every statement
 * running as the owner. RLS does not apply to a table's owner, so the tests
 * would all pass while proving the opposite of what they claim.
 */
export function asUser(userId: string, sql: string): string {
  return [
    "begin;",
    "set local role authenticated;",
    `set local request.jwt.claim.sub = '${userId}';`,
    sql,
    "rollback;",
  ].join("\n");
}

export function asAnon(sql: string): string {
  return ["begin;", "set local role anon;", sql, "rollback;"].join("\n");
}

export const ORG_A = "00000000-0000-0000-0000-00000000000a";
export const ORG_B = "00000000-0000-0000-0000-00000000000b";
export const USER_A = "00000000-0000-0000-0000-0000000000a1";
export const USER_B = "00000000-0000-0000-0000-0000000000b1";

/** Two organisations, one member each, and a programme apiece. */
export const TWO_TENANTS = `
  insert into organisations (id,name,legal_name,type,operating_regions,is_demo,ai_enabled) values
   ('${ORG_A}','Northstar','Northstar Ltd','charity','{}',false,true),
   ('${ORG_B}','Beacon','Beacon Ltd','charity','{}',false,true);
  insert into users (id,email,name) values
   ('${USER_A}','ann@northstar.test','Ann'),
   ('${USER_B}','ben@beacon.test','Ben');
  insert into organisation_members (organisation_id,user_id,role,status) values
   ('${ORG_A}','${USER_A}','owner','active'),
   ('${ORG_B}','${USER_B}','owner','active');
  insert into programmes (id,organisation_id,name,status,communities_served,activities,outputs,delivery_partners,risks) values
   ('00000000-0000-0000-0000-00000000000c','${ORG_A}','Northstar programme','active','{}','{}','{}','{}','{}'),
   ('00000000-0000-0000-0000-00000000000d','${ORG_B}','Beacon programme','active','{}','{}','{}','{}','{}');
`;
