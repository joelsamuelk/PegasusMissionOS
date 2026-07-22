import { describe, expect, it } from "vitest";
import { can, capabilitiesFor } from "@/lib/permissions";

describe("permissions", () => {
  it("gives the owner every capability", () => {
    expect(can("owner", "org:transfer_ownership")).toBe(true);
    expect(can("owner", "grants:manage")).toBe(true);
  });

  it("prevents administrators from transferring ownership or billing", () => {
    expect(can("administrator", "org:transfer_ownership")).toBe(false);
    expect(can("administrator", "org:manage_billing")).toBe(false);
    expect(can("administrator", "applications:manage")).toBe(true);
  });

  it("limits the funding lead to funding-related capabilities", () => {
    expect(can("funding_lead", "funding:manage")).toBe(true);
    expect(can("funding_lead", "programmes:manage")).toBe(false);
  });

  it("gives the trustee reviewer review and approval, not editing", () => {
    expect(can("trustee_reviewer", "applications:approve")).toBe(true);
    expect(can("trustee_reviewer", "reports:approve")).toBe(true);
    expect(can("trustee_reviewer", "funding:manage")).toBe(false);
  });

  it("restricts contributors to a small set", () => {
    expect(can("contributor", "evidence:manage")).toBe(true);
    expect(can("contributor", "grants:manage")).toBe(false);
    expect(capabilitiesFor("contributor")).toContain("read");
  });

  it("every role can read", () => {
    for (const role of ["owner", "administrator", "funding_lead", "programme_lead", "finance_contributor", "trustee_reviewer", "contributor"] as const) {
      expect(can(role, "read")).toBe(true);
    }
  });
});
