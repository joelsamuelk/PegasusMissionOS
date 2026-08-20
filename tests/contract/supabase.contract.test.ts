import { describe, it } from "vitest";

import { describeRepositoryContract } from "./repository-contract";
import {
  contractDatabaseConfigured,
  createSupabaseContractHarness,
} from "./supabase-fixtures";

/**
 * The Supabase adapter against the shared contract.
 *
 * The in-memory run is the reference: a failure there means the contract is
 * wrong. A failure here means the adapter is, and the two must agree -- which
 * is the entire reason the suite is shared rather than duplicated. A missing
 * `.eq('organisation_id', …)` leaks in a way an in-memory `scoped()` cannot,
 * and no amount of reading the code catches that as reliably as running the
 * same assertions against both.
 *
 * It runs with the **service role**, which bypasses row level security. That
 * is deliberate: with RLS out of the way the only thing scoping a read is the
 * adapter's own filter, so a missing predicate leaks here instead of being
 * masked by a policy. The policies are tested separately, against SQL, in
 * tests/database, and the two layers are tested together in rls-mutation.
 *
 * It needs a real database, so it is gated on PEGASUS_CONTRACT_DB=1 rather
 * than on credentials being present: seeding somebody's project because their
 * `.env` happened to be loaded would be a nasty surprise. To run it:
 *
 *   PEGASUS_CONTRACT_DB=1 npx vitest run tests/contract
 *
 * against a database with every migration applied. It seeds two organisations
 * with fixed ids, runs, and removes them again.
 */

if (contractDatabaseConfigured()) {
  describeRepositoryContract("supabase", () => createSupabaseContractHarness());
} else {
  describe("repository contract: supabase", () => {
    it.skip(
      "needs a database. Run with PEGASUS_CONTRACT_DB=1 against a migrated project.",
      () => {},
    );
  });
}
