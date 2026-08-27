import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/lib/config";
import { __resetRepository, describeRuntime, getRepository } from "@/server/data";

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
 *
 * That label is finally able to say "Supabase (live)" truthfully, so this file
 * asserts the branch rather than the absence of one -- as its previous version
 * asked to be updated to do.
 */

/** Run with configuration reporting a live Supabase project. */
function asConfigured<T>(run: () => T): T {
  const configured = vi.spyOn(appConfig, "isMockData", "get").mockReturnValue(false);
  __resetRepository();
  try {
    return run();
  } finally {
    configured.mockRestore();
    __resetRepository();
  }
}

describe("runtime descriptor", () => {
  it("reports the adapter that is genuinely serving requests", () => {
    expect(describeRuntime().source).toBe(getRepository().name);
  });

  it("serves the in-memory adapter when no project is configured", () => {
    expect(appConfig.isMockData).toBe(true);
    expect(getRepository().name).toBe("in-memory");
    expect(describeRuntime().label).not.toMatch(/supabase \(live\)/i);
  });

  it("serves the Supabase adapter when one is configured", () => {
    asConfigured(() => {
      expect(getRepository().name).toBe("supabase");
      expect(describeRuntime().source).toBe("supabase");
      expect(describeRuntime().label).toMatch(/supabase \(live\)/i);
    });
  });

  it("goes back to the in-memory adapter afterwards", () => {
    // The selection is memoised, so a test that changed it without resetting
    // would silently hand every later test a repository pointed at Postgres.
    expect(getRepository().name).toBe("in-memory");
  });

  it("explains the runtime rather than showing a bare label", () => {
    expect(describeRuntime().detail.length).toBeGreaterThan(20);
  });
});
