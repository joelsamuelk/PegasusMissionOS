-- Pegasus Mission OS: relationships, interactions and commitments.
--
-- Additive. No existing table is dropped and no existing column is removed:
-- `funders.contact_name` / `contact_email`, `grants.funder_contact` and
-- `programmes.delivery_partners` remain as display fallbacks until the
-- backfill described in docs/RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md §3
-- has run and every read path is migrated.
--
-- The tenant key is `organisation_id`, as everywhere else, so the existing
-- `is_org_member()` helper and RLS model apply unchanged.

-- Enums ---------------------------------------------------------------------

create type external_organisation_type as enum (
  'funder', 'foundation', 'charity', 'ngo', 'social_enterprise', 'corporate',
  'government', 'local_authority', 'university', 'research_institution',
  'delivery_partner', 'supplier', 'consultancy', 'community_organisation',
  'network', 'other'
);
create type relationship_status as enum (
  'prospect', 'active', 'dormant', 'former', 'archived'
);
create type relationship_health_state as enum (
  'active', 'established', 'developing', 'dormant', 'needs_attention'
);
create type interaction_type as enum (
  'email', 'meeting', 'call', 'message', 'event', 'introduction', 'note',
  'proposal', 'visit', 'other'
);
create type interaction_direction as enum ('inbound', 'outbound', 'internal');
create type interaction_source as enum ('manual', 'imported', 'provider_sync');
create type commitment_direction as enum ('we_owe', 'they_owe', 'mutual');
-- Note: no 'overdue'. Overdue is derived from due_at, so it cannot go stale
-- between runs of a job that would otherwise have to maintain it.
create type commitment_status as enum ('open', 'completed', 'cancelled');
create type consent_basis as enum (
  'consent', 'legitimate_interest', 'contract', 'legal_obligation', 'not_recorded'
);
create type contact_point_kind as enum ('email', 'phone');

-- External organisations ----------------------------------------------------

create table external_organisations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  legal_name text,
  type external_organisation_type not null default 'other',
  website text,
  charity_number text,
  company_number text,
  location_city text,
  location_region text,
  location_country text,
  description text,
  tags text[] not null default '{}',
  -- Provenance for enriched public data. Enrichment without a source is not
  -- evidence, it is hearsay.
  enrichment_source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,
  -- Duplicate resolution: set when this record is merged into another. The row
  -- is kept so existing references remain resolvable.
  merged_into uuid references external_organisations(id)
);
create index idx_xorgs_org on external_organisations(organisation_id);
create index idx_xorgs_name on external_organisations(organisation_id, lower(name));

-- The funder bridge. "Funder" is a role an external organisation plays.
alter table funders
  add column external_organisation_id uuid references external_organisations(id) on delete set null;
create index idx_funders_xorg on funders(external_organisation_id);

-- People --------------------------------------------------------------------
--
-- Distinct from `users`, who are internal and authenticate. Deliberately no
-- date of birth, address, household or wealth column: personal data requires a
-- lawful basis first, not an available column.

create table people (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  job_title text,
  primary_external_organisation_id uuid references external_organisations(id) on delete set null,
  location_city text,
  location_region text,
  location_country text,
  -- Operational contact, marketing and fundraising rest on different lawful
  -- bases, so they are separate columns rather than one opt-in flag.
  preferred_channel text,
  email_allowed boolean not null default true,
  phone_allowed boolean not null default true,
  sms_allowed boolean not null default false,
  marketing_allowed boolean not null default false,
  fundraising_allowed boolean not null default false,
  do_not_contact boolean not null default false,
  communication_notes text,
  consent_basis consent_basis not null default 'not_recorded',
  consent_source text,
  consent_recorded_at timestamptz,
  consent_review_due_at timestamptz,
  consent_jurisdiction text,
  consent_evidence_type text,
  consent_evidence_id uuid,
  tags text[] not null default '{}',
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,
  merged_into uuid references people(id)
);
create index idx_people_org on people(organisation_id);
create index idx_people_xorg on people(primary_external_organisation_id);

-- Multiple addresses per person: the wrong one is worse than none.
create table contact_points (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  kind contact_point_kind not null,
  value text not null,
  label text,
  is_primary boolean not null default false,
  verification verification_state not null default 'provided',
  created_at timestamptz not null default now()
);
create index idx_contact_points_person on contact_points(person_id);
-- Identity resolution matches on the normalised value, so index it that way.
create index idx_contact_points_value on contact_points(organisation_id, lower(value));

-- Relationships -------------------------------------------------------------

