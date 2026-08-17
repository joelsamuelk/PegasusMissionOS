import type {
  CommunicationChannel,
  EntityReference,
  ISODate,
  UUID,
} from "@/types/domain";

/**
 * The communication provider boundary.
 *
 * **Declaration only.** No provider is implemented in this phase, and none
 * should be until the relationship model is trustworthy — attaching email to
 * the wrong person is worse than not attaching it at all.
 *
 * The boundary exists now because it constrains the core model. Two rules
 * follow from it and are already honoured by `Interaction`:
 *
 * 1. **No provider identifier enters a core entity.** Gmail message IDs,
 *    Microsoft Graph IDs and thread IDs live in `ProviderMessageMap`, keyed by
 *    `(connectionId, providerMessageId)`. A core `Interaction` never knows
 *    which vendor delivered it — only that its `source` was `provider_sync`.
 *
 * 2. **That same key is the idempotency key.** Re-running a sync must not
 *    duplicate an interaction, and must not require a full re-read to know so.
 *
 * Pegasus is not trying to replace the user's inbox. The objective is to
 * surface mission-relevant communication inside the relationship and workflow
 * context, and to record what was sent.
 */

export type CommunicationCapability =
  | "read_messages"
  | "read_threads"
  | "send"
  | "reply"
  | "incremental_sync"
  | "attachments"
  | "calendar_events";

export interface ProviderConnection {
  id: UUID;
  organisationId: UUID;
  providerId: string;
  /** The internal user whose account authorised this connection. */
  userId: UUID;
  /** Provider-side account label, e.g. the connected mailbox address. */
  accountLabel: string;
  status: "active" | "reauthorisation_required" | "revoked";
  connectedAt: ISODate;
  /** Opaque cursor for incremental sync. Provider-specific, never parsed. */
  syncCursor?: string;
  lastSyncedAt?: ISODate;
}

/** Provider-neutral message shape produced by normalisation. */
export interface NormalisedMessage {
  providerMessageId: string;
  providerThreadId?: string;
  channel: CommunicationChannel;
  direction: "inbound" | "outbound";
  sentAt: ISODate;
  subject: string;
  bodyPreview: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  attachments: { fileName: string; sizeKb?: number; contentType?: string }[];
}

/**
 * The provider ID map. Kept out of the domain deliberately — see rule 1 above.
 * The unique constraint on `(connectionId, providerMessageId)` is what makes
 * sync idempotent.
 */
export interface ProviderMessageMap {
  id: UUID;
  organisationId: UUID;
  connectionId: UUID;
  providerMessageId: string;
  providerThreadId?: string;
  /** The Pegasus record this provider message became. */
  interactionId: UUID;
  syncedAt: ISODate;
}

export interface SyncResult {
  connectionId: UUID;
  messagesRead: number;
  interactionsCreated: number;
  /** Already-seen messages skipped by the idempotency key. */
  duplicatesSkipped: number;
  /** Associations Pegasus proposed but did not apply. */
  associationsSuggested: number;
  errors: string[];
  nextCursor?: string;
}

export interface SendRequest {
  connectionId: UUID;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  replyToProviderMessageId?: string;
  /** What this message is about, recorded on the resulting interaction. */
  links: EntityReference[];
  /**
   * The user who authorised the send. Required: Pegasus never sends an
   * external communication without an authorised human action.
   */
  approvedByUserId: UUID;
}

export interface SendResult {
  providerMessageId: string;
  sentAt: ISODate;
  interactionId: UUID;
}

export interface CommunicationProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: CommunicationCapability[];

  connect(input: { organisationId: UUID; userId: UUID; code: string }): Promise<ProviderConnection>;
  disconnect(connectionId: UUID): Promise<void>;

  /** Incremental where the provider supports it; the cursor is opaque. */
  sync(connection: ProviderConnection): Promise<SyncResult>;

  send?(request: SendRequest): Promise<SendResult>;
}

export interface EmailProvider extends CommunicationProvider {
  listMessages(connection: ProviderConnection, since?: ISODate): Promise<NormalisedMessage[]>;
  getThread(connection: ProviderConnection, providerThreadId: string): Promise<NormalisedMessage[]>;
  reply(request: SendRequest): Promise<SendResult>;
}

/**
 * Registry of configured providers.
 *
 * Empty by design. When Microsoft 365 and Gmail land they register here, and
 * nothing else in the application changes: callers depend on the interface.
 */
export function listCommunicationProviders(): CommunicationProvider[] {
  return [];
}
