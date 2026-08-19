import { describe, expect, it } from "vitest";
import { describeRuntime, getRepository } from "@/server/data";

/**
 * Regression guard for a specific falsehood.
 *
 * The Settings page previously derived its "Data source" label from the mere
 * presence of Supabase environment variables:
 *
 *     label={appConfig.isMockData ? "In-memory demo data" : "Supabase (live)"}
 *
 * No code read Supabase, so setting those variables made the product claim a
 * database was serving requests when the in-memory store still was. The label
 * is now derived from the adapter actually in use, which cannot be wrong.
 */
describe("runtime descriptor", () => {
  it("reports the adapter that is genuinely serving requests", () => {
    const runtime = describeRuntime();
    expect(runtime.source).toBe(getRepository().name);
  });

  it("never claims Supabase is live while the in-memory adapter is serving", () => {
    const runtime = describeRuntime();

    // Today there is only one adapter. If a Supabase adapter is added and
    // selected, this test should be updated deliberately — not incidentally.
    expect(getRepository().name).toBe("in-memory");
    expect(runtime.source).toBe("in-memory");
    expect(runtime.label).not.toMatch(/supabase \(live\)/i);
  });

  it("explains the runtime rather than showing a bare label", () => {
    expect(describeRuntime().detail.length).toBeGreaterThan(20);
  });
});
