-- Pegasus Mission OS: the integration hub.
--
-- MG-11. Build spec Slice I.
--
-- The strategic point, from the brief: Mission OS should be able to become the
-- intelligence layer around an organisation's existing systems before becoming
-- the system of record for everything. A charity with a CRM it likes should be
-- able to start using Pegasus for programme, funding, evidence and impact work
-- without a risky day-one migration.
--
-- Two rules make that survivable, and both are tables rather than conventions.
--
--   **No provider identifier enters a core entity.** There is no `beacon_id`
--   on `people`. `external_identities` says that provider record X on this
--   connection is Pegasus entity Y, and `(connection_id, external_id)` is
--   unique — which is also the idempotency key, so re-running a sync cannot
--   duplicate a record and does not need a full re-read to know so. This is
--   the rule `server/communications/provider.ts` set for email, generalised.
--
--   **Nothing silently overwrites a human.** A sync that would change a value
--   somebody verified writes a `sync_conflicts` row and changes nothing. Not a
--   setting; what the engine does.
--
-- One thing this schema deliberately has nowhere to put: **a credential.**
-- `credential_ref` points at wherever the secret actually lives. A token in a
-- tenant-readable row is a token every member of the organisation can read,
-- and a column that could hold one eventually would.

create type integration_category as enum (
  'crm', 'accounting', 'payments', 'email', 'calendar', 'fundraising',
  'storage', 'forms', 'banking'
);

create type sync_direction as enum ('inbound', 'outbound', 'bidirectional');
create type source_of_truth as enum ('external', 'pegasus', 'field_level');
create type conflict_behaviour as enum (
  'refuse', 'external_wins', 'pegasus_wins', 'newest_wins'
);
create type deletion_behaviour as enum ('ignore', 'archive', 'flag');
create type migration_mode as enum ('connect', 'migrate');

create type connection_status as enum (
  'pending', 'active', 'reauthorisation_required', 'rate_limited', 'failing', 'revoked'
);

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- The provider's registry id, e.g. 'beacon'. Not a foreign key: the registry
  -- is code, because a capability list is a claim about a third party's
  -- product and belongs where it can carry a comment citing the source.
  integration_id text not null,
  account_label text not null,

  mode migration_mode not null default 'connect',

  -- The six things the brief requires every integration to define. Not null,
  -- so a connection cannot exist without somebody having answered all of them.
  direction sync_direction not null default 'inbound',
  source_of_truth source_of_truth not null default 'external',
  conflict_behaviour conflict_behaviour not null default 'refuse',
  deletion_behaviour deletion_behaviour not null default 'flag',
  freshness_minutes integer not null default 60,
  failure_threshold integer not null default 3,

  status connection_status not null default 'pending',

  -- A reference, never a secret. See the note at the top of this file.
  credential_ref text,

  connected_by uuid references users(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  unique (organisation_id, integration_id, account_label)
);

create trigger integration_connections_set_updated_at
  before update on integration_connections
  for each row execute function set_updated_at();

comment on column integration_connections.credential_ref is
  'A pointer to wherever the secret lives. Never the secret: a token in a '
  'tenant-readable row is a token every member of the organisation can read.';

-- ---------------------------------------------------------------------------
-- The bridge that keeps provider ids out of core entities
-- ---------------------------------------------------------------------------

create table if not exists external_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  -- Opaque. Never parsed, never displayed as an identifier to a user.
  external_id text not null,
  external_type text not null,

  entity_type text not null,
  entity_id uuid not null,

  -- Answers "did this record change?" in one comparison rather than a
  -- field-by-field diff, which matters against a provider limited to 300
  -- requests a minute.
  content_hash text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  external_deleted_at timestamptz,

  -- The idempotency key. Re-running a sync cannot duplicate a record.
  unique (connection_id, external_id, external_type)
);

create index if not exists external_identities_entity_idx
  on external_identities (organisation_id, entity_type, entity_id);

create table if not exists sync_cursors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  resource text not null,
  -- Opaque and provider-specific. Pegasus stores it and hands it back; parsing
  -- one is how an integration breaks on a vendor's internal change.
  cursor text not null,
  updated_at timestamptz not null default now(),

  unique (connection_id, resource)
);

