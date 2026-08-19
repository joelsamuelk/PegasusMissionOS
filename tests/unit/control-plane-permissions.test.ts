import { describe, expect, it } from "vitest";
import {
  canControl,
  controlCapabilitiesFor,
  requireControlCapability,
} from "@/lib/control-plane/permissions";
import { activeSupportSession, createControlRequestContext } from "@/server/control-plane/context";
import { createInternalAuditEvent } from "@/server/control-plane/audit";

const now = new Date("2026-08-19T10:00:00Z");

describe("Control Plane authorisation boundary", () => {
  it("maps roles to capabilities without role checks at call sites", () => {
    expect(canControl("sales", "prospect:update")).toBe(true);
    expect(canControl("sales", "billing:manage")).toBe(false);
    expect(canControl("support", "support:read_customer_data")).toBe(true);
    expect(canControl("support", "support:elevated_access")).toBe(false);
    expect(controlCapabilitiesFor("super_admin")).toContain("audit:view");
  });

  it("fails closed when a capability is absent", () => {
    expect(() => requireControlCapability("read_only", "organisation:create")).toThrow(
      "lacks required capability",
    );
  });

  it("accepts only an active support session for the exact organisation", () => {
    const ctx = createControlRequestContext({
      internalUserId: "internal-1",
      role: "support",
      requestId: "request-1",
      now: () => now,
      supportSession: {
        id: "session-1",
        organisationId: "org-a",
        scope: "read_only",
        expiresAt: new Date("2026-08-19T10:05:00Z"),
      },
    });
    expect(activeSupportSession(ctx, "org-a")?.id).toBe("session-1");
    expect(activeSupportSession(ctx, "org-b")).toBeNull();
  });

  it("rejects support sessions at their expiry boundary", () => {
    const ctx = createControlRequestContext({
      internalUserId: "internal-1",
      role: "support",
      requestId: "request-1",
      now: () => now,
      supportSession: {
        id: "session-1",
        organisationId: "org-a",
        scope: "read_only",
        expiresAt: now,
      },
    });
    expect(activeSupportSession(ctx, "org-a")).toBeNull();
  });

  it("requires reasons and carries request/support correlation into audit", () => {
    const ctx = createControlRequestContext({
      internalUserId: "internal-1",
      role: "operations",
      requestId: "request-7",
      now: () => now,
    });
    expect(() =>
      createInternalAuditEvent(ctx, {
        action: "organisation.suspend",
        targetType: "organisation",
        targetId: "org-a",
      }),
    ).toThrow("Audit reason is required");

    expect(
      createInternalAuditEvent(ctx, {
        action: "organisation.suspend",
        targetType: "organisation",
        targetId: "org-a",
        reason: "Confirmed policy breach",
      }),
    ).toMatchObject({ actorId: "internal-1", requestId: "request-7" });
  });
});
