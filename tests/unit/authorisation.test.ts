import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemberRole } from "@/types/domain";
import { can, capabilitiesFor, type Capability } from "@/lib/permissions";

/**
 * Authorisation, asserted as a matrix rather than through the server actions.
 *
 * Server actions are `"use server"` modules that resolve a real request context,
 * so driving them from a unit test would test Next's action plumbing rather than
 * the rule. What matters here is the *mapping* — that each action's declared
 * capability produces the intended answer for each role — so the mapping is
 * declared once, next to the actions it describes, and asserted directly.
 *
 * The pairing is kept honest by `tests/unit/data-boundary.test.ts`, which fails
 * the build if a mutating action exists without an `authorise()` call.
 */

/** The capability each mutating action gates on. Mirrors `mutations.ts`. */
const ACTION_CAPABILITIES = {
  saveAnswer: "applications:manage",
  "setAnswerStatus (draft)": "applications:manage",
  "setAnswerStatus (approved)": "applications:approve",
  updateIndicator: "outcomes:manage",
  moveOpportunityStage: "funding:manage",
  toggleSavedOpportunity: "funding:manage",
  generateFitAssessment: "funding:manage",
  convertApplicationToGrant: "grants:manage",
  saveReportSection: "reports:manage",
  "setReportStatus (draft)": "reports:manage",
  "setReportStatus (approved)": "reports:approve",
  toggleTask: "read",
  setAiEnabled: "org:manage_settings",
  addEvidence: "evidence:manage",
  generateAnswer: "ai:use",
  generateReportSection: "ai:use",
  askCommand: "ai:use",
  summarisePipeline: "ai:use",
} satisfies Record<string, Capability>;

const ROLES: MemberRole[] = [
  "owner",
  "administrator",
  "funding_lead",
  "programme_lead",
  "finance_contributor",
  "trustee_reviewer",
  "contributor",
];

describe("every mutating action maps to a real capability", () => {
  it("names only capabilities the model defines", () => {
    const known = new Set(capabilitiesFor("owner"));
    for (const [action, capability] of Object.entries(ACTION_CAPABILITIES)) {
      expect(known.has(capability), `${action} → ${capability}`).toBe(true);
    }
  });

  it("an owner can perform every action", () => {
    for (const capability of Object.values(ACTION_CAPABILITIES)) {
      expect(can("owner", capability)).toBe(true);
    }
  });

  /**
   * The map above is a hand-maintained mirror of `mutations.ts`, so on its own
   * it drifts silently — a mutation test proved exactly that, by collapsing
   * `reports:approve` into `reports:manage` without failing anything.
   *
   * This reads the source and requires each capability to actually appear in
   * it. It is a coarse check, but it is the one that catches the class of
   * change the mirror cannot see: an action quietly gating on something weaker.
   */
  it("the mapping matches what the source actually gates on", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "server", "actions", "mutations.ts"),
      "utf8",
    );

    const missing = [...new Set(Object.values(ACTION_CAPABILITIES))]
      // `ai:use` is gated in ai.ts; `read` is asserted by the toggleTask case.
      .filter((capability) => capability !== "ai:use" && capability !== "read")
      .filter((capability) => !source.includes(`"${capability}"`));

    expect(missing).toEqual([]);
  });

  it("the AI actions gate on capability and the workspace setting", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "server", "actions", "ai.ts"),
      "utf8",
    );
    // One per entry point: answer, one/all report sections, command and pipeline.
    // A dropped gate reduces the count.
    expect((source.match(/authoriseAi\(\)/g) ?? []).length).toBe(5);

    // `authoriseAi` must check both. Gating on the capability alone would let a
    // workspace that turned AI off keep generating.
    const gate = readFileSync(
      join(process.cwd(), "src", "server", "actions", "authorise.ts"),
      "utf8",
    );
    expect(gate).toMatch(/authoriseAi/);
    expect(gate).toMatch(/aiEnabled/);
  });
});

/**
 * The case the capability model was built for.
 *
 * A trustee approves what the organisation produced without being able to
 * rewrite it. Collapsing approve into manage — the obvious simplification when
 * wiring these actions up — would silently hand trustees edit rights over
 * funder-facing material, which is the opposite of the governance intent.
 */
describe("trustee_reviewer: approve without edit", () => {
  it("may approve an application answer and an impact report", () => {
    expect(can("trustee_reviewer", "applications:approve")).toBe(true);
    expect(can("trustee_reviewer", "reports:approve")).toBe(true);
  });

  it("may not edit either", () => {
    expect(can("trustee_reviewer", "applications:manage")).toBe(false);
    expect(can("trustee_reviewer", "reports:manage")).toBe(false);
  });

  it("may not generate on the organisation's behalf", () => {
    // Reviewing is not authoring. A trustee producing AI drafts that other
    // people then treat as reviewed material inverts the control.
    expect(can("trustee_reviewer", "ai:use")).toBe(false);
  });

  it("may not change organisation settings or evidence", () => {
    expect(can("trustee_reviewer", "org:manage_settings")).toBe(false);
    expect(can("trustee_reviewer", "evidence:manage")).toBe(false);
  });

  it("may still complete a task on its own list", () => {
    expect(can("trustee_reviewer", "read")).toBe(true);
  });
});

describe("role boundaries that the actions now enforce", () => {
  it("a contributor cannot move funding or convert a grant", () => {
    expect(can("contributor", "funding:manage")).toBe(false);
    expect(can("contributor", "grants:manage")).toBe(false);
  });

  it("a programme lead cannot manage the funding pipeline", () => {
    expect(can("programme_lead", "funding:manage")).toBe(false);
    expect(can("programme_lead", "outcomes:manage")).toBe(true);
  });

  it("a funding lead cannot update outcome indicators", () => {
    expect(can("funding_lead", "outcomes:manage")).toBe(false);
    expect(can("funding_lead", "funding:manage")).toBe(true);
  });

  it("only owner and administrator change organisation settings", () => {
    const allowed = ROLES.filter((r) => can(r, "org:manage_settings"));
    expect(allowed).toEqual(["owner", "administrator"]);
  });

  it("a finance contributor cannot use AI or edit evidence", () => {
    expect(can("finance_contributor", "ai:use")).toBe(false);
    expect(can("finance_contributor", "evidence:manage")).toBe(false);
  });

  /**
   * Non-vacuity guard. Every assertion above is of the form "role X cannot do
   * Y"; if the matrix were empty they would all pass. This proves the roles
   * genuinely differ from one another.
   */
  it("roles hold materially different capability sets", () => {
    const sizes = ROLES.map((r) => capabilitiesFor(r).length);
    expect(new Set(sizes).size).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
  });
});
