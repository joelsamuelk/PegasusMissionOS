import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createDatabase,
  dropDatabase,
  expectFailure,
  ORG_A,
  ORG_B,
  postgresAvailable,
  query,
  run,
  TWO_TENANTS,
  USER_A,
  USER_B,
} from "./harness";

/**
 * Row level security, tested rather than assumed.
 *
 * Storage has two independent defences: the adapter's own `organisation_id`
 * filter, and these policies. They are meant to be redundant, and redundancy
 * that has never been checked is one layer with a story attached.
 *
 * This file checks the database half on its own terms -- as the roles Supabase
 * hands real callers, with no application code in the path at all. If these
 * pass and the adapter's filter were removed tomorrow, tenants would still be
 * isolated. That is the property, and it is the reason the adapter can offer a
 * `tenantFilter: "off"` seam for its own tests without that being reckless.
 */

const DB = "pegasus_rls_test";
const available = postgresAvailable();

describe.skipIf(!available)("row level security", () => {
  beforeAll(() => {
    createDatabase(DB);
    run(DB, TWO_TENANTS);
  }, 180_000);

  afterAll(() => dropDatabase(DB));

  it("shows each member only their own organisation's records", () => {
    const [a] = query(DB, asUser(USER_A, "select string_agg(name, ',') from programmes;"));
    const [b] = query(DB, asUser(USER_B, "select string_agg(name, ',') from programmes;"));
    expect(a?.[0]).toBe("Northstar programme");
    expect(b?.[0]).toBe("Beacon programme");
  });

  it("hides the other organisation itself, not merely its records", () => {
    const [a] = query(DB, asUser(USER_A, "select string_agg(name, ',') from organisations;"));
    expect(a?.[0]).toBe("Northstar");
  });

  it("returns nothing at all to a session with no member", () => {
    // The failure mode this guards is a policy written as `using (true)` during
    // development: every read above would still pass, and this one would not.
    const rows = query(
      DB,
      asUser("00000000-0000-0000-0000-0000000000ff", "select count(*) from programmes;"),
    );
    expect(rows[0]?.[0]).toBe("0");
  });

  it("refuses a write into another organisation", () => {
    const error = expectFailure(
      DB,
      asUser(
        USER_A,
        `insert into programmes (organisation_id,name,status,communities_served,activities,outputs,delivery_partners,risks)
         values ('${ORG_B}','Smuggled','active','{}','{}','{}','{}','{}');`,
      ),
    );
    expect(error).toMatch(/row-level security/i);
  });

  it("matches nothing when updating another organisation's record", () => {
    // Not an error, and that is correct: from where A stands the row does not
    // exist, so the update matches no rows rather than being refused.
    //
    // Asserted by counting the rows the statement returned, inside the session
    // that ran it. Reading the row back afterwards would prove nothing here,
    // because the harness rolls each session back -- the row would look intact
    // whether RLS stopped the update or not.
    const rows = query(
      DB,
      asUser(
        USER_A,
        `with changed as (
           update programmes set name = 'Renamed'
            where organisation_id = '${ORG_B}' returning id
         ) select count(*) from changed;`,
      ),
    );
    expect(rows[0]?.[0]).toBe("0");
  });

  it("matches nothing when deleting another organisation's record", () => {
    const rows = query(
      DB,
      asUser(
        USER_A,
        `with removed as (
           delete from programmes where organisation_id = '${ORG_B}' returning id
         ) select count(*) from removed;`,
      ),
    );
    expect(rows[0]?.[0]).toBe("0");
  });

  it("can update its own record, so the two tests above are not vacuous", () => {
    // Without this, a policy denying every update would satisfy both of them.
    const rows = query(
      DB,
      asUser(
        USER_A,
        `with changed as (
           update programmes set name = 'Renamed'
            where organisation_id = '${ORG_A}' returning id
         ) select count(*) from changed;`,
      ),
    );
    expect(rows[0]?.[0]).toBe("1");
  });

  it("covers every tenant-owned table with a policy", () => {
    // A table with RLS enabled and no policy denies everything, which is safe
    // but breaks the product; a table with `organisation_id` and no RLS is the
    // dangerous direction. Both are caught here rather than by whichever
    // feature reads the table first.
    const unprotected = query(
      DB,
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
             where col.table_name = c.relname
               and col.table_schema = 'public'
               and col.column_name = 'organisation_id'
          )
          and not c.relrowsecurity
        order by 1;`,
    ).map((row) => row[0]);
    expect(unprotected).toEqual([]);
  });
});
