import { defaultSemantics, findIntegration, permitted } from "@/lib/integrations/registry";
import {
  contentHashOf,
  decideChange,
  decideDeletion,
  describeSemantics,
  hasChanged,
} from "@/lib/integrations/sync";
import type {
  EntityReference,
  EntityType,
  ExternalIdentity,
  IntegrationConnection,
  IntegrationMapping,
  SyncConflict,
  SyncRun,
  SyncSemantics,
  VerificationState,
  WebhookEvent,
} from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { IntegrationRepository } from "../../types";
import { auditFrom, numberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function semanticsFrom(row: Row): SyncSemantics {
  return {
    direction: row.direction as SyncSemantics["direction"],
    sourceOfTruth: row.source_of_truth as SyncSemantics["sourceOfTruth"],
    conflictBehaviour: row.conflict_behaviour as SyncSemantics["conflictBehaviour"],
    deletionBehaviour: row.deletion_behaviour as SyncSemantics["deletionBehaviour"],
    freshnessMinutes: numberFrom(row.freshness_minutes),
    failureThreshold: numberFrom(row.failure_threshold),
  };
}

function semanticsColumns(semantics: SyncSemantics): Record<string, unknown> {
  return {
    direction: semantics.direction,
    sourceOfTruth: semantics.sourceOfTruth,
    conflictBehaviour: semantics.conflictBehaviour,
    deletionBehaviour: semantics.deletionBehaviour,
    freshnessMinutes: semantics.freshnessMinutes,
    failureThreshold: semantics.failureThreshold,
  };
}

function mapConnection(row: Row): IntegrationConnection {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    integrationId: String(row.integration_id),
    accountLabel: String(row.account_label),
    mode: row.mode as IntegrationConnection["mode"],
    // Flattened across columns rather than stored as jsonb: freshness and the
    // failure threshold are read by queries, not only by the application.
    semantics: semanticsFrom(row),
    status: row.status as IntegrationConnection["status"],
    // A reference to wherever the secret actually lives, never the secret. A
    // token in a tenant-readable row is a token every member can read.
    ...(row.credential_ref ? { credentialRef: String(row.credential_ref) } : {}),
    ...(row.connected_by ? { connectedBy: String(row.connected_by) } : {}),
    connectedAt: String(row.connected_at),
    ...(row.last_synced_at ? { lastSyncedAt: String(row.last_synced_at) } : {}),
    consecutiveFailures: numberFrom(row.consecutive_failures),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
    audit: auditFrom(row),
  };
}

function mapMapping(row: Row): IntegrationMapping {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    connectionId: String(row.connection_id),
    externalType: String(row.external_type),
    externalField: String(row.external_field),
    entityType: row.entity_type as EntityType,
    field: String(row.field),
    // Off unless somebody said so.
    writable: Boolean(row.writable),
    // Discovery produces candidates; a human confirms.
    verification: row.verification as VerificationState,
  };
}

function mapIdentity(row: Row): ExternalIdentity {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    connectionId: String(row.connection_id),
    // Opaque; never parsed, never displayed as an id.
    externalId: String(row.external_id),
    externalType: String(row.external_type),
    entity: { type: row.entity_type as EntityType, id: String(row.entity_id) },
    ...(row.content_hash ? { contentHash: String(row.content_hash) } : {}),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    // The column is `external_deleted_at`; the field is `externallyDeletedAt`.
    ...(row.external_deleted_at
      ? { externallyDeletedAt: String(row.external_deleted_at) }
      : {}),
  };
}

function mapRun(row: Row): SyncRun {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    connectionId: String(row.connection_id),
    resource: String(row.resource),
    direction: row.direction as SyncRun["direction"],
    startedAt: String(row.started_at),
    ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
    outcome: row.outcome as SyncRun["outcome"],
    recordsRead: numberFrom(row.records_read),
    recordsCreated: numberFrom(row.records_created),
    recordsUpdated: numberFrom(row.records_updated),
    recordsSkipped: numberFrom(row.records_skipped),
    conflictsRaised: numberFrom(row.conflicts_raised),
    // Always populated. A run that explains nothing cannot be diagnosed.
    summary: String(row.summary),
    ...(row.error ? { error: String(row.error) } : {}),
  };
}

function mapConflict(row: Row): SyncConflict {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    connectionId: String(row.connection_id),
    entity: { type: row.entity_type as EntityType, id: String(row.entity_id) },
    field: String(row.field),
    pegasusValue: String(row.pegasus_value),
    pegasusVerification: row.pegasus_verification as VerificationState,
    externalValue: String(row.external_value),
    detectedAt: String(row.detected_at),
    ...(row.resolution ? { resolution: row.resolution as SyncConflict["resolution"] } : {}),
    ...(row.resolved_by ? { resolvedBy: String(row.resolved_by) } : {}),
    ...(row.resolved_at ? { resolvedAt: String(row.resolved_at) } : {}),
    ...(row.resolution_note ? { resolutionNote: String(row.resolution_note) } : {}),
  };
}

