import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createRequestContext } from "@/server/context/request-context";
import { createSupabaseRepository } from "@/server/data/supabase/adapter";
import {
  contractDatabaseConfigured,
  contractUsers,
  removeAuthUsers,
  seedAuthUsers,
  seedContractTenants,
  serviceClient,
  signedInClient,
  teardown,
} from "./supabase-fixtures";

/**
 * The mutation this phase is judged by.
 *
 * Storage is scoped twice: by the adapter's own `organisation_id` filter, and
 * by row level security. The claim is that these are independent. The only way
 * to test an independent second layer is to remove the first one and see
 * whether isolation survives.
 *
 * So the adapter is constructed with `tenantFilter: "off"` -- every query it
 * builds carries no organisation predicate at all -- against a client holding
 * a **real signed-in session** rather than a service-role key. Service role
 * bypasses RLS, so running this with it would remove both layers at once and
 * prove the opposite of what it claims.
 *
 * If these pass, defence in depth exists. If they fail, the adapter's filter
 * was never a second line; it was the only one, and every tenant's data was
 * one missing `.eq()` away from another tenant's screen.
 *
 * Needs auth users, which it creates and deletes. Gated on
 * PEGASUS_CONTRACT_DB=1 like the rest of this directory.
 */

const configured = contractDatabaseConfigured();
const NOW = new Date("2026-07-21T10:00:00Z");

/** This file seeds its own tenants, in their own id namespace. */
const USERS = contractUsers("rls");

describe.skipIf(!configured)("row level security is the second layer", () => {
  let service: SupabaseClient;
  let asA: SupabaseClient;

  beforeAll(async () => {
    service = serviceClient();
    await seedContractTenants(service, "rls");
    await seedAuthUsers(service, "rls");
    asA = await signedInClient("a", "rls");
  }, 120_000);

  afterAll(async () => {
    await removeAuthUsers(service, "rls");
    await teardown(service, "rls");
  });

  const ctxA = () =>
    createRequestContext({
      organisationId: USERS.a.organisationId,
      userId: USERS.a.id,
      role: "owner",
      now: () => NOW,
    });

  /** The adapter with its own scoping removed. Nothing else may build this. */
  const unfiltered = () =>
    createSupabaseRepository(async () => asA, { tenantFilter: "off" });

  it("still lets the caller read their own records", async () => {
    // Without this the rest of the file passes against a broken connection.
    const repo = unfiltered();
    expect(await repo.funding.listOpportunities(ctxA())).not.toHaveLength(0);
  });

  it("returns only the caller's rows from a list with no adapter filter", async () => {
    const repo = unfiltered();
    for (const rows of [
      await repo.funding.listOpportunities(ctxA()),
      await repo.grants.list(ctxA()),
      await repo.evidence.list(ctxA()),
      await repo.claims.list(ctxA()),
      await repo.programmes.list(ctxA()),
    ]) {
      for (const row of rows) {
        expect(row.organisationId).toBe(USERS.a.organisationId);
      }
    }
  });

  it("resolves another tenant's id to null with no adapter filter", async () => {
    // The insecure-direct-object-reference case, with the application's own
    // defence switched off. The database has to be the thing that refuses.
    const repo = unfiltered();
    const foreignIds = await service
      .from("grants")
      .select("id")
      .eq("organisation_id", USERS.b.organisationId);
    const foreignGrantId = String((foreignIds.data ?? [])[0]?.id);
    expect(foreignGrantId).not.toBe("undefined");

    expect(await repo.grants.get(ctxA(), foreignGrantId)).toBeNull();
  });

  it("refuses a write into another tenant with no adapter filter", async () => {
    const repo = unfiltered();
    const before = await service
      .from("funding_opportunities")
      .select("stage")
      .eq("organisation_id", USERS.b.organisationId)
      .single();

    const foreign = await service
      .from("funding_opportunities")
      .select("id")
      .eq("organisation_id", USERS.b.organisationId)
      .single();

    await repo.funding.moveStage(ctxA(), String(foreign.data?.id), "successful");

    const after = await service
      .from("funding_opportunities")
      .select("stage")
      .eq("organisation_id", USERS.b.organisationId)
      .single();
    expect(after.data?.stage).toBe(before.data?.stage);
  });
});
