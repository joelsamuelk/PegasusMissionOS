import { describe, expect, it } from "vitest";
import {
  arrayFrom,
  auditFrom,
  baseFrom,
  numberFrom,
  optionalNumberFrom,
  toCamel,
  toColumns,
  toSnake,
} from "@/server/data/supabase/mapping";

/**
 * The Postgres↔domain mapping.
 *
 * No Supabase project is provisioned, so the adapter's queries cannot be run.
 * The mapping is the part that can be tested without one, and it is also where
 * the quiet defects live: a `numeric` that arrives as a string, a date that
 * gets shifted by a timezone, an audit column that lands as a flat field.
 */
describe("case conversion", () => {
  it("round-trips the column names the schema actually uses", () => {
    const cases: [string, string][] = [
      ["organisation_id", "organisationId"],
      ["max_award", "maxAward"],
      ["funding_duration_months", "fundingDurationMonths"],
      ["eligible_org_types", "eligibleOrgTypes"],
      ["last_verified_at", "lastVerifiedAt"],
    ];
    for (const [snake, camel] of cases) {
      expect(toCamel(snake)).toBe(camel);
      expect(toSnake(camel)).toBe(snake);
    }
  });

  it("handles a digit after the underscore", () => {
    // `is_demo`-style names are easy; `line_1` is where a naive regex fails.
    expect(toCamel("line_1")).toBe("line1");
  });
});

describe("numeric parsing", () => {
  it("accepts a number", () => {
    expect(numberFrom(95000)).toBe(95000);
  });

  it("accepts the string PostgREST returns for large numerics", () => {
    // This is the real failure: a string award silently becomes NaN, and a NaN
    // propagates through every total that touches it.
    expect(numberFrom("95000")).toBe(95000);
    expect(numberFrom("95000.50")).toBe(95000.5);
  });

  it("falls back rather than producing NaN", () => {
    expect(numberFrom("not a number")).toBe(0);
    expect(numberFrom(null)).toBe(0);
    expect(numberFrom(undefined, -1)).toBe(-1);
  });

  it("distinguishes absent from zero", () => {
    // A nullable award is not the same as an award of nothing.
    expect(optionalNumberFrom(null)).toBeUndefined();
    expect(optionalNumberFrom(undefined)).toBeUndefined();
    expect(optionalNumberFrom(0)).toBe(0);
    expect(optionalNumberFrom("0")).toBe(0);
  });
});

describe("array columns", () => {
  it("maps text[] and treats null as empty", () => {
    expect(arrayFrom(["a", "b"])).toEqual(["a", "b"]);
    expect(arrayFrom(null)).toEqual([]);
    expect(arrayFrom(undefined)).toEqual([]);
  });
});

describe("audit columns", () => {
  it("collapses the four columns into the nested stamp", () => {
    const audit = auditFrom({
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
      created_by: "user-1",
      archived_at: null,
    });
    expect(audit).toEqual({
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      createdBy: "user-1",
      archivedAt: null,
    });
  });

  it("falls back to created_at when a row has never been updated", () => {
    const audit = auditFrom({ created_at: "2026-01-01T00:00:00Z", archived_at: null });
    expect(audit.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("keeps audit columns off the entity itself", () => {
    const mapped = baseFrom({
      id: "opp-1",
      organisation_id: "org-1",
      max_award: 50000,
      created_at: "2026-01-01T00:00:00Z",
      archived_at: null,
    });
    expect(mapped).toMatchObject({ id: "opp-1", organisationId: "org-1", maxAward: 50000 });
    expect(mapped).not.toHaveProperty("createdAt");
    expect(mapped.audit.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("preserves a date column as a plain string", () => {
    // Converting to Date and back shifts a `date` by a day in any timezone west
    // of UTC, which moves funder deadlines.
    const mapped = baseFrom({ deadline: "2026-09-28", created_at: "x", archived_at: null });
    expect(mapped).toMatchObject({ deadline: "2026-09-28" });
  });
});

describe("building write payloads", () => {
  it("converts to column names and drops undefined", () => {
    expect(toColumns({ maxAward: 100, nextAction: undefined, saved: false })).toEqual({
      max_award: 100,
      saved: false,
    });
  });

  it("keeps null, which clears a column", () => {
    // `undefined` means "leave alone"; `null` means "set to null". Collapsing
    // the two would make it impossible to clear a field.
    expect(toColumns({ nextAction: null })).toEqual({ next_action: null });
  });
});
