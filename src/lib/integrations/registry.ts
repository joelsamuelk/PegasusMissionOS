import type { Integration, MigrationMode, SyncSemantics } from "@/types/domain";

/**
 * The provider registry.
 *
 * A catalogue of what Pegasus knows how to talk to, and — more usefully —
 * what it does not. `implemented` is **false for every entry**, and saying so
 * is the point: a registry that listed nine providers without distinguishing
 * the described from the built would be a roadmap presented as a feature.
 *
 * Each descriptor states where its capabilities came from. A capability claim
 * without a source is a guess, and a guess here produces an integration that
 * fails in production rather than at design time.
 */

const noCapabilities = {
  read: false,
  write: false,
  delete: false,
  incrementalSync: false,
  webhooks: false,
  bulkExport: false,
  fileAccess: false,
};

/**
 * Beacon, the UK charity CRM.
 *
 * The brief singles this one out: *investigate Beacon's supported
 * API/export/integration capabilities. Do not scrape Beacon. Build only
 * against officially supported mechanisms.*
 *
 * The capabilities below were read from Beacon's own published guide
 * (`guide.beaconcrm.org`, article 5720215) rather than inferred, and three of
 * the findings change the design rather than merely informing it.
 *
 * **1. Relationships are not exposed.** Beacon's guide states the
 * relationships feature is not currently accessible via the API. The brief's
 * candidate sync list includes Relationships, and it cannot be honoured. That
 * is recorded in `unavailable` rather than left for somebody to discover, and
 * it means a CONNECT-mode organisation keeps its relationship map in Beacon
 * while Pegasus reasons over people, organisations and money.
 *
 * **2. The schema is generated per account.** Beacon's API documentation is
 * generated from each customer's own database configuration, including their
 * custom fields. Field keys therefore differ between two charities using the
 * same product, which is why `IntegrationMapping` is per **connection** rather
 * than per provider. A mapping hardcoded against one customer's schema would
 * work once.
 *
 * **3. No webhooks are documented.** Sync must therefore be poll-based against
 * a cursor. Building a webhook receiver for Beacon on the assumption that one
 * exists would be building against an unofficial mechanism, which is precisely
 * what the brief forbids.
 *
 * Two operational constraints follow: API access is plan-gated, so a
 * connection can fail because of the customer's subscription rather than their
 * credentials — a distinct failure that deserves a distinct message — and the
 * published rate limits are 300 requests a minute, 60 for bulk, with a 429 on
 * exceeding them.
 */
export const BEACON: Integration = {
  id: "beacon",
  name: "Beacon",
  category: "crm",
  supplies: ["person", "external_organisation", "donation", "campaign", "interaction"],
  unavailable: [
    {
      entityType: "relationship",
      reason:
        "Beacon's published guide states that the relationships feature is not currently accessible through its API. An organisation in CONNECT mode keeps its relationship map in Beacon; Pegasus reasons over the people, organisations and money it can read.",
    },
  ],
  capabilities: {
    read: true,
    // Beacon documents an upsert operation, so create and update are one call.
    write: true,
    delete: true,
    // Cursor-based reads are available; no webhook mechanism is documented.
    incrementalSync: true,
    webhooks: false,
    bulkExport: true,
    // Files are reached through signed URLs that expire after an hour.
    fileAccess: true,
    rateLimitPerMinute: 300,
    bulkRateLimitPerMinute: 60,
  },
  documentation: "https://guide.beaconcrm.org/en/articles/5720215-beacon-s-api",
  implemented: false,
  notes: [
    "API access is available on Beacon's Standard, Premium and Ultimate plans only. A connection can therefore fail because of the customer's subscription rather than their credentials, and the two need different messages.",
    "The API schema is generated from each account's own configuration, so field mappings must be discovered per connection and confirmed by a person.",
    "Signed file URLs expire sixty minutes after generation, so a document reference cannot be stored and reused.",
    "Rate limits are 300 requests a minute and 60 for bulk operations, with a 429 on exceeding them.",
    "No scraping. Only the documented REST API and the export mechanism are used.",
  ],
};

/**
 * The other priority categories.
 *
 * Described rather than researched, and each says so. Writing a confident
 * capability list for eight products without reading eight sets of
 * documentation would produce exactly the false precision this registry exists
 * to avoid — and the Beacon entry above shows what the difference looks like.
 */
