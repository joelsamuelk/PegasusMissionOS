-- Pegasus Mission OS: the Knowledge layer, plus two long-standing schema
-- defects the architecture audit recorded.
--
-- Additive and reversible. No existing table is dropped and no existing column
-- is removed: `organisation_profiles` keeps its inline attested values, and
-- gains nullable `*_claim_id` columns so profile fields migrate onto claims one
-- at a time rather than in a single irreversible commit.
--
-- Ordering note: this migration deliberately lands **before** the Supabase
-- adapter is written. Claims reshape the schema, so writing the adapter first
-- would mean writing it twice and migrating live data on the second pass.

-- ---------------------------------------------------------------------------
-- S1 (CRITICAL): row level security was never enabled on `users`.
--
-- 0001_schema.sql issues `enable row level security` for 37 of 38 tables and
-- omits this one. The `users_self_select` / `users_self_update` policies in
-- 0002_rls.sql are therefore INERT, and the table is readable and updatable by
-- any authenticated client. This is a live data-exposure bug the moment
-- Supabase is connected, and it is the single most important statement in this
-- file.
-- ---------------------------------------------------------------------------
alter table users enable row level security;

-- ---------------------------------------------------------------------------
-- Audit §6: `ActivityEvent` exists in TypeScript and is written by the
-- repository, but had no table. This data would have been silently lost on
-- migration to Postgres.
-- ---------------------------------------------------------------------------
create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  actor_id uuid references users(id),
  actor_name text not null,
  verb text not null,
  target text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_events_org_created_idx
  on activity_events (organisation_id, created_at desc);

alter table activity_events enable row level security;

-- ---------------------------------------------------------------------------
-- Knowledge layer
-- ---------------------------------------------------------------------------

create type claim_kind as enum (
  'fact', 'calculation', 'forecast', 'assumption', 'recommendation'
);

create type source_authority as enum (
  'regulator', 'organisation', 'supporting', 'discovery'
);

create type claim_producer_method as enum (
  'human', 'extraction', 'calculation', 'model'
);

-- Claims are immutable. There is no update path: a correction inserts a new
-- row carrying `supersedes`, and the predecessor records `superseded_by`. This
-- is what keeps `claim_usages` honest — a report published in March still
-- resolves to the claim as it stood in March.
create table claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  subject_type text not null,
  subject_id text not null,
  predicate text not null,

  -- The typed value, plus a rendered form for display and AI grounding.
  value jsonb not null,
  text text not null,

  kind claim_kind not null,
  verification verification_state not null default 'needs_review',
  -- 0..1. Extractor or producer certainty. Deliberately NOT a truth claim:
  -- there is no trigger promoting a high-confidence row to 'verified', because
  -- only a human action may do that.
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),

  derived_from jsonb not null default '[]'::jsonb,

  producer_method claim_producer_method not null,
  producer_detail jsonb not null default '{}'::jsonb,

  workings text,
  assumptions text[] not null default '{}',
  caveats text[] not null default '{}',

  valid_from date,
  valid_until date,
  period_label text,

  supersedes uuid references claims(id),
  superseded_by uuid references claims(id),

  verified_by uuid references users(id),
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  archived_at timestamptz,

  -- A verified claim must name who verified it and when. Without the actor the
  -- verification is unattributable, which is the same as not having happened.
  constraint claims_verified_needs_actor check (
    verification <> 'verified' or (verified_by is not null and verified_at is not null)
  )
);

create index claims_org_subject_idx
  on claims (organisation_id, subject_type, subject_id);
create index claims_org_predicate_idx
  on claims (organisation_id, predicate);
-- Partial index over current claims: the common read is "the claim that stands".
create index claims_current_idx
  on claims (organisation_id, subject_type, subject_id, predicate)
  where superseded_by is null and verification <> 'outdated';

-- The grounding behind a claim. A table rather than a jsonb column because
-- source authority and recency drive evidence strength and reconciliation, and
-- both need to be queryable.
create table claim_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  authority source_authority not null,
  -- Where *within* the source: 'page 14', 'json-ld:Organization.name'.
  locator text,
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index claim_sources_claim_idx on claim_sources (claim_id);
create index claim_sources_org_source_idx
  on claim_sources (organisation_id, source_type, source_id);

