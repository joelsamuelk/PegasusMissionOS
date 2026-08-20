import { beforeEach, describe, expect, it } from "vitest";
import {
  AUDIENCE_CAPABILITIES,
  PORTAL_VIEWS,
  capabilityPermitted,
  decideAccess,
  findView,
  looksInternal,
  projectRecord,
  projectThrough,
  reachableRecords,
  viewForEntity,
} from "@/lib/portals";
import type {
  EntityReference,
  Portal,
  PortalGrantRecord,
  PortalIdentity,
  PortalMembership,
} from "@/types/domain";
import { createTwoTenantHarness, ORG_A, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-9 — Mission Portals.
 *
 * The expansion plan's note is the shortest in the document and the sharpest:
 * *external parties reading tenant data is the highest-risk surface in the
 * product.* Nearly every test below asserts a refusal, because on this surface
 * the interesting behaviour is what does not happen.
 *
 * Three rules, each with its own block:
 *
 * 1. A portal identity is not a `User`.
 * 2. Access is granted, never inherited.
 * 3. A record is projected, never returned.
 */

const NOW = new Date("2026-07-21T10:00:00Z");
const ref = (type: EntityReference["type"], id: string): EntityReference => ({ type, id });

const portal: Portal = {
  id: "portal-funder",
  organisationId: ORG_A,
  audience: "funder",
  name: "Funder portal",
  status: "open",
  slug: "funders",
  audit: { createdAt: "2026-05-04", updatedAt: "2026-05-04" },
};

const identity: PortalIdentity = {
  id: "pid-1",
  organisationId: ORG_A,
  email: "funder@example.org",
  displayName: "A Funder",
  status: "active",
  invitedAt: "2026-05-04T09:00:00Z",
  audit: { createdAt: "2026-05-04", updatedAt: "2026-05-04" },
};

const membership: PortalMembership = {
  id: "pmem-1",
  organisationId: ORG_A,
  portalId: "portal-funder",
  identityId: "pid-1",
  capabilities: ["portal:view", "portal:message"],
  audit: { createdAt: "2026-05-04", updatedAt: "2026-05-04" },
};

const grantRecord = (overrides: Partial<PortalGrantRecord> = {}): PortalGrantRecord => ({
  id: "pgrant-1",
  organisationId: ORG_A,
  membershipId: "pmem-1",
  entity: ref("grant", "grant-henderson"),
  viewKey: "funder.grant",
  grantedBy: "user-amara",
  grantedAt: "2026-05-04T09:05:00Z",
  ...overrides,
});

const decide = (overrides: Partial<Parameters<typeof decideAccess>[0]> = {}) =>
  decideAccess({
    portal,
    identity,
    membership,
    grants: [grantRecord()],
    entity: ref("grant", "grant-henderson"),
    capability: "portal:view",
    now: NOW,
    ...overrides,
  });

describe("access is granted, never inherited", () => {
  it("allows a record that was shared", () => {
    const decision = decide();
    expect(decision.allowed).toBe(true);
    expect(decision.viewKey).toBe("funder.grant");
  });

  /**
   * The rule the brief states directly: *never expose internal organisation
   * data simply because the underlying record is related.* This is the whole
   * phase in one assertion.
   */
  it("refuses a record merely related to one that was shared", () => {
    const decision = decide({ entity: ref("programme", "prog-youth") });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe("no_grant");
    expect(decision.reason).toMatch(/never inherited from a related one/);
  });

  it("refuses when the grant belongs to a different membership", () => {
    const decision = decide({
      grants: [grantRecord({ membershipId: "pmem-someone-else" })],
    });
    expect(decision.refusal).toBe("no_grant");
  });

  it("refuses a revoked or expired grant", () => {
    expect(decide({ grants: [grantRecord({ revokedAt: "2026-06-01" })] }).refusal).toBe(
      "grant_revoked",
    );
    expect(decide({ grants: [grantRecord({ expiresAt: "2026-06-01" })] }).refusal).toBe(
      "grant_expired",
    );
  });

  it("refuses a revoked or expired membership before it looks at grants", () => {
    expect(
      decide({
        membership: { ...membership, revokedAt: "2026-06-01", revokedReason: "Grant closed" },
      }).refusal,
    ).toBe("membership_revoked");
    expect(decide({ membership: { ...membership, expiresAt: "2026-06-01" } }).refusal).toBe(
      "membership_expired",
    );
  });

  it("refuses a suspended identity and a closed portal", () => {
    expect(decide({ identity: { ...identity, status: "suspended" } }).refusal).toBe(
      "identity_suspended",
    );
    expect(decide({ portal: { ...portal, status: "closed" } }).refusal).toBe("portal_closed");
  });

  it("refuses a capability the membership does not hold", () => {
    expect(decide({ capability: "portal:approve" }).refusal).toBe("capability_missing");
    expect(decide({ capability: "portal:download" }).refusal).toBe("capability_missing");
  });

  /**
   * A portal, an identity and a membership that disagree about which
   * organisation they belong to is not a configuration problem to reconcile.
   * It is the shape of a cross-tenant access attempt.
   */
  it("stops immediately when the three records disagree about the tenant", () => {
    expect(decide({ identity: { ...identity, organisationId: "org-beacon" } }).refusal).toBe(
      "wrong_tenant",
    );
    expect(decide({ membership: { ...membership, organisationId: "org-beacon" } }).refusal).toBe(
      "wrong_tenant",
    );
    expect(decide({ membership: { ...membership, identityId: "pid-someone-else" } }).refusal).toBe(
      "wrong_tenant",
    );
  });

  it("refuses a grant naming a view that does not exist", () => {
    const decision = decide({ grants: [grantRecord({ viewKey: "funder.invented" })] });
    expect(decision.refusal).toBe("no_view");
    // Returning the record unprojected would be the worst possible fallback.
    expect(decision.reason).toMatch(/Nothing can be projected safely/);
  });

  it("refuses a view belonging to another audience", () => {
    const decision = decide({
      grants: [grantRecord({ viewKey: "trustee.grant" })],
    });
    expect(decision.refusal).toBe("no_view");
    expect(decision.reason).toMatch(/belongs to the trustee portal/);
  });

  it("refuses a view that projects a different entity type", () => {
    const decision = decide({
      entity: ref("programme", "prog-youth"),
      grants: [grantRecord({ entity: ref("programme", "prog-youth"), viewKey: "funder.grant" })],
    });
    expect(decision.refusal).toBe("no_view");
  });

  it("lists what a membership can currently reach, for the access review", () => {
    const grants = [
      grantRecord({ id: "a" }),
      grantRecord({ id: "b", revokedAt: "2026-06-01" }),
      grantRecord({ id: "c", expiresAt: "2026-06-01" }),
      grantRecord({ id: "d", viewKey: "funder.invented" }),
    ];
    expect(reachableRecords(grants, membership, NOW).map((grant) => grant.id)).toEqual(["a"]);
  });
});

describe("capabilities are closed per audience", () => {
  it("does not let a beneficiary portal be configured to download", () => {
    // A download is a file leaving the organisation's control, and the
    // beneficiary surface is where that matters most.
    expect(capabilityPermitted("beneficiary", "portal:download")).toBe(false);
    expect(capabilityPermitted("funder", "portal:download")).toBe(true);
  });

  it("lets only trustees approve", () => {
    for (const audience of Object.keys(AUDIENCE_CAPABILITIES) as Portal["audience"][]) {
      expect(capabilityPermitted(audience, "portal:approve"), audience).toBe(
        audience === "trustee",
      );
    }
  });
});

describe("a record is projected, never returned", () => {
  const grant = {
    id: "grant-henderson",
    organisationId: ORG_A,
    funderId: "fnd-henderson",
    applicationId: "app-h",
    title: "Youth Futures programme grant",
    awardValue: 95000,
    currency: "GBP",
    restricted: true,
    startDate: "2025-04-01",
    endDate: "2027-03-31",
    grantManagerId: "user-priya",
    funderContact: "Daniel Osei",
    spentToDate: 41000,
    conditions: ["Report against agreed outcome indicators", "Notify of any material change"],
    status: "active",
    audit: { createdAt: "2025-04-01", updatedAt: "2026-07-01" },
  };

  it("returns only the fields the view names", () => {
    const projection = projectRecord({
      entity: ref("grant", "grant-henderson"),
      record: grant,
      viewKey: "funder.grant",
    })!;

    expect(projection.fields.map((field) => field.name).sort()).toEqual([
      "awardValue",
      "currency",
      "endDate",
      "startDate",
      "status",
      "title",
    ]);
  });

  /**
   * The three fields a funder must not see, and why each one:
   * `conditions` is the organisation's internal reading of the agreement,
   * `grantManagerId` names a member of staff, and `spentToDate` is an
   * unverifiable scalar a funder would reasonably read as audited.
   */
  it("withholds the internal fields, and says it withheld them", () => {
    const projection = projectRecord({
      entity: ref("grant", "grant-henderson"),
      record: grant,
      viewKey: "funder.grant",
    })!;

    const values = projection.fields.map((field) => field.value).join(" ");
    expect(values).not.toContain("Notify of any material change");
    expect(values).not.toContain("user-priya");
    expect(values).not.toContain("41000");

    // A funder shown four fields with no indication that ten exist will
    // reason as though they have seen the record.
    expect(projection.withheld).toContain("Conditions");
    expect(projection.withheldNote).toMatch(/not shown/);
  });

  it("does not name internal identifiers even in the withheld list", () => {
    const projection = projectRecord({
      entity: ref("grant", "grant-henderson"),
      record: grant,
      viewKey: "funder.grant",
    })!;
    // Telling somebody that `grantManagerId` exists is a small leak of
    // internal structure and is not information they can use.
    expect(projection.withheld.join(" ")).not.toMatch(/Id\b/);
    expect(projection.withheld).not.toContain("Audit");
  });

  /**
   * The failure this prevents is a schema change rather than a security bug,
   * which is why it would be missed: somebody adds a field to `Grant` and it
   * appears on every funder portal.
   */
  it("ignores a field added to the record that no view names", () => {
    const projection = projectRecord({
      entity: ref("grant", "grant-henderson"),
      record: { ...grant, internalRiskNote: "Funder is unhappy about the delay" },
      viewKey: "funder.grant",
    })!;

    expect(projection.fields.map((field) => field.value).join(" ")).not.toContain("unhappy");
  });

  it("refuses to render a nested object rather than stringifying it", () => {
    const projection = projectThrough(
      ref("grant", "g1"),
      { title: "A grant", nested: { secret: "value" } },
      {
        key: "test",
        audience: "funder",
        entityType: "grant",
        label: "Test",
        fields: ["title", "nested"],
      },
    );

    expect(projection.fields.map((field) => field.name)).toEqual(["title"]);
    expect(projection.fields.map((field) => field.value).join(" ")).not.toContain(
      "[object Object]",
    );
  });

  it("renders money rather than dropping it", () => {
    const projection = projectThrough(
      ref("fund", "f1"),
      { name: "General", balance: { minorUnits: 744_000, currency: "GBP" } },
      {
        key: "test",
        audience: "trustee",
        entityType: "fund",
        label: "Test",
        fields: ["name", "balance"],
      },
    );
    expect(projection.fields.find((field) => field.name === "balance")?.value).toMatch(/7,440/);
  });

  it("returns nothing at all when the view does not exist", () => {
    expect(
      projectRecord({ entity: ref("grant", "g1"), record: grant, viewKey: "nope" }),
    ).toBeNull();
  });

  /**
   * Asserted as a class of value rather than as a list of field names, so it
   * keeps catching the next field somebody adds.
   */
  it("never lets an internal identifier reach a projection", () => {
    for (const view of PORTAL_VIEWS) {
      const projection = projectThrough(ref(view.entityType, "x"), grant, view);
      for (const field of projection.fields) {
        expect(looksInternal(field.value), `${view.key}.${field.name}`).toBe(false);
      }
    }
  });
});

describe("the views themselves", () => {
  it("gives every audience at least one view", () => {
    for (const audience of Object.keys(AUDIENCE_CAPABILITIES) as Portal["audience"][]) {
      expect(PORTAL_VIEWS.some((view) => view.audience === audience), audience).toBe(true);
    }
  });

  it("has a unique key for every view", () => {
    const keys = PORTAL_VIEWS.map((view) => view.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names no field twice within a view", () => {
    for (const view of PORTAL_VIEWS) {
      expect(new Set(view.fields).size, view.key).toBe(view.fields.length);
    }
  });

  /**
   * An allowlist that happened to include an identifier would defeat the
   * whole projection layer, so it is checked rather than assumed.
   */
  it("names no identifier or audit field in any allowlist", () => {
    for (const view of PORTAL_VIEWS) {
      for (const field of view.fields) {
        expect(field, view.key).not.toMatch(/Id$|Ids$|^id$|^organisationId$|^audit$/);
      }
    }
  });

  it("returns undefined for an entity type no view names", () => {
    // A new entity is invisible to every portal until somebody writes a view.
    expect(viewForEntity("funder", "claim")).toBeUndefined();
    expect(viewForEntity("beneficiary", "grant")).toBeUndefined();
    expect(findView("funder.grant")).toBeDefined();
  });

  /**
   * A partner portal that showed the funding behind a jointly delivered
   * programme would leak a funding relationship every time.
   */
  it("does not show a partner who funds the work", () => {
    expect(viewForEntity("partner", "grant")).toBeUndefined();
    expect(viewForEntity("partner", "funder")).toBeUndefined();
  });

  /**
   * §8 records the absence of a beneficiary entity as a decision, and MG-7
   * declined to reverse it. A beneficiary portal shows the programme, not a
   * record of the person.
   */
  it("gives a beneficiary no view onto a person or a claim", () => {
    expect(viewForEntity("beneficiary", "person")).toBeUndefined();
    expect(viewForEntity("beneficiary", "claim")).toBeUndefined();
    expect(viewForEntity("beneficiary", "evidence")).toBeUndefined();
  });
});

describe("the portal surface, end to end", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const EMAIL = "daniel.osei@hendersontrust.example";

  it("shows a funder only what was shared with them", async () => {
    const index = await h.repo.portalAccess.index("funders", EMAIL);

    expect(index.map((entry) => entry.entity.type).sort()).toEqual([
      "evidence",
      "grant",
      "impact_report",
    ]);
    // The programme all three point at was never shared, and is therefore not
    // reachable. That is the phase, in one assertion.
    expect(index.some((entry) => entry.entity.type === "programme")).toBe(false);
  });

  it("refuses a related record the organisation did not share", async () => {
    expect(
      await h.repo.portalAccess.read("funders", EMAIL, ref("programme", "prog-youth")),
    ).toBeNull();
    expect(
      await h.repo.portalAccess.read("funders", EMAIL, ref("grant", "grant-wyca")),
    ).toBeNull();
  });

  it("returns a projection rather than the record", async () => {
    const projection = await h.repo.portalAccess.read(
      "funders",
      EMAIL,
      ref("grant", "grant-henderson"),
    )!;

    expect(projection).not.toBeNull();
    const values = projection!.fields.map((field) => field.value).join(" ");
    expect(values).toContain("Youth Futures programme grant");
    expect(values).not.toContain("user-priya");
    for (const field of projection!.fields) {
      expect(looksInternal(field.value)).toBe(false);
    }
  });

  it("refuses an unknown email and an unknown slug", async () => {
    expect(await h.repo.portalAccess.index("funders", "nobody@example.org")).toEqual([]);
    expect(await h.repo.portalAccess.index("invented", EMAIL)).toEqual([]);
    expect(await h.repo.portalAccess.resolvePortal("invented")).toBeNull();
  });

  it("refuses a portal that is not open", async () => {
    const portalRecord = h.state.portals.find((entry) => entry.id === "portal-funder")!;
    portalRecord.status = "closed";
    expect(await h.repo.portalAccess.resolvePortal("funders")).toBeNull();
    expect(await h.repo.portalAccess.index("funders", EMAIL)).toEqual([]);
  });

  it("stops immediately when the membership is revoked", async () => {
    await h.repo.portals.revokeMembership(h.ctxA, "pmem-daniel", "The grant has closed.");
    expect(await h.repo.portalAccess.index("funders", EMAIL)).toEqual([]);
    expect(
      await h.repo.portalAccess.read("funders", EMAIL, ref("grant", "grant-henderson")),
    ).toBeNull();
  });

  it("keeps a revocation rather than deleting the grant", async () => {
    const before = await h.repo.portals.grantsFor(h.ctxA, "pmem-daniel");
    await h.repo.portals.unshare(h.ctxA, before[0]!.id);

    const after = await h.repo.portals.grantsFor(h.ctxA, "pmem-daniel");
    // "What did we share with this funder, and when did we stop?" is a
    // question a deleted row cannot answer.
    expect(after).toHaveLength(before.length);
    expect(after.find((grant) => grant.id === before[0]!.id)?.revokedAt).toBeTruthy();
    expect(
      await h.repo.portalAccess.read("funders", EMAIL, before[0]!.entity),
    ).toBeNull();
  });

  it("refuses to share an entity type the audience has no view for", async () => {
    expect(
      await h.repo.portals.share(h.ctxA, {
        membershipId: "pmem-daniel",
        // A funder portal has no claim view, and a new entity type is
        // invisible until somebody writes one.
        entity: ref("claim", "claim-participants-2026"),
      }),
    ).toBeNull();
  });

  it("refuses to share another tenant's record", async () => {
    expect(
      await h.repo.portals.share(h.ctxA, {
        membershipId: "pmem-daniel",
        entity: ref("grant", "grant-beacon-1"),
      }),
    ).toBeNull();
  });

  it("refuses to invite with a capability the audience cannot hold", async () => {
    expect(
      await h.repo.portals.invite(h.ctxA, {
        portalId: "portal-funder",
        email: "someone@example.org",
        displayName: "Someone",
        capabilities: ["portal:view", "portal:approve"],
      }),
    ).toBeNull();
  });

  it("records a submission without changing anything", async () => {
    await h.repo.portals.invite(h.ctxA, {
      portalId: "portal-funder",
      email: "another@example.org",
      displayName: "Another",
      capabilities: ["portal:view", "portal:message"],
    });

    // No `portal:submit` on a funder membership, so it is refused.
    expect(
      await h.repo.portalAccess.submit("funders", "another@example.org", {
        kind: "evidence",
        body: "Here is something",
      }),
    ).toBeNull();

    const messageId = await h.repo.portalAccess.message(
      "funders",
      "another@example.org",
      "When is the next report due?",
    );
    expect(messageId).toBeTruthy();
  });

  it("keeps one tenant out of the other's portals", async () => {
    expect(await h.repo.portals.list(h.ctxB)).toEqual([]);
    expect(await h.repo.portals.identities(h.ctxB)).toEqual([]);
    expect(await h.repo.portals.memberships(h.ctxB)).toEqual([]);
    expect(await h.repo.portals.grantsFor(h.ctxB, "pmem-daniel")).toEqual([]);
    expect(
      await h.repo.portals.share(h.ctxB, {
        membershipId: "pmem-daniel",
        entity: ref("grant", "grant-henderson"),
      }),
    ).toBeNull();
  });

  it("audits every share and every revocation", async () => {
    const before = (await h.repo.audit.list(h.ctxA)).length;
    await h.repo.portals.share(h.ctxA, {
      membershipId: "pmem-daniel",
      entity: ref("grant_deliverable", "del-1"),
      reason: "They asked about progress.",
    });
    const after = await h.repo.audit.list(h.ctxA);

    expect(after.length).toBeGreaterThan(before);
    expect(after.some((event) => event.action === "portal.shared")).toBe(true);
  });
});