create table relationships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  external_organisation_id uuid references external_organisations(id) on delete cascade,
  owner_id uuid references users(id) on delete set null,
  status relationship_status not null default 'prospect',
  started_at date,
  next_action text,
  next_action_at date,
  -- A human override always beats the computed state, and always carries a
  -- reason: an unexplained override is not auditable.
  health_override_state relationship_health_state,
  health_override_reason text,
  health_override_by uuid references users(id),
  health_override_at timestamptz,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,
  -- Exactly one subject.
  constraint relationship_subject check (
    (person_id is not null and external_organisation_id is null)
    or (person_id is null and external_organisation_id is not null)
  ),
  -- An override without a reason is rejected at the database, not just the UI.
  constraint relationship_override_reason check (
    health_override_state is null or health_override_reason is not null
  )
);
create index idx_relationships_org on relationships(organisation_id);
create unique index idx_relationships_person on relationships(person_id)
  where person_id is not null;
create unique index idx_relationships_xorg on relationships(external_organisation_id)
  where external_organisation_id is not null;

-- Roles are rows, never boolean columns, so the taxonomy extends without a
-- migration and a party can hold as many roles as it actually holds.
create table relationship_roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  relationship_id uuid not null references relationships(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (relationship_id, role)
);
create index idx_rel_roles on relationship_roles(relationship_id);

-- The Mission Graph edge: relationship → any entity, with the role it plays
-- in that specific context.
create table relationship_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  relationship_id uuid not null references relationships(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  role text,
  note text,
  created_at timestamptz not null default now(),
  unique (relationship_id, entity_type, entity_id, role)
);
create index idx_rel_links_rel on relationship_links(relationship_id);
create index idx_rel_links_entity on relationship_links(entity_type, entity_id);

-- Interactions --------------------------------------------------------------

create table interactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  type interaction_type not null,
  direction interaction_direction not null,
  channel text,
  occurred_at timestamptz not null,
  subject text not null,
  summary text,
  source interaction_source not null default 'manual',
  recorded_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_interactions_org on interactions(organisation_id, occurred_at desc);

create table interaction_participants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  interaction_id uuid not null references interactions(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  external_organisation_id uuid references external_organisations(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  constraint participant_subject check (
    num_nonnulls(person_id, external_organisation_id, user_id) = 1
  )
);
create index idx_int_participants on interaction_participants(interaction_id);
create index idx_int_participants_person on interaction_participants(person_id);
create index idx_int_participants_xorg on interaction_participants(external_organisation_id);

create table interaction_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  interaction_id uuid not null references interactions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  unique (interaction_id, entity_type, entity_id)
);
create index idx_int_links_entity on interaction_links(entity_type, entity_id);

-- Commitments ---------------------------------------------------------------

create table commitments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  description text,
  direction commitment_direction not null,
  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  owner_id uuid references users(id) on delete set null,
  due_at date,
  status commitment_status not null default 'open',
  -- Where it came from: the interaction, meeting or agreement.
  source_entity_type text,
  source_entity_id uuid,
  -- Set when a human confirmed an AI-extracted candidate. An unconfirmed
  -- suggestion is never an organisational commitment.
  confirmed_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);
create index idx_commitments_org on commitments(organisation_id, status);
create index idx_commitments_due on commitments(organisation_id, due_at)
  where status = 'open';
create index idx_commitments_xorg on commitments(external_organisation_id);
create index idx_commitments_person on commitments(person_id);

-- Provider connections ------------------------------------------------------
--
-- Declared now, unused until Phase 5. The point of separating these tables is
-- that no provider identifier ever enters a core entity: an `interaction` knows
-- its `source` was a sync, not which vendor delivered it. The unique key on
-- (connection_id, provider_message_id) is what makes sync idempotent.

create table communication_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  provider_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  account_label text not null,
  status text not null default 'active',
  sync_cursor text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (organisation_id, provider_id, account_label)
);

create table provider_message_map (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references communication_connections(id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  interaction_id uuid not null references interactions(id) on delete cascade,
  synced_at timestamptz not null default now(),
  unique (connection_id, provider_message_id)
);
create index idx_pmm_thread on provider_message_map(connection_id, provider_thread_id);

-- Row Level Security --------------------------------------------------------

alter table external_organisations enable row level security;
alter table people enable row level security;
alter table contact_points enable row level security;
alter table relationships enable row level security;
alter table relationship_roles enable row level security;
alter table relationship_links enable row level security;
alter table interactions enable row level security;
alter table interaction_participants enable row level security;
alter table interaction_links enable row level security;
alter table commitments enable row level security;
alter table communication_connections enable row level security;
alter table provider_message_map enable row level security;

-- Same isolation model as every other tenant-owned table: an active member of
-- the owning organisation, and nobody else. Communication content is the
-- highest-consequence leak in the product, so none of these tables is exempt.
do $$
declare
  t text;
  relationship_tables text[] := array[
    'external_organisations', 'people', 'contact_points', 'relationships',
    'relationship_roles', 'relationship_links', 'interactions',
    'interaction_participants', 'interaction_links', 'commitments',
    'communication_connections', 'provider_message_map'
  ];
begin
  foreach t in array relationship_tables loop
    execute format(
      'create policy %I_member_all on %I for all using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));',
      t, t
    );
  end loop;
end $$;