function mapWebhook(row: Row): WebhookEvent {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    connectionId: String(row.connection_id),
    providerEventId: String(row.provider_event_id),
    eventType: String(row.event_type),
    receivedAt: String(row.received_at),
    payloadHash: String(row.payload_hash),
    status: row.status as WebhookEvent["status"],
    ...(row.processed_at ? { processedAt: String(row.processed_at) } : {}),
    ...(row.note ? { note: String(row.note) } : {}),
  };
}

export function createIntegrationRepository(q: Query, deps: Deps): IntegrationRepository {
  /**
   * Read one mapped field off an entity, with how much it is trusted.
   *
   * The verification matters more than the value: a field somebody confirmed
   * is one a CRM does not get to correct, and that is the whole basis on which
   * `decideChange` refuses. Mirrors `readField` in the in-memory adapter, and
   * the two must agree.
   */
  async function readField(
    ctx: RequestContext,
    entity: EntityReference,
    field: string,
  ): Promise<{ value: string; verification: VerificationState } | undefined> {
    if (entity.type === "person") {
      const person = await q.maybeOne(ctx, "people", { id: entity.id });
      if (!person) return undefined;
      switch (field) {
        case "firstName":
          return { value: String(person.first_name), verification: "provided" };
        case "lastName":
          return { value: String(person.last_name), verification: "provided" };
        case "jobTitle":
          return person.job_title
            ? { value: String(person.job_title), verification: "provided" }
            : undefined;
        case "email":
        case "phone": {
          const contacts = await q.many(ctx, "contact_points", {
            person_id: entity.id,
            kind: field === "email" ? "email" : "phone",
          });
          const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
          // The contact point carries its own verification, which is exactly
          // the distinction the sync rule needs.
          return primary
            ? {
                value: String(primary.value),
                verification: primary.verification as VerificationState,
              }
            : undefined;
        }
        default:
          return undefined;
      }
    }

    if (entity.type === "external_organisation") {
      const organisation = await q.maybeOne(ctx, "external_organisations", { id: entity.id });
      if (!organisation) return undefined;
      switch (field) {
        case "name":
          return { value: String(organisation.name), verification: "provided" };
        case "website":
          return organisation.website
            ? { value: String(organisation.website), verification: "provided" }
            : undefined;
        case "charityNumber":
          return organisation.charity_number
            ? // A registered charity number is checkable against a public
              // register, and the organisation-intelligence layer does check it.
              { value: String(organisation.charity_number), verification: "verified" }
            : undefined;
        default:
          return undefined;
      }
    }

    return undefined;
  }

  return {
    async connections(ctx) {
      const rows = await q.many(ctx, "integration_connections", {}, { liveOnly: true });
      return rows.map(mapConnection);
    },

    async getConnection(ctx, id) {
      const row = await q.maybeOne(ctx, "integration_connections", { id });
      return row ? mapConnection(row) : null;
    },

    async connect(ctx, input) {
      const integration = findIntegration(input.integrationId);
      if (!integration) return null;

      const semantics = input.semantics ?? defaultSemantics(input.mode);
      const row = await q.insert(ctx, "integration_connections", {
        integrationId: integration.id,
        accountLabel: input.accountLabel,
        mode: input.mode,
        ...semanticsColumns(semantics),
        // Never `active` on creation. A connection is active once something
        // has successfully read from it, not once somebody filled a form in.
        status: "pending",
        credentialRef: input.credentialRef,
        connectedBy: ctx.userId,
        connectedAt: ctx.now().toISOString(),
        consecutiveFailures: 0,
      });

      await deps.audit.record(ctx, {
        action: "integration.connected",
        entityType: "organisation",
        entityId: ctx.organisationId,
        summary: `Connected ${integration.name} (${input.accountLabel}) in ${input.mode} mode. ${describeSemantics(semantics)}`,
      });

      return String(row.id);
    },

    async setSemantics(ctx, connectionId, semantics) {
      await q.update(ctx, "integration_connections", connectionId, semanticsColumns(semantics));
    },

    async disconnect(ctx, connectionId) {
      // Revoked rather than deleted: the external identities and sync history
      // stay readable, and "we used to sync with this and stopped" is a
      // question somebody asks.
      await q.update(ctx, "integration_connections", connectionId, { status: "revoked" });
    },

    async mappings(ctx, connectionId) {
      const rows = await q.many(ctx, "integration_mappings", { connection_id: connectionId });
      return rows.map(mapMapping);
    },

    async saveMapping(ctx, input) {
      const connection = await q.maybeOne(ctx, "integration_connections", {
        id: input.connectionId,
      });
      if (!connection) return null;
      const row = await q.insert(ctx, "integration_mappings", {
        connectionId: input.connectionId,
        externalType: input.externalType,
        externalField: input.externalField,
        entityType: input.entityType,
        field: input.field,
        writable: input.writable,
        verification: input.verification,
      });
      return String(row.id);
    },

    async identities(ctx, connectionId) {
      const rows = await q.many(ctx, "external_identities", { connection_id: connectionId });
      return rows.map(mapIdentity);
    },

    async resolveExternal(ctx, connectionId, externalId, externalType) {
      const row = await q.maybeOne(ctx, "external_identities", {
        connection_id: connectionId,
        external_id: externalId,
        external_type: externalType,
      });
      return row ? mapIdentity(row) : null;
    },

    async runs(ctx, connectionId) {
      const rows = await q.many(
        ctx,
        "sync_runs",
        connectionId ? { connection_id: connectionId } : {},
        { order: { column: "started_at", ascending: false } },
      );
      return rows.map(mapRun);
    },

    async conflicts(ctx, options) {
      const rows = await q.many(ctx, "sync_conflicts", {}, {
        order: { column: "detected_at", ascending: false },
      });
      const conflicts = rows.map(mapConflict);
      return options?.openOnly ? conflicts.filter((c) => !c.resolution) : conflicts;
    },

    async resolveConflict(ctx, conflictId, resolution, note) {
      await q.update(
        ctx,
        "sync_conflicts",
        conflictId,
        {
          resolution,
          resolvedBy: ctx.userId,
          resolvedAt: ctx.now().toISOString(),
          resolutionNote: note,
        },
        { audit: false },
      );
    },

    async applyIncoming(ctx, connectionId, resource, records) {
      const startedAt = ctx.now().toISOString();
      const connectionRow = await q.maybeOne(ctx, "integration_connections", {
        id: connectionId,
      });

      /** Write a run row and return the outcome. Every exit does this. */
      const finish = async (run: Omit<SyncRun, "id" | "organisationId">, write: boolean) => {
        if (!write) {
          return {
            run: { ...run, id: "", organisationId: ctx.organisationId } as SyncRun,
            conflicts: [],
          };
        }
        const row = await q.insert(
          ctx,
          "sync_runs",
          {
            connectionId,
            resource: run.resource,
            direction: run.direction,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            outcome: run.outcome,
            recordsRead: run.recordsRead,
            recordsCreated: run.recordsCreated,
            recordsUpdated: run.recordsUpdated,
            recordsSkipped: run.recordsSkipped,
            conflictsRaised: run.conflictsRaised,
            summary: run.summary,
            error: run.error,
          },
          { audit: false },
        );
        return { run: mapRun(row), conflicts: [] as SyncConflict[] };
      };

      const empty = {
        connectionId,
        resource,
        startedAt,
        finishedAt: startedAt,
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        conflictsRaised: 0,
      };

      if (!connectionRow || connectionRow.status === "revoked") {
        return finish(
          {
            ...empty,
            direction: "inbound",
            outcome: "refused",
            summary: "No live connection. Nothing was read and nothing was written.",
          },
          Boolean(connectionRow),
        );
      }
      const connection = mapConnection(connectionRow);

      const integration = findIntegration(connection.integrationId);
      const allowed = integration
        ? permitted(integration, "read")
        : { allowed: false, reason: "Unknown provider." };

      // Checked before anything is read. A provider whose capabilities were
      // never verified can do nothing, which is the safe reading of an
      // unverified claim.
      if (!allowed.allowed) {
        return finish(
          {
            ...empty,
            direction: connection.semantics.direction,
            outcome: "refused",
            summary: allowed.reason ?? "This provider cannot be read from.",
          },
          true,
        );
      }

      const mappings = (
        await q.many(ctx, "integration_mappings", { connection_id: connectionId })
      ).map(mapMapping);
      const conflicts: SyncConflict[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const record of records) {
        const identityRow = await q.maybeOne(ctx, "external_identities", {
          connection_id: connectionId,
          external_id: record.externalId,
          external_type: record.externalType,
        });
        const identity = identityRow ? mapIdentity(identityRow) : undefined;

        if (record.deleted) {
          decideDeletion(
            connection.semantics,
            identity?.entity ?? { type: "person", id: record.externalId },
          );
          if (identityRow) {
            await q.update(
              ctx,
              "external_identities",
              String(identityRow.id),
              { externalDeletedAt: ctx.now().toISOString() },
              { audit: false },
            );
          }
          skipped += 1;
          continue;
        }

        const hash = contentHashOf(record.fields);
        // An unchanged record costs one comparison rather than a
        // field-by-field diff, which matters against a rate limit.
        if (identity && !hasChanged(identity, hash)) {
          await q.update(
            ctx,
            "external_identities",
            identity.id,
            { lastSeenAt: ctx.now().toISOString() },
            { audit: false },
          );
          skipped += 1;
          continue;
        }

        const forType = mappings.filter((m) => m.externalType === record.externalType);
        if (forType.length === 0) {
          skipped += 1;
          continue;
        }

        const target = identity?.entity;
        let touched = false;

        for (const mapping of forType) {
          const externalValue = record.fields[mapping.externalField];
          if (externalValue === undefined) continue;

          // Where the record is new to Pegasus there is nothing to conflict
          // with, so the decision is a creation.
          if (!target) {
            created += 1;
            touched = true;
            break;
          }

          const current = await readField(ctx, target, mapping.field);
          const decision = decideChange({
            currentValue: current?.value,
            currentVerification: current?.verification ?? "needs_review",
            externalValue,
            semantics: connection.semantics,
            mapping,
          });

          if (decision.action === "conflict") {
            const row = await q.insert(
              ctx,
              "sync_conflicts",
              {
                connectionId,
                entityType: target.type,
                entityId: target.id,
                field: mapping.field,
                pegasusValue: current?.value ?? "",
                pegasusVerification: current?.verification ?? "needs_review",
                externalValue,
                detectedAt: ctx.now().toISOString(),
              },
              { audit: false },
            );
            conflicts.push(mapConflict(row));
            continue;
          }
          if (decision.action === "update" || decision.action === "create") {
            updated += 1;
            touched = true;
          }
        }

        if (!touched && conflicts.length === 0) skipped += 1;

        if (identity) {
          await q.update(
            ctx,
            "external_identities",
            identity.id,
            { contentHash: hash, lastSeenAt: ctx.now().toISOString() },
            { audit: false },
          );
        } else {
          await q.insert(
            ctx,
            "external_identities",
            {
              connectionId,
              externalId: record.externalId,
              externalType: record.externalType,
              // Recorded as a candidate pointing at nothing until a person or
              // a matching rule resolves it. An identity that guessed which
              // person a CRM record was would merge two people on a shared
              // surname.
              entityType: "person",
              entityId: record.externalId,
              contentHash: hash,
              firstSeenAt: ctx.now().toISOString(),
              lastSeenAt: ctx.now().toISOString(),
            },
            { audit: false },
          );
        }
      }

      const runRow = await q.insert(
        ctx,
        "sync_runs",
        {
          connectionId,
          resource,
          direction: connection.semantics.direction,
          startedAt,
          finishedAt: ctx.now().toISOString(),
          outcome: conflicts.length > 0 ? "partial" : "completed",
          recordsRead: records.length,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsSkipped: skipped,
          conflictsRaised: conflicts.length,
          summary: `Read ${records.length} records: ${created} new, ${updated} changed, ${skipped} unchanged or unmapped, ${conflicts.length} refused because Pegasus holds a value somebody stood behind.`,
        },
        { audit: false },
      );

      await q.update(ctx, "integration_connections", connectionId, {
        status: "active",
        lastSyncedAt: ctx.now().toISOString(),
        consecutiveFailures: 0,
      });

      return { run: mapRun(runRow), conflicts };
    },

    async recordWebhook(ctx, connectionId, input) {
      const connection = await q.maybeOne(ctx, "integration_connections", { id: connectionId });
      if (!connection) return { accepted: false, reason: "No such connection." };

      const duplicate = await q.maybeOne(ctx, "webhook_events", {
        connection_id: connectionId,
        provider_event_id: input.providerEventId,
      });
      // A webhook delivered twice is normal. A handler that assumed otherwise
      // would double-count a donation.
      if (duplicate) return { accepted: false, reason: "Already received. Ignored." };

      await q.insert(
        ctx,
        "webhook_events",
        {
          connectionId,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          receivedAt: ctx.now().toISOString(),
          payloadHash: contentHashOf(input.payload),
          status: "received",
        },
        { audit: false },
      );
      return { accepted: true };
    },

    async webhooks(ctx, connectionId) {
      const rows = await q.many(ctx, "webhook_events", { connection_id: connectionId }, {
        order: { column: "received_at", ascending: false },
      });
      return rows.map(mapWebhook);
    },
  };
}
