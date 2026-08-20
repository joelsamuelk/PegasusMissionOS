-- Pegasus Mission OS: strategy as a node, and two more statement kinds.
--
-- MG-1 / SC6, plus the `ClaimKind` extension the expansion brief §4 requires.

-- ---------------------------------------------------------------------------
-- Strategic priorities
--
-- Previously `organisation_profiles.strategic_priorities`, an attested string
-- array. It could describe a priority and could not connect one to anything,
-- so "which programmes depend on funding ending this year?" and "what would
-- happen if this funder did not renew?" — both traversals from strategy down
-- through delivery to money — had no starting node.
--
-- The profile field is retained. It becomes the `Attested<T>` projection, so
-- the migration is priority-by-priority rather than one irreversible commit,
-- exactly as 0004 did for the other profile fields.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'strategic_priority_status') then
    create type strategic_priority_status as enum (
      'proposed', 'active', 'achieved', 'paused', 'retired'
    );
  end if;
end $$;

create table if not exists strategic_priorities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  description text,
  period_label text,
  display_order integer not null default 0,
  status strategic_priority_status not null default 'active',
  owner_id uuid references users(id),
  -- Where this priority's provenance lives, once it is claim-backed.
  claim_id uuid references claims(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);
create index if not exists strategic_priorities_org_idx
  on strategic_priorities (organisation_id, status, display_order);

alter table strategic_priorities enable row level security;
drop policy if exists strategic_priorities_member_all on strategic_priorities;
create policy strategic_priorities_member_all on strategic_priorities for all
  using (is_org_member(organisation_id))
  with check (is_org_member(organisation_id));

drop trigger if exists strategic_priorities_set_updated_at on strategic_priorities;
create trigger strategic_priorities_set_updated_at
  before update on strategic_priorities
  for each row execute function set_updated_at();

-- Now that the table exists, the allocation column added in 0018 can be a real
-- foreign key rather than a bare uuid.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financial_allocations_strategic_priority_fkey') then
    alter table financial_allocations
    add constraint financial_allocations_strategic_priority_fkey
    foreign key (strategic_priority_id)
  references strategic_priorities(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Two more statement kinds
--
-- INFERENCE differs from CALCULATION in what it can offer as proof: a
-- calculation shows its arithmetic, an inference can only show what it
-- reasoned from. HYPOTHESIS differs from ASSUMPTION in direction: an
-- assumption is adopted so work can proceed and is believed until
-- contradicted, a hypothesis is advanced in order to be tested and is not yet
-- believed at all.
--
-- Ordering note: `alter type ... add value` cannot be followed by a use of the
-- new value in the same transaction on PostgreSQL. Nothing here uses them, so
-- this is safe; a later migration that inserts rows with these kinds must run
-- separately.
--
-- The enum's declaration order does not carry meaning. The ordinal scale that
-- `effectiveClaimKind` compares on lives in `src/lib/knowledge/kind.ts`,
-- because the weakest-link rule is behaviour rather than storage.
-- ---------------------------------------------------------------------------
alter type claim_kind add value if not exists 'inference' after 'calculation';
alter type claim_kind add value if not exists 'hypothesis' after 'assumption';