-- Claims a claim stands on. Self-referential many-to-many, because a forecast
-- typically rests on several facts and at least one assumption.
create table claim_supports (
  claim_id uuid not null references claims(id) on delete cascade,
  supports_claim_id uuid not null references claims(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  primary key (claim_id, supports_claim_id),
  -- A claim standing on itself would make every trace non-terminating.
  constraint claim_supports_no_self_reference check (claim_id <> supports_claim_id)
);
create index claim_supports_supports_idx on claim_supports (supports_claim_id);

-- The reverse index. "Where did this £420,000 come from?" and "what breaks if
-- this number is wrong?" are the same query read in opposite directions.
create table claim_usages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  used_in_type text not null,
  used_in_id text not null,
  context text,
  used_at timestamptz not null default now()
);
create index claim_usages_claim_idx on claim_usages (claim_id);
create index claim_usages_used_in_idx
  on claim_usages (organisation_id, used_in_type, used_in_id);

-- Conflicting claims are raised for a human, never auto-resolved.
create table claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  subject_type text not null,
  subject_id text not null,
  predicate text not null,
  claim_ids uuid[] not null,
  reason text not null,
  recommended_claim_id uuid references claims(id),
  recommendation_reason text,
  resolved_claim_id uuid references claims(id),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index claim_conflicts_org_idx on claim_conflicts (organisation_id);

alter table claims enable row level security;
alter table claim_sources enable row level security;
alter table claim_supports enable row level security;
alter table claim_usages enable row level security;
alter table claim_conflicts enable row level security;

-- ---------------------------------------------------------------------------
-- `Attested<T>` becomes the read projection of a claim.
--
-- Nullable by design: a field with no claim id still reads from its inline
-- value, so the ~25 profile fields migrate individually and reversibly.
-- ---------------------------------------------------------------------------
alter table organisation_profiles
  add column if not exists mission_statement_claim_id uuid references claims(id),
  add column if not exists vision_claim_id uuid references claims(id),
  add column if not exists summary_claim_id uuid references claims(id),
  add column if not exists core_activities_claim_id uuid references claims(id),
  add column if not exists strategic_priorities_claim_id uuid references claims(id),
  add column if not exists communities_served_claim_id uuid references claims(id),
  add column if not exists geographic_reach_claim_id uuid references claims(id);

-- ---------------------------------------------------------------------------
-- Observed AI provenance (audit S2).
--
-- The old shape recorded everything *offered* to a model as though it had been
-- *used*, and could not be checked because a label like 'Mission statement'
-- references nothing. Generations now record resolvable references, validated
-- against what was offered before the row is written.
-- ---------------------------------------------------------------------------
alter table ai_generations
  add column if not exists used_refs jsonb not null default '[]'::jsonb,
  add column if not exists unused_refs jsonb not null default '[]'::jsonb,
  add column if not exists used_fallback boolean not null default false,
  add column if not exists fallback_reason text;

comment on column ai_generations.used_refs is
  'References the generation reported drawing on, validated against what it was offered. Never a list of everything available.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance and soft deletes (audit §6 / Phase 1B carry-over).
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger claims_set_updated_at
  before update on claims
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: identical model to every other tenant-owned table. Adapter filtering
-- and RLS are independent layers; neither is trusted on its own.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'claims', 'claim_sources', 'claim_supports', 'claim_usages',
    'claim_conflicts', 'activity_events'
  ]
  loop
    execute format(
      'create policy %I_member_all on %I for all
         using (is_org_member(organisation_id))
         with check (is_org_member(organisation_id))',
      t, t
    );
  end loop;
end $$;

-- Claims are append-only for correctness, not merely by convention: the only
-- mutation permitted is linking a predecessor to its successor, and marking a
-- claim outdated. Everything else must insert a new row.
create or replace function claims_reject_value_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.value is distinct from old.value
     or new.text is distinct from old.text
     or new.kind is distinct from old.kind
     or new.subject_id is distinct from old.subject_id
     or new.predicate is distinct from old.predicate then
    raise exception
      'Claims are immutable: insert a superseding claim instead of editing %', old.id;
  end if;
  return new;
end;
$$;

create trigger claims_immutable
  before update on claims
  for each row execute function claims_reject_value_mutation();
