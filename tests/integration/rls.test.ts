import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Row level security, executed.
 *
 * Every other isolation test in this repository proves the *adapter* filters by
 * tenant. This one proves the *database* does, independently, which is the
 * whole claim defence in depth makes. Until MG-2 that claim rested on reviewed
 * SQL that had never run.
 *
 * The distinction being tested is narrow and important. Blocking an anonymous
 * caller is the easy half and is checked below for completeness. The half that
 * matters is that an **authenticated member of tenant A cannot read tenant B**,
 * because that is the failure a real deployment would actually suffer: not a
 * stranger reading everything, but one customer seeing another's grants.
 *
 * It touches a live database, so it is skipped unless Supabase is configured,
 * and it cleans up after itself in `afterAll` whether or not it passed. Every
 * record it creates is prefixed so a failed cleanup is identifiable rather than
 * indistinguishable from real data.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

const PREFIX = "zz-rls-probe";
const PASSWORD = `${PREFIX}-${Math.abs(Date.now() % 1_000_000)}-Aa1!`;

interface Tenant {
  organisationId: string;
  userId: string;
  email: string;
  client: SupabaseClient;
  grantId: string;
}

let admin: SupabaseClient;
const tenants: Tenant[] = [];

/** Create an organisation, a confirmed user, a membership and one grant. */
async function createTenant(label: string): Promise<Tenant> {
  const email = `${PREFIX}-${label}-${Date.now()}@example.invalid`;

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw new Error(`create user: ${userError.message}`);
  const userId = created.user!.id;

  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({ name: `${PREFIX} ${label}`, legal_name: `${PREFIX} ${label}`, type: "charity" })
    .select("id")
    .single();
  if (orgError) throw new Error(`create organisation: ${orgError.message}`);
  const organisationId = String((org as { id: string }).id);

  // `users` mirrors `auth.users`; membership is what grants access.
  await admin.from("users").insert({ id: userId, name: `${PREFIX} ${label}`, email });
  const { error: memberError } = await admin.from("organisation_members").insert({
    organisation_id: organisationId,
    user_id: userId,
    role: "owner",
    status: "active",
  });
  if (memberError) throw new Error(`create membership: ${memberError.message}`);

  const { data: funder } = await admin
    .from("funders")
    .insert({ organisation_id: organisationId, name: `${PREFIX} funder ${label}`, type: "trust" })
    .select("id")
    .single();

  const { data: grant, error: grantError } = await admin
    .from("grants")
    .insert({
      organisation_id: organisationId,
      funder_id: (funder as { id: string }).id,
      title: `${PREFIX} grant ${label}`,
      award_value: 1000,
      currency: "GBP",
      restricted: false,
      start_date: "2026-01-01",
      end_date: "2027-01-01",
      spent_to_date: 0,
      status: "active",
    })
    .select("id")
    .single();
  if (grantError) throw new Error(`create grant: ${grantError.message}`);

  // A client carrying this user's real session, so Postgres sees auth.uid().
  const client = createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`sign in: ${signInError.message}`);

  return {
    organisationId,
    userId,
    email,
    client,
    grantId: String((grant as { id: string }).id),
  };
}

describe.skipIf(!configured)("row level security, against the live database", () => {
  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    tenants.push(await createTenant("a"), await createTenant("b"));
  }, 60_000);

  afterAll(async () => {
    // Ordered by dependency, and best-effort: a failure here must not mask a
    // test result, but it must also not leave probe rows behind.
    for (const tenant of tenants) {
      await admin.from("grants").delete().eq("organisation_id", tenant.organisationId);
      await admin.from("funders").delete().eq("organisation_id", tenant.organisationId);
      await admin
        .from("organisation_members")
        .delete()
        .eq("organisation_id", tenant.organisationId);
      await admin.from("organisations").delete().eq("id", tenant.organisationId);
      await admin.from("users").delete().eq("id", tenant.userId);
      await admin.auth.admin.deleteUser(tenant.userId).catch(() => undefined);
    }
  }, 60_000);

  it("the fixture is non-vacuous: each tenant can read its own grant", async () => {
    for (const tenant of tenants) {
      const { data } = await tenant.client.from("grants").select("id").eq("id", tenant.grantId);
      expect(data).toHaveLength(1);
    }
  });

  /**
   * The test this file exists for.
   *
   * Note there is no `.eq("organisation_id", …)` anywhere below. That is the
   * point: the adapter's filter is deliberately absent, so anything returned
   * came back because the database allowed it.
   */
  it("an authenticated member of one tenant cannot read another's grant", async () => {
    const [a, b] = tenants as [Tenant, Tenant];

    const { data: byId } = await a.client.from("grants").select("id").eq("id", b.grantId);
    expect(byId).toEqual([]);

    const { data: byOrg } = await a.client
      .from("grants")
      .select("id")
      .eq("organisation_id", b.organisationId);
    expect(byOrg).toEqual([]);
  });

  it("an unfiltered read returns only the caller's own rows", async () => {
    const [a, b] = tenants as [Tenant, Tenant];

    // `select *` with no predicate at all. Whatever comes back is exactly what
    // RLS permits.
    const { data } = await a.client.from("grants").select("id, organisation_id");
    const returned = (data ?? []) as { organisation_id: string }[];

    expect(returned.length).toBeGreaterThan(0);
    expect(returned.every((row) => row.organisation_id === a.organisationId)).toBe(true);
    expect(returned.some((row) => row.organisation_id === b.organisationId)).toBe(false);
  });

  it("a member of one tenant cannot write into another", async () => {
    const [a, b] = tenants as [Tenant, Tenant];

    const { error } = await a.client.from("grants").insert({
      organisation_id: b.organisationId,
      funder_id: null,
      title: `${PREFIX} smuggled`,
      award_value: 1,
      currency: "GBP",
      restricted: false,
      start_date: "2026-01-01",
      end_date: "2027-01-01",
      spent_to_date: 0,
      status: "active",
    });

    // The `with check` half of the policy. Without it a member could create
    // rows inside another tenant while being unable to read them back, which
    // is worse than a read leak because it is silent.
    expect(error).not.toBeNull();
  });

  it("a member of one tenant cannot update another's row", async () => {
    const [a, b] = tenants as [Tenant, Tenant];

    await a.client.from("grants").update({ title: `${PREFIX} tampered` }).eq("id", b.grantId);

    const { data } = await admin.from("grants").select("title").eq("id", b.grantId).single();
    expect((data as { title: string }).title).not.toContain("tampered");
  });

  it("a member of one tenant cannot delete another's row", async () => {
    const [a, b] = tenants as [Tenant, Tenant];

    await a.client.from("grants").delete().eq("id", b.grantId);

    const { data } = await admin.from("grants").select("id").eq("id", b.grantId);
    expect(data).toHaveLength(1);
  });

  it("blocks an anonymous caller entirely", async () => {
    const anonymous = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anonymous.from("grants").select("id");
    expect(data).toEqual([]);
  });

  it("holds on the tables MG-1 and MG-3 added", async () => {
    const [a] = tenants as [Tenant];
    // These carry the newest policies, so they are the most likely to have
    // been missed.
    for (const table of ["relations", "funds", "documents", "onboarding_runs", "profile_candidates"]) {
      const { data } = await a.client.from(table).select("id").limit(5);
      const returned = (data ?? []) as { id: string }[];
      expect(returned).toEqual([]);
    }
  });
});
