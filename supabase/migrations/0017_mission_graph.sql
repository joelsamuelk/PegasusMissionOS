-- Pegasus Mission OS: the Mission Graph edge primitive, and the promotion of
-- activities and outputs from free text to entities.
--
-- MG-1. Additive and reversible: no table is dropped, no column is removed.
-- `programmes.activities` and `programmes.outputs` never existed in Postgres —
-- they were TypeScript string arrays over tables that were already here — so
-- this migration is mostly the schema finally being *used* rather than changed.
--
-- Why this lands before the Supabase adapter, again: MG-1 is the last
-- schema-shaping phase. Writing the adapter against today's shape and
-- reshaping afterwards means writing it twice and migrating live data on the
-- second pass. See docs/MISSION_OS_EXPANSION_PLAN.md §3.

-- ---------------------------------------------------------------------------
-- The Relation primitive
--
-- Strong, single-meaning, high-traffic edges stay as foreign keys
-- (indicators.outcome_id, grants.application_id). This table carries the
-- many-to-many, cross-domain edges whose *existence is itself information*:
-- this output contributes to that outcome, this evidence supports that
-- measurement, this funder requires that indicator.
--
-- `from_type` / `to_type` are text rather than an enum deliberately. The
-- addressable set is `EntityType` in the TypeScript model, which grows every
-- phase, and an enum would make each addition a migration with a lock. The
-- constraint that matters is not which kinds exist but that both endpoints are
-- in the tenant, and no enum can express that.
-- ---------------------------------------------------------------------------
create table if not exists relations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,

  kind text not null,
  -- A qualifier within the kind. For `party_to` this carries the relationship
  -- role; for `contributes_to` it is normally null.
  role text,

  -- 0..1 for attributions that are not whole. Deliberately nullable and
  -- deliberately not defaulted to 1: "we did not say" and "we said all of it"
  -- are different statements, and a default would silently convert the first
  -- into the second.
  weight numeric check (weight is null or (weight >= 0 and weight <= 1)),
  note text,

  -- The edge's own trust state. An asserted link is not a verified one.
  verification verification_state not null default 'provided',
  verified_by uuid references users(id),
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  -- An entity may not contribute to itself. Longer cycles are not preventable
  -- declaratively and are handled by the traversal, which is cycle-safe.
  constraint relations_no_self_loop check (not (from_type = to_type and from_id = to_id))
);

-- The two traversal directions, and the duplicate-edge guard.
create index if not exists relations_from_idx
  on relations (organisation_id, from_type, from_id, kind);
create index if not exists relations_to_idx
  on relations (organisation_id, to_type, to_id, kind);
create unique index if not exists relations_unique_edge_idx
  on relations (organisation_id, from_type, from_id, to_type, to_id, kind);

alter table relations enable row level security;

create trigger relations_set_updated_at
  before update on relations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Activities and outputs become entities
--
-- Both tables have existed since 0001 with three columns and no consumer,
-- while the TypeScript model carried `Programme.activities: string[]`. A
-- string cannot receive a financial allocation and cannot contribute to an
-- output, which is why five of the twelve links in the architectural
-- acceptance test were unrepresentable.
-- ---------------------------------------------------------------------------
create type activity_status as enum (
  'planned', 'active', 'paused', 'complete', 'cancelled'
);

alter table activities
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists status activity_status not null default 'active',
  add column if not exists owner_id uuid references users(id),
  add column if not exists location text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references users(id),
  add column if not exists archived_at timestamptz;

alter table outputs
  add column if not exists description text,
  add column if not exists unit text,
  add column if not exists target_value numeric,
  add column if not exists current_value numeric,
  add column if not exists reporting_period text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references users(id),
  add column if not exists archived_at timestamptz;

-- `outputs.value` predates `target_value` / `current_value` and is retained as
-- a display fallback until a backfill runs, following the same deprecation
-- pattern as funders.contact_name.
comment on column outputs.value is
  'Deprecated. Superseded by current_value; retained until backfill completes.';

create index if not exists activities_programme_idx on activities (organisation_id, programme_id);
create index if not exists outputs_programme_idx on outputs (organisation_id, programme_id);

-- ---------------------------------------------------------------------------
-- RLS. Identical model to every other tenant-owned table: adapter filtering
-- and RLS are independent layers and neither is trusted on its own.
--
-- `relations` is the first table in the schema whose rows can name any other
-- row. RLS confines the *row* to the tenant; it cannot confine what the row
-- points at, because from_id/to_id are not foreign keys and cannot be. The
-- endpoint check therefore lives in the repository, and the contract suite
-- asserts it. This is a genuine limitation of the polymorphic design and is
-- recorded here rather than assumed away.
-- ---------------------------------------------------------------------------
create policy relations_member_all on relations for all
  using (is_org_member(organisation_id))
  with check (is_org_member(organisation_id));