-- ---------------------------------------------------------------------------
-- What happened, and what was refused
-- ---------------------------------------------------------------------------

create type sync_run_outcome as enum ('completed', 'partial', 'failed', 'refused');

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  resource text not null,
  direction sync_direction not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome sync_run_outcome not null,

  records_read integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  conflicts_raised integer not null default 0,

  -- Always populated. A run that explains nothing cannot be diagnosed, and a
  -- sync nobody can diagnose is one an organisation stops trusting.
  summary text not null,
  error text
);

create index if not exists sync_runs_connection_idx
  on sync_runs (organisation_id, connection_id, started_at desc);

create type conflict_resolution as enum ('kept_pegasus', 'took_external', 'manual');

-- The record of the rule the brief states most firmly. Holds both values, so
-- a person resolving it can see what each side says rather than being asked to
-- pick between two labels.
create table if not exists sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  entity_type text not null,
  entity_id uuid not null,
  field text not null,

  pegasus_value text not null,
  pegasus_verification verification_state not null,
  external_value text not null,

  detected_at timestamptz not null default now(),
  resolution conflict_resolution,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolution_note text,

  -- Resolving a conflict is a decision about which of two systems was right.
  -- One recorded without a person is not a resolution.
  constraint sync_conflicts_resolution_needs_person check (
    resolution is null or resolved_by is not null
  )
);

create index if not exists sync_conflicts_open_idx
  on sync_conflicts (organisation_id, connection_id)
  where resolution is null;

-- ---------------------------------------------------------------------------
-- Webhooks and field mappings
-- ---------------------------------------------------------------------------

create type webhook_status as enum ('received', 'processed', 'ignored', 'failed');

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  provider_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  payload_hash text not null,

  status webhook_status not null default 'received',
  processed_at timestamptz,
  note text,

  -- A webhook delivered twice is normal. A handler that assumed otherwise
  -- would double-count a donation.
  unique (connection_id, provider_event_id)
);

-- Per connection, not per provider. Some providers generate their API schema
-- from each customer's own configuration — Beacon does — so field keys differ
-- between two charities using the same product. A mapping hardcoded per
-- provider would work for the first customer and fail for the second.
create table if not exists integration_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  external_type text not null,
  external_field text not null,
  entity_type text not null,
  field text not null,

  -- Off unless somebody said otherwise. A mapping that could write by default
  -- would make a read-only connection capable of changing another system.
  writable boolean not null default false,

  -- Discovery produces candidates. A field mapping guessed from a name and
  -- then trusted is how a postcode ends up in a phone number column.
  verification verification_state not null default 'needs_review',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (connection_id, external_type, external_field, entity_type, field)
);

create trigger integration_mappings_set_updated_at
  before update on integration_mappings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table integration_connections enable row level security;
alter table external_identities enable row level security;
alter table sync_cursors enable row level security;
alter table sync_runs enable row level security;
alter table sync_conflicts enable row level security;
alter table webhook_events enable row level security;
alter table integration_mappings enable row level security;

create policy integration_connections_member_all on integration_connections for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy external_identities_member_all on external_identities for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy sync_cursors_member_all on sync_cursors for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy integration_mappings_member_all on integration_mappings for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy sync_conflicts_member_all on sync_conflicts for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Runs and webhook receipts are the record of what a machine did without a
-- person present. Insertable and readable and never editable, on the same
-- reasoning as audit events and automation runs.
create policy sync_runs_member_read on sync_runs for select
  using (is_org_member(organisation_id));
create policy sync_runs_member_insert on sync_runs for insert
  with check (is_org_member(organisation_id));

create policy webhook_events_member_read on webhook_events for select
  using (is_org_member(organisation_id));
create policy webhook_events_member_insert on webhook_events for insert
  with check (is_org_member(organisation_id));
create policy webhook_events_member_mark on webhook_events for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on table external_identities is
  'The bridge that keeps provider identifiers out of core entities. There is '
  'no beacon_id on people. (connection_id, external_id) is unique and is the '
  'idempotency key for every sync.';
comment on table sync_conflicts is
  'A change the sync refused to make. Holds both values, so a person can see '
  'what each side says rather than pick between two labels.';