const described = (
  id: string,
  name: string,
  category: Integration["category"],
  supplies: Integration["supplies"],
  note: string,
): Integration => ({
  id,
  name,
  category,
  supplies,
  unavailable: [],
  capabilities: noCapabilities,
  implemented: false,
  notes: [
    note,
    "Capabilities have not been read from this provider's documentation. Nothing here should be treated as a statement about what it supports.",
  ],
});

export const INTEGRATIONS: Integration[] = [
  BEACON,
  described(
    "xero",
    "Xero",
    "accounting",
    ["transaction", "fund", "budget"],
    "Would supply the ledger MG-8 currently reads from imported CSVs, and would make bank reconciliation continuous rather than periodic.",
  ),
  described(
    "stripe",
    "Stripe",
    "payments",
    ["donation", "transaction"],
    "A donation taken here would arrive as a payment. MG-10 records gifts after the money arrived; this is what would tell it.",
  ),
  described(
    "gocardless",
    "GoCardless",
    "payments",
    ["donation", "transaction"],
    "Direct debits, which is what most recurring commitments in the UK actually are.",
  ),
  described(
    "gmail",
    "Gmail",
    "email",
    ["interaction"],
    "The port already exists in server/communications/provider.ts and is deliberately unimplemented: attaching email to the wrong person is worse than not attaching it.",
  ),
  described(
    "microsoft365",
    "Microsoft 365",
    "email",
    ["interaction", "event"],
    "Mail and calendar through Microsoft Graph.",
  ),
  described(
    "mailchimp",
    "Mailchimp",
    "email",
    ["person", "campaign"],
    "Audience membership and campaign sends. Consent state must be reconciled rather than overwritten in either direction.",
  ),
  described(
    "justgiving",
    "JustGiving",
    "fundraising",
    ["donation", "person", "campaign"],
    "Public fundraising pages. Gift Aid status arrives with the donation and must not be re-declared.",
  ),
  described(
    "google_drive",
    "Google Drive",
    "storage",
    ["document"],
    "Document ingestion, which MG-3 built the parsing half of.",
  ),
];

export function findIntegration(id: string): Integration | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id);
}

export function integrationsByCategory(
  category: Integration["category"],
): Integration[] {
  return INTEGRATIONS.filter((integration) => integration.category === category);
}

/**
 * The safe defaults for a new connection.
 *
 * CONNECT mode reads only, treats the other system as authoritative, and
 * refuses on conflict. Every one of those can be changed by an organisation
 * that has thought about it; none of them is the shape that damages another
 * system's data by accident on day one.
 */
export function defaultSemantics(mode: MigrationMode): SyncSemantics {
  return mode === "connect"
    ? {
        direction: "inbound",
        sourceOfTruth: "external",
        conflictBehaviour: "refuse",
        // A CRM record deleted by somebody tidying up should not silently
        // remove a person from a grant report.
        deletionBehaviour: "flag",
        freshnessMinutes: 60,
        failureThreshold: 3,
      }
    : {
        direction: "bidirectional",
        // In MIGRATE mode Pegasus is becoming the system of record, and the
        // conflict behaviour stays `refuse` regardless: a migration is exactly
        // when two systems disagree most, and it is the worst possible moment
        // to resolve disagreements automatically.
        sourceOfTruth: "pegasus",
        conflictBehaviour: "refuse",
        deletionBehaviour: "flag",
        freshnessMinutes: 30,
        failureThreshold: 3,
      };
}

/**
 * Whether a connection may attempt something.
 *
 * Checked before a sync runs rather than discovered from a 405. A provider
 * whose capabilities were never verified can do nothing at all, which is the
 * safe reading of an unverified claim.
 */
export function permitted(
  integration: Integration,
  operation: "read" | "write" | "delete",
): { allowed: boolean; reason?: string } {
  if (!integration.implemented) {
    return {
      allowed: false,
      reason: `${integration.name} is described in the registry and has no adapter. Nothing can be read from or written to it yet.`,
    };
  }
  if (!integration.capabilities[operation]) {
    return {
      allowed: false,
      reason: `${integration.name} does not support ${operation} through its documented interface.`,
    };
  }
  return { allowed: true };
}
