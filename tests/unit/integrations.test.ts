import { beforeEach, describe, expect, it } from "vitest";
import {
  BEACON,
  INTEGRATIONS,
  contentHashOf,
  decideChange,
  decideDeletion,
  defaultSemantics,
  describeSemantics,
  findIntegration,
  hasChanged,
  isHumanApproved,
  isStale,
  needsAttention,
  permitted,
} from "@/lib/integrations";
import type { SyncSemantics, VerificationState } from "@/types/domain";
import { createTwoTenantHarness, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-11 — the integration hub.
 *
 * The strategic claim is that an organisation can adopt Pegasus without
 * migrating their CRM on day one. Two rules make that survivable, and nearly
 * every test below is one of them:
 *
 * 1. No provider identifier enters a core entity.
 * 2. Nothing silently overwrites a human.
 */

const NOW = new Date("2026-07-21T10:00:00Z");

const semantics = (overrides: Partial<SyncSemantics> = {}): SyncSemantics => ({
  ...defaultSemantics("connect"),
  ...overrides,
});

const change = (
  currentValue: string | undefined,
  currentVerification: VerificationState,
  externalValue: string,
  overrides: Partial<SyncSemantics> = {},
) =>
  decideChange({
    currentValue,
    currentVerification,
    externalValue,
    semantics: semantics(overrides),
  });

describe("nothing silently overwrites a human", () => {
  /**
   * The brief's firmest line in this phase, and the reason the check sits
   * before the conflict behaviour rather than inside it.
   */
  it("refuses to overwrite a verified value, whatever the connection is set to", () => {
    for (const behaviour of ["refuse", "external_wins", "pegasus_wins", "newest_wins"] as const) {
      const decision = change("Verified value", "verified", "CRM value", {
        conflictBehaviour: behaviour,
      });
      expect(decision.action, behaviour).toBe("conflict");
    }
  });

  it("refuses to overwrite a value the organisation entered deliberately", () => {
    expect(change("Typed here", "provided", "CRM value").action).toBe("conflict");
    expect(change("Typed here", "provided", "CRM value").reason).toMatch(/deliberately/);
  });

  /**
   * The counterpart. A machine-extracted or stale value is exactly what a
   * connected system should improve, and refusing those would make the
   * integration useless.
   */
  it("does let a provider improve a machine-extracted or stale value", () => {
    expect(
      change("Guessed", "ai_extracted", "CRM value", { conflictBehaviour: "external_wins" })
        .action,
    ).toBe("update");
    expect(
      change("Old", "outdated", "CRM value", { conflictBehaviour: "external_wins" }).action,
    ).toBe("update");
    expect(isHumanApproved("ai_extracted")).toBe(false);
    expect(isHumanApproved("verified")).toBe(true);
  });

  it("creates where Pegasus holds nothing", () => {
    expect(change(undefined, "needs_review", "CRM value").action).toBe("create");
    expect(change("   ", "needs_review", "CRM value").action).toBe("create");
  });

  it("skips where both sides agree", () => {
    expect(change("Same", "needs_review", "Same").action).toBe("skip");
  });

  /**
   * Blanking a field because a remote system has nothing in it is a deletion
   * disguised as an update, and is how a synced contact loses their phone
   * number.
   */
  it("never blanks a field because the provider sent nothing", () => {
    const decision = change("A real value", "needs_review", "   ");
    expect(decision.action).toBe("skip");
    expect(decision.reason).toMatch(/deletion disguised as an update/);
  });

  it("refuses rather than comparing timestamps across two systems", () => {
    const decision = change("Ours", "needs_review", "Theirs", {
      conflictBehaviour: "newest_wins",
    });
    // A resolution that looks precise and is not is worse than a refusal.
    expect(decision.action).toBe("conflict");
    expect(decision.reason).toMatch(/cannot compare timestamps/);
  });

  it("honours the behaviour an organisation chose, between two machine values", () => {
    expect(
      change("Ours", "needs_review", "Theirs", { conflictBehaviour: "pegasus_wins" }).action,
    ).toBe("skip");
    expect(
      change("Ours", "needs_review", "Theirs", { conflictBehaviour: "external_wins" }).action,
    ).toBe("update");
  });
});

describe("deletions do not propagate by default", () => {
  const entity = { type: "person" as const, id: "per-rowan" };

  it("flags rather than deletes", () => {
    const decision = decideDeletion(semantics(), entity);
    expect(decision.action).toBe("flag");
    // A CRM record removed by somebody tidying up should not silently remove a
    // person from a grant report.
    expect(decision.reason).toMatch(/still be cited in a published report/);
  });

  it("archives only where the organisation chose to", () => {
    expect(decideDeletion(semantics({ deletionBehaviour: "archive" }), entity).action).toBe(
      "archive",
    );
    expect(decideDeletion(semantics({ deletionBehaviour: "ignore" }), entity).action).toBe(
      "ignore",
    );
  });
});

describe("the registry states what it knows and what it does not", () => {
  it("marks every provider as unimplemented, because none is", () => {
    for (const integration of INTEGRATIONS) {
      expect(integration.implemented, integration.id).toBe(false);
    }
  });

  it("refuses every operation on an unimplemented provider", () => {
    for (const integration of INTEGRATIONS) {
      const decision = permitted(integration, "read");
      expect(decision.allowed, integration.id).toBe(false);
      expect(decision.reason).toMatch(/no adapter/);
    }
  });

  /**
   * Beacon is the one provider whose capabilities were read from its own
   * published documentation rather than assumed, and the difference should be
   * visible in the registry rather than only in a commit message.
   */
  it("cites a source for the one provider that was actually researched", () => {
    expect(BEACON.documentation).toMatch(/beaconcrm\.org/);
    const researched = INTEGRATIONS.filter((integration) => integration.documentation);
    expect(researched.map((integration) => integration.id)).toEqual(["beacon"]);

    for (const integration of INTEGRATIONS) {
      if (integration.documentation) continue;
      // The others say plainly that nothing about them should be trusted.
      expect(integration.notes.join(" "), integration.id).toMatch(
        /have not been read from this provider's documentation/,
      );
    }
  });

  /**
   * Beacon's guide states that relationships are not accessible through the
   * API. The brief's candidate sync list includes them, and it cannot be
   * honoured — which is recorded rather than left for somebody to discover.
   */
  it("records what Beacon cannot supply, and why", () => {
    const unavailable = BEACON.unavailable.find(
      (entry) => entry.entityType === "relationship",
    );
    expect(unavailable).toBeDefined();
    expect(unavailable!.reason).toMatch(/not currently accessible/);
    expect(BEACON.supplies).not.toContain("relationship");
  });

  it("records Beacon's published rate limits and its lack of webhooks", () => {
    expect(BEACON.capabilities.rateLimitPerMinute).toBe(300);
    expect(BEACON.capabilities.bulkRateLimitPerMinute).toBe(60);
    // No webhook mechanism is documented, so sync is poll-based. Building a
    // receiver on the assumption one exists would be building against an
    // unofficial mechanism.
    expect(BEACON.capabilities.webhooks).toBe(false);
    expect(BEACON.capabilities.incrementalSync).toBe(true);
  });

  it("warns that Beacon's API access is plan-gated", () => {
    expect(BEACON.notes.join(" ")).toMatch(/Standard, Premium and Ultimate plans/);
    // A connection failing because of a subscription is a different problem
    // from bad credentials and deserves a different message.
    expect(BEACON.notes.join(" ")).toMatch(/rather than their credentials/);
  });

  it("finds a provider by id and returns nothing for one it does not know", () => {
    expect(findIntegration("beacon")).toBeDefined();
    expect(findIntegration("invented-crm")).toBeUndefined();
  });
});

describe("connect mode is the safe default", () => {
  it("reads only, treats the other system as authoritative, and refuses on conflict", () => {
    const connect = defaultSemantics("connect");
    expect(connect.direction).toBe("inbound");
    expect(connect.sourceOfTruth).toBe("external");
    expect(connect.conflictBehaviour).toBe("refuse");
    expect(connect.deletionBehaviour).toBe("flag");
  });

  /**
   * A migration is exactly when two systems disagree most, and the worst
   * possible moment to resolve disagreements automatically.
   */
  it("still refuses on conflict in migrate mode", () => {
    expect(defaultSemantics("migrate").conflictBehaviour).toBe("refuse");
    expect(defaultSemantics("migrate").sourceOfTruth).toBe("pegasus");
  });

  it("describes what a connection will do in one sentence", () => {
    const description = describeSemantics(defaultSemantics("connect"));
    expect(description).toMatch(/reads from this system and writes nothing back/);
    expect(description).toMatch(/nothing changes and somebody is asked/);
    expect(description).toMatch(/flagged here, not removed/);
  });
});

describe("freshness and failure", () => {
  it("treats never-synced and long-ago-synced as stale", () => {
    expect(isStale(undefined, semantics(), NOW)).toBe(true);
    expect(isStale("2026-07-21T09:50:00Z", semantics({ freshnessMinutes: 60 }), NOW)).toBe(false);
    expect(isStale("2026-07-20T09:50:00Z", semantics({ freshnessMinutes: 60 }), NOW)).toBe(true);
  });

  /**
   * A connection that has failed three times running is not having a bad day.
   * Continuing to retry silently means the organisation believes they are
   * synced when they have not been for a week.
   */
  it("says when a connection needs a person", () => {
    expect(needsAttention(2, semantics({ failureThreshold: 3 }))).toBe(false);
    expect(needsAttention(3, semantics({ failureThreshold: 3 }))).toBe(true);
  });
});

describe("content hashing skips unchanged records", () => {
  it("is stable under key reordering", () => {
    expect(contentHashOf({ a: "1", b: "2" })).toBe(contentHashOf({ b: "2", a: "1" }));
  });

  it("changes when a value changes", () => {
    expect(contentHashOf({ a: "1" })).not.toBe(contentHashOf({ a: "2" }));
  });

  it("reports a record as unchanged only when the hash matches", () => {
    const identity = { contentHash: "abc" } as never;
    expect(hasChanged(identity, "abc")).toBe(false);
    expect(hasChanged(identity, "def")).toBe(true);
    expect(hasChanged(undefined, "abc")).toBe(true);
  });
});

describe("the hub, end to end", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const connect = async (harness: TwoTenantHarness) =>
    (await harness.repo.integrations.connect(harness.ctxA, {
      integrationId: "beacon",
      accountLabel: "Northstar Beacon account",
      mode: "connect",
    }))!;

  it("creates a connection as pending, never as active", async () => {
    const id = await connect(h);
    const connection = await h.repo.integrations.getConnection(h.ctxA, id);
    // Active means something read successfully, not that somebody filled in a
    // form.
    expect(connection?.status).toBe("pending");
    expect(connection?.semantics.conflictBehaviour).toBe("refuse");
  });

  it("refuses a provider it does not know", async () => {
    expect(
      await h.repo.integrations.connect(h.ctxA, {
        integrationId: "invented-crm",
        accountLabel: "x",
        mode: "connect",
      }),
    ).toBeNull();
  });

  /**
   * Every provider is unimplemented, so a sync must refuse rather than
   * pretending. The run is still recorded, because "why did nothing sync?" is
   * a question that needs an answer.
   */
  it("refuses to sync an unimplemented provider, and records the refusal", async () => {
    const id = await connect(h);
    const outcome = await h.repo.integrations.applyIncoming(h.ctxA, id, "people", [
      { externalId: "b1", externalType: "person", fields: { first_name: "Rowan" } },
    ]);

    expect(outcome.run.outcome).toBe("refused");
    expect(outcome.run.summary).toMatch(/no adapter/);
    expect(outcome.run.recordsRead).toBe(0);

    const runs = await h.repo.integrations.runs(h.ctxA, id);
    expect(runs).toHaveLength(1);
  });

  it("stores no provider identifier on a core entity", async () => {
    const id = await connect(h);
    await h.repo.integrations.saveMapping(h.ctxA, {
      connectionId: id,
      externalType: "person",
      externalField: "first_name",
      entityType: "person",
      field: "firstName",
      writable: false,
      verification: "provided",
    });

    const person = await h.repo.relationships.getPerson(h.ctxA, "per-rowan");
    const serialised = JSON.stringify(person);
    // There is no beaconId on a person. The mapping lives in its own table.
    expect(serialised).not.toMatch(/beacon/i);
    expect(Object.keys(person!)).not.toContain("externalId");
  });

  it("deduplicates a webhook delivered twice", async () => {
    const id = await connect(h);
    const first = await h.repo.integrations.recordWebhook(h.ctxA, id, {
      providerEventId: "evt-1",
      eventType: "donation.created",
      payload: { amount: 5000 },
    });
    const second = await h.repo.integrations.recordWebhook(h.ctxA, id, {
      providerEventId: "evt-1",
      eventType: "donation.created",
      payload: { amount: 5000 },
    });

    expect(first.accepted).toBe(true);
    // A handler that assumed otherwise would double-count a donation.
    expect(second.accepted).toBe(false);
    expect(second.reason).toMatch(/Already received/);
    expect(await h.repo.integrations.webhooks(h.ctxA, id)).toHaveLength(1);
  });

  it("keeps the identity map when a connection is disconnected", async () => {
    const id = await connect(h);
    await h.repo.integrations.disconnect(h.ctxA, id);

    const connection = await h.repo.integrations.getConnection(h.ctxA, id);
    expect(connection?.status).toBe("revoked");

    // Deleting the map would mean reconnecting re-imported every record as
    // new, duplicating the lot.
    const audit = await h.repo.audit.list(h.ctxA);
    expect(audit.some((event) => event.action === "integration.disconnected")).toBe(true);
  });

  it("refuses to sync a revoked connection", async () => {
    const id = await connect(h);
    await h.repo.integrations.disconnect(h.ctxA, id);
    const outcome = await h.repo.integrations.applyIncoming(h.ctxA, id, "people", []);
    expect(outcome.run.outcome).toBe("refused");
  });

  it("records a conflict resolution against a person", async () => {
    const id = await connect(h);
    h.state.syncConflicts.push({
      id: "sconf-1",
      organisationId: "org-northstar",
      connectionId: id,
      entity: { type: "person", id: "per-rowan" },
      field: "email",
      pegasusValue: "rowan.whitfield@example.org",
      pegasusVerification: "verified",
      externalValue: "r.whitfield@example.org",
      detectedAt: "2026-07-21T10:00:00Z",
    });

    await h.repo.integrations.resolveConflict(h.ctxA, "sconf-1", "kept_pegasus", "Confirmed by phone.");
    const [conflict] = await h.repo.integrations.conflicts(h.ctxA);
    expect(conflict!.resolution).toBe("kept_pegasus");
    expect(conflict!.resolvedBy).toBe(h.ctxA.userId);
    expect(await h.repo.integrations.conflicts(h.ctxA, { openOnly: true })).toEqual([]);
  });

  it("keeps one tenant's connections out of the other's", async () => {
    const id = await connect(h);
    expect(await h.repo.integrations.connections(h.ctxB)).toEqual([]);
    expect(await h.repo.integrations.getConnection(h.ctxB, id)).toBeNull();
    expect(await h.repo.integrations.mappings(h.ctxB, id)).toEqual([]);
    expect(await h.repo.integrations.runs(h.ctxB)).toEqual([]);
    expect(
      await h.repo.integrations.saveMapping(h.ctxB, {
        connectionId: id,
        externalType: "person",
        externalField: "x",
        entityType: "person",
        field: "firstName",
        writable: false,
        verification: "provided",
      }),
    ).toBeNull();
    expect((await h.repo.integrations.recordWebhook(h.ctxB, id, {
      providerEventId: "e",
      eventType: "t",
      payload: {},
    })).accepted).toBe(false);
  });
});
