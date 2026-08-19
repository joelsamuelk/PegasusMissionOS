import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0016_commercial_pilot_calibration.sql"),
  "utf8",
);
describe("commercial pilot schema", () => {
  it("caps pilot volume", () => {
    expect(sql).toContain("candidate_limit between 1 and 25");
    expect(sql).toContain("recommendation_limit between 1 and 10");
  });
  it("requires rejection reasons", () =>
    expect(sql).toContain("disposition='reject' and cardinality(rejection_reasons)>0"));
  it("preserves reasoning snapshots", () => {
    expect(sql).toContain("provider_versions jsonb not null");
    expect(sql).toContain("query_snapshot jsonb not null");
    expect(sql).toContain("system_reasons jsonb not null");
  });
  it("approval-gates calibration changes", () =>
    expect(sql).toContain("proposed','approved','rejected','implemented"));
});
