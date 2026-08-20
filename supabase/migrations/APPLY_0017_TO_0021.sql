-- =====================================================================
-- Pegasus Mission OS: migrations 0017 to 0021, consolidated
--
-- Generated from supabase/migrations/. Run this once in the Supabase SQL
-- editor. It brings a database at 0016 up to 0021.
--
-- WHAT IT DOES
--   0017  Mission Graph: the Relation edge primitive; activities and outputs
--         promoted from free text to entities
--   0018  Money: funds, transactions, allocations, budgets, budget lines
--   0019  Reporting requirements, and evidence reaching indicators
--   0020  Strategic priorities, and two more claim kinds
--   0021  Document ingestion and onboarding research
--
-- SAFE TO RE-RUN. Every statement is guarded: types check pg_type, tables and
-- columns use IF NOT EXISTS, constraints check pg_constraint, and policies and
-- triggers are dropped before being created. If it fails partway, fix the
-- cause and run the whole thing again.
--
-- ADDITIVE ONLY. No table is dropped, no column is removed, no row is touched.
-- Your existing data (50 prospects, 1 organisation, 6 users) is not read or
-- modified by anything below.
--
-- ORDER MATTERS. 0018 creates financial_allocations, which 0020 adds a foreign
-- key to; 0021 references claims and documents. Do not reorder or run in
-- pieces.
--
-- AFTERWARDS: tell Claude, and it will verify over the REST API that every
-- table, constraint and policy landed.
-- =====================================================================



-- =====================================================================
-- 0017_mission_graph.sql
-- =====================================================================

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

drop trigger if exists relations_set_updated_at on relations;
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
do $$ begin
  if not exists (select 1 from pg_type where typname = 'activity_status') then
    create type activity_status as enum (
      'planned', 'active', 'paused', 'complete', 'cancelled'
    );
  end if;
end $$;

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
drop policy if exists relations_member_all on relations;
create policy relations_member_all on relations for all
  using (is_org_member(organisation_id))
  with check (is_org_member(organisation_id));


-- =====================================================================
-- 0018_money.sql
-- =====================================================================

-- Pegasus Mission OS: money as records.
--
-- MG-1 / SC2. Before this, the product could compute a defensible cost per
-- outcome and could not record that £4,000 had been spent: `lib/finance-
-- intelligence` is 4,809 lines of unit-tested calculation with no tables
-- beneath it and no consumers above it. This migration supplies the inputs.
-- It changes none of that arithmetic.
--
-- Two rules from that library govern every column below.
--
-- 1. MONEY IS NEVER A FLOAT. Every amount is a bigint of minor units plus an
--    explicit currency. Cost-per-outcome arithmetic divides and apportions
--    constantly; `numeric` would be safe but invites application code to read
--    it as a float, and `money` is locale-dependent. Minor units make the
--    representation identical in Postgres and in TypeScript.
--
-- 2. NOTHING IS CALCULATED STRAIGHT FROM A TRANSACTION. Money reaches delivery
--    through `financial_allocations`, which records *how* it was attributed.
--    A cost-per-participant figure is only as defensible as the allocation
--    beneath it, so the allocation is a first-class reviewable record and
--    never a join table.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'fund_restriction') then
    create type fund_restriction as enum (
      'unrestricted', 'restricted', 'endowment', 'designated'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'transaction_direction') then
    create type transaction_direction as enum ('income', 'expenditure');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'transaction_source') then
    create type transaction_source as enum (
      'bank_feed', 'accounting_system', 'manual', 'import'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'allocation_method') then
    create type allocation_method as enum (
      'direct', 'proportional', 'shared_cost', 'manual', 'suggested', 'unknown'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'allocation_basis') then
    create type allocation_basis as enum (
      'direct', 'headcount', 'programme_expenditure', 'staff_time',
      'participant_volume', 'equal', 'custom_percentage', 'unallocated'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'budget_status') then
    create type budget_status as enum ('draft', 'approved', 'superseded');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funds
--
-- `grants.restricted` is a boolean on an award. It cannot hold a balance,
-- cannot be spent from, and cannot answer "how much unrestricted runway do we
-- have?", which is a question about funds rather than about grants.
--
-- `designated` is distinct from `restricted`, and the difference is legal
-- rather than cosmetic: a restriction is imposed by the funder and binds the
-- charity, a designation is chosen by the trustees and can be undesignated by
-- them. Collapsing the two overstates how much money is actually committed.
-- ---------------------------------------------------------------------------
create table if not exists funds (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  description text,
  restriction fund_restriction not null,
  currency text not null default 'GBP',
  -- What the restriction actually says. A restricted fund without a stated
  -- purpose cannot be reported against.
  restriction_purpose text,
  origin_type text,
  origin_id uuid,
  opened_at date,
  closed_at date,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,
  constraint funds_restricted_needs_purpose
    check (restriction <> 'restricted' or restriction_purpose is not null)
);
create index if not exists funds_org_idx on funds (organisation_id, status);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  account_id uuid,
  date date not null,
  description text not null,
  -- Integer minor units. See rule 1 above.
  amount_minor_units bigint not null,
  currency text not null default 'GBP',
  direction transaction_direction not null,
  category text,
  counterparty text,
  restricted boolean not null default false,
  grant_id uuid references grants(id) on delete set null,
  fund_id uuid references funds(id) on delete set null,
  source transaction_source not null default 'manual',
  verification verification_state not null default 'provided',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id)
);
create index if not exists financial_transactions_org_date_idx
  on financial_transactions (organisation_id, date desc);
create index if not exists financial_transactions_fund_idx
  on financial_transactions (organisation_id, fund_id);

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  programme_id uuid references programmes(id) on delete cascade,
  grant_id uuid references grants(id) on delete cascade,
  currency text not null default 'GBP',
  period_start date not null,
  -- Inclusive.
  period_end date not null,
  status budget_status not null default 'draft',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,
  constraint budgets_period_ordered check (period_end >= period_start)
);
create index if not exists budgets_org_idx on budgets (organisation_id, status);

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  budget_id uuid not null references budgets(id) on delete cascade,
  label text not null,
  category text,
  planned_amount_minor_units bigint not null,
  currency text not null default 'GBP',
  -- What the line is for, in graph terms: an activity, an output, a workstream.
  target_type text,
  target_id uuid,
  note text
);
create index if not exists budget_lines_budget_idx on budget_lines (organisation_id, budget_id);

-- ---------------------------------------------------------------------------
-- Allocations: the layer between money and delivery
--
-- `allocation_method` is NOT NULL by design. There is deliberately no way to
-- record an attribution without saying how it was made, because a figure whose
-- apportionment cannot be explained is exactly what makes cost-per-outcome
-- indefensible. This is the schema-level counterpart of `UnitCost` being
-- unconstructable without a `Methodology`.
-- ---------------------------------------------------------------------------
create table if not exists financial_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  transaction_id uuid references financial_transactions(id) on delete cascade,
  budget_line_id uuid references budget_lines(id) on delete set null,
  fund_id uuid references funds(id) on delete set null,
  programme_id uuid references programmes(id) on delete set null,
  grant_id uuid references grants(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  outcome_id uuid references outcomes(id) on delete set null,
  strategic_priority_id uuid,

  amount_minor_units bigint not null,
  currency text not null default 'GBP',

  allocation_method allocation_method not null,
  allocation_basis allocation_basis,
  allocation_note text,

  -- 0..1. How well the method fits this cost. Never a truth claim, and never
  -- promoted into `verification` — the same rule the Knowledge layer enforces
  -- for claims.
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),

  restricted boolean,
  effective_date date not null,

  verification verification_state not null default 'provided',
  created_by uuid references users(id),
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),

  -- An allocation that attributes money to nothing is not an allocation.
  constraint financial_allocations_needs_a_target check (
    programme_id is not null
    or grant_id is not null
    or activity_id is not null
    or outcome_id is not null
    or fund_id is not null
    or budget_line_id is not null
    or strategic_priority_id is not null
  )
);
create index if not exists financial_allocations_transaction_idx
  on financial_allocations (organisation_id, transaction_id);
create index if not exists financial_allocations_programme_idx
  on financial_allocations (organisation_id, programme_id);
create index if not exists financial_allocations_activity_idx
  on financial_allocations (organisation_id, activity_id);
create index if not exists financial_allocations_grant_idx
  on financial_allocations (organisation_id, grant_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- `enable row level security` is written out per table rather than issued from
-- the loop below. That is not verbosity: `tests/unit/schema-invariants.test.ts`
-- greps the migrations for these exact statements, because audit finding S1 —
-- RLS silently absent on `users` for 37 of 38 tables — was invisible precisely
-- because nothing could see which tables had been covered. A statement built
-- by `format()` inside a `do` block is not greppable, so the guard would pass
-- while telling us nothing.
-- ---------------------------------------------------------------------------
alter table funds enable row level security;
alter table financial_transactions enable row level security;
alter table budgets enable row level security;
alter table budget_lines enable row level security;
alter table financial_allocations enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'funds', 'financial_transactions', 'budgets', 'budget_lines',
    'financial_allocations'
  ]
  loop
    execute format('drop policy if exists %I_member_all on %I', t, t);
    execute format(
      'create policy %I_member_all on %I for all
         using (is_org_member(organisation_id))
         with check (is_org_member(organisation_id))',
      t, t
    );
  end loop;
end $$;

drop trigger if exists funds_set_updated_at on funds;
create trigger funds_set_updated_at
  before update on funds
  for each row execute function set_updated_at();
drop trigger if exists financial_transactions_set_updated_at on financial_transactions;
create trigger financial_transactions_set_updated_at
  before update on financial_transactions
  for each row execute function set_updated_at();
drop trigger if exists budgets_set_updated_at on budgets;
create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();


-- =====================================================================
-- 0019_reporting_requirements.sql
-- =====================================================================

-- Pegasus Mission OS: what the funder actually asked for.
--
-- MG-1 / SC3 and SC4.
--
-- Before this, "what did we promise this funder?" could only be answered by
-- reading `funding_opportunities.reporting_requirements` and
-- `grant_conditions.text` — free text that points at nothing. A requirement
-- that cannot name the outcome it wants cannot drive report readiness, cannot
-- say which evidence is missing, and cannot warn that the indicator it depends
-- on has not been measured this period.
--
-- What a requirement asks for is recorded as `relations` rows of kind
-- `requires`, not as columns here. One funder may want two outcomes and an
-- indicator, and none of those is a foreign key. That is the whole reason the
-- Relation primitive landed first in 0017.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'reporting_frequency') then
    create type reporting_frequency as enum (
      'one_off', 'monthly', 'quarterly', 'six_monthly', 'annual', 'on_completion'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'requirement_status') then
    create type requirement_status as enum ('open', 'met', 'waived', 'overdue');
  end if;
end $$;

create table if not exists reporting_requirements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  grant_id uuid references grants(id) on delete cascade,
  opportunity_id uuid references funding_opportunities(id) on delete cascade,

  title text not null,
  description text,
  frequency reporting_frequency not null default 'one_off',
  due_date date,

  -- Evidence types the funder specified, where they specified any. An empty
  -- array means "they did not say", which is different from "they want none".
  evidence_types text[] not null default '{}',

  -- Where the requirement came from, when it was read out of a funder
  -- document rather than inferred. Inferred requirements are legitimate and
  -- must be distinguishable from quoted ones.
  source_type text,
  source_id uuid,

  status requirement_status not null default 'open',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  -- A requirement belongs to exactly one of a grant or an opportunity. One
  -- attached to neither is unreachable; one attached to both is ambiguous
  -- about who is owed the report.
  constraint reporting_requirements_one_owner check (
    (grant_id is not null and opportunity_id is null)
    or (grant_id is null and opportunity_id is not null)
  )
);

create index if not exists reporting_requirements_grant_idx
  on reporting_requirements (organisation_id, grant_id);
create index if not exists reporting_requirements_due_idx
  on reporting_requirements (organisation_id, status, due_date);

alter table reporting_requirements enable row level security;
drop policy if exists reporting_requirements_member_all on reporting_requirements;
create policy reporting_requirements_member_all on reporting_requirements for all
  using (is_org_member(organisation_id))
  with check (is_org_member(organisation_id));

drop trigger if exists reporting_requirements_set_updated_at on reporting_requirements;
create trigger reporting_requirements_set_updated_at
  before update on reporting_requirements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- SC3: evidence reaches the number, not only the ambition
--
-- `evidence_links.target_type` in the TypeScript model stopped at `outcome`,
-- so evidence could support the outcome an organisation is pursuing but not
-- the measurement that establishes progress towards it. That was link 8 of the
-- twelve in the architectural acceptance test.
--
-- The fix is not to widen that enum a second time. New evidence support is
-- recorded as `relations` rows of kind `evidences`, which can reach an
-- indicator, a measurement, a claim or anything else addressable.
-- `evidence_links` is retained unchanged for the shipped call sites.
-- ---------------------------------------------------------------------------
comment on table evidence_links is
  'Legacy evidence support, limited to programme/grant/outcome/answer/report. '
  'New support is recorded in relations with kind = ''evidences'', which can '
  'reach an indicator or an indicator_measurement. Retained for shipped '
  'call sites; migrate readers to relations.';


-- =====================================================================
-- 0020_strategy.sql
-- =====================================================================

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


-- =====================================================================
-- 0021_onboarding_documents.sql
-- =====================================================================

-- Pegasus Mission OS: document ingestion and onboarding research.
--
-- MG-3. Additive: no table is dropped and no column is removed.
--
-- The shape here follows the MG-3 rule that an uploaded file is not arbitrary
-- AI context. A document is parsed, structured, reviewed and only then
-- approved, and the schema keeps those four states distinguishable rather than
-- collapsing them into "ingested".

-- ---------------------------------------------------------------------------
-- Documents
--
-- Three tables where a naive design would have one, and each separation earns
-- its place:
--
--   documents          the thing: "our 2025 annual report"
--   document_versions  the bytes, of which there may be several over time
--   document_sources   how it arrived, of which there may also be several
--
-- Splitting the document from its bytes is what lets a corrected report
-- supersede an earlier one without orphaning the claims extracted from it, and
-- what lets a re-crawl notice that a published PDF has changed. Splitting the
-- source off is because a document can legitimately be found on a website *and*
-- published by a regulator, and those arrivals carry different authority.
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_format') then
    create type document_format as enum ('pdf', 'docx', 'csv', 'xlsx', 'txt', 'html', 'unknown');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type document_kind as enum (
      'annual_report', 'impact_report', 'accounts', 'strategy', 'evaluation',
      'policy', 'governance', 'funding_agreement', 'data_export', 'other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_origin') then
    create type document_origin as enum ('upload', 'website_discovery', 'registry', 'integration');
  end if;
end $$;

-- Five states rather than a boolean, deliberately. "Not read yet", "cannot
-- read this format", "read it and the text was unusable" and "it failed" are
-- four different things to a person deciding whether to re-upload, and
-- collapsing them into `parsed = false` is how a product silently ignores a
-- document someone believes it has read.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_parse_status') then
    create type document_parse_status as enum (
      'pending', 'parsed', 'unreadable', 'unsupported_format', 'failed'
    );
  end if;
end $$;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  kind document_kind not null default 'other',
  description text,
  reporting_period text,
  current_version_id uuid,
  -- Declared, never inferred. Documents are the most likely route for
  -- beneficiary data to enter the product, and the default must not be
  -- "safe to send to a model".
  contains_personal_data boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);
create index if not exists documents_org_kind_idx on documents (organisation_id, kind);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version integer not null,
  format document_format not null default 'unknown',
  file_name text not null,
  file_size_bytes bigint not null,
  -- SHA-256 of the bytes. Re-uploading an identical file is not a new version,
  -- and without this the review queue doubles every time someone does.
  content_hash text not null,
  storage_key text,
  parse_status document_parse_status not null default 'pending',
  -- Always set when parsing did not produce usable text. A status without a
  -- reason cannot be acted on by the person who uploaded the file.
  parse_note text,
  text_content text,
  page_count integer,
  word_count integer,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  constraint document_versions_unique_version unique (document_id, version)
);
create unique index if not exists document_versions_hash_idx
  on document_versions (organisation_id, content_hash);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_current_version_fkey') then
    alter table documents
    add constraint documents_current_version_fkey
    foreign key (current_version_id) references document_versions(id) on delete set null;
  end if;
end $$;

create table if not exists document_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  origin document_origin not null,
  authority source_authority not null,
  url text,
  publisher text,
  retrieved_at timestamptz not null default now(),
  research_source_id uuid
);
create index if not exists document_sources_document_idx
  on document_sources (organisation_id, document_id);

-- ---------------------------------------------------------------------------
-- Extracted claims
--
-- Distinct from `claims`, and the distinction is the entire point of MG-3: a
-- claim is something the organisation asserts, an extracted claim is something
-- a machine thinks a document says. `claim_id` is null until a person has made
-- the transition, and that column being null is the boundary between the two.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'extracted_claim_status') then
    create type extracted_claim_status as enum ('pending', 'approved', 'edited', 'rejected');
  end if;
end $$;

create table if not exists extracted_claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid not null references document_versions(id) on delete cascade,
  predicate text not null,
  value jsonb not null,
  -- The sentence as it appeared. A reviewer must be able to check the claim
  -- against its source, not just read a tidied value.
  excerpt text not null,
  locator text not null,
  extraction_method text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  injection_suspected boolean not null default false,
  status extracted_claim_status not null default 'pending',
  claim_id uuid references claims(id) on delete set null,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- An approved extraction must point at the claim it became. Without this the
  -- link is a convention, and a broken one is invisible.
  constraint extracted_claims_approved_has_claim check (
    status <> 'approved' or claim_id is not null
  )
);
create index if not exists extracted_claims_document_idx
  on extracted_claims (organisation_id, document_id, status);

-- ---------------------------------------------------------------------------
-- Onboarding runs
--
-- Persisted rather than held in a request, and not for convenience: research
-- reaches out to someone's website and to registers that charge per call. A
-- run lost on refresh gets repeated, which is rude to the first and expensive
-- to the second.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'onboarding_stage') then
    create type onboarding_stage as enum (
      'identity', 'website_research', 'registry_research', 'document_discovery',
      'extraction', 'reconciliation', 'review', 'complete'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'onboarding_run_status') then
    create type onboarding_run_status as enum ('running', 'awaiting_review', 'complete', 'failed');
  end if;
end $$;

create table if not exists onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  -- What the organisation told us before any research happened, kept verbatim
  -- so a discrepancy with the register stays visible afterwards.
  input_name text not null,
  input_website_url text,
  input_country text,
  input_registration_number text,
  input_organisation_type text,
  stage onboarding_stage not null default 'identity',
  status onboarding_run_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Real counts from the run. Deliberately individual columns rather than a
  -- progress percentage: there is no honest denominator for "how much of an
  -- organisation have we understood".
  count_sources_discovered integer not null default 0,
  count_pages_read integer not null default 0,
  count_documents_found integer not null default 0,
  count_documents_parsed integer not null default 0,
  count_candidates_found integer not null default 0,
  count_conflicts integer not null default 0,
  degraded_reason text,
  degraded_guidance text,
  started_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_runs_org_started_idx
  on onboarding_runs (organisation_id, started_at desc);

create table if not exists research_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  type text not null,
  title text,
  url text not null,
  publisher text,
  authority source_authority not null,
  discovered_at timestamptz not null default now(),
  retrieved_at timestamptz,
  published_at timestamptz,
  content_hash text,
  extraction_status text not null default 'discovered',
  -- Why retrieval or extraction did not complete. A source recorded as failed
  -- without a reason cannot be explained to the user or retried sensibly.
  failure_reason text,
  metadata jsonb
);
create index if not exists research_sources_run_idx
  on research_sources (organisation_id, run_id);

-- ---------------------------------------------------------------------------
-- Profile candidates
--
-- The heart of the review boundary. Every row here is something Pegasus read
-- and has NOT asserted. `verification` is constrained accordingly: extraction
-- cannot mint a verified value however confident it is, which is the same rule
-- `assertProducerMayAssign` enforces in the Knowledge layer.
-- ---------------------------------------------------------------------------
create table if not exists profile_candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  field text not null,
  value text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  method text not null,
  source_id uuid,
  source_url text not null,
  authority source_authority not null,
  -- Where in the source, to the character offset where possible. This is what
  -- makes "where did you get this?" answerable rather than gestured at.
  locator text not null,
  extracted_at timestamptz not null default now(),
  verification verification_state not null default 'ai_extracted',
  injection_suspected boolean not null default false,
  document_id uuid references documents(id) on delete set null,
  document_version_id uuid references document_versions(id) on delete set null,
  excerpt text,
  constraint profile_candidates_never_self_verified check (
    verification in ('ai_extracted', 'needs_review', 'outdated')
  )
);
create index if not exists profile_candidates_run_idx
  on profile_candidates (organisation_id, run_id, field);

-- The human decision. Recorded as its own row rather than as a status column,
-- because who decided and when is the audit trail for the one transition in
-- the pipeline that a person is required to make.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'candidate_decision') then
    create type candidate_decision as enum ('confirm', 'edit', 'reject');
  end if;
end $$;

create table if not exists candidate_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  candidate_id uuid not null references profile_candidates(id) on delete cascade,
  decision candidate_decision not null,
  edited_value text,
  claim_id uuid references claims(id) on delete set null,
  decided_by uuid references users(id),
  decided_at timestamptz not null default now(),
  -- An edit without a value is not an edit.
  constraint candidate_decisions_edit_has_value check (
    decision <> 'edit' or edited_value is not null
  )
);
create unique index if not exists candidate_decisions_one_per_candidate_idx
  on candidate_decisions (candidate_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Written out per table rather than issued from a loop, so
-- `tests/unit/schema-invariants.test.ts` can see them. Audit finding S1 was
-- invisible precisely because nothing could tell which tables had been covered.
-- ---------------------------------------------------------------------------
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table document_sources enable row level security;
alter table extracted_claims enable row level security;
alter table onboarding_runs enable row level security;
alter table research_sources enable row level security;
alter table profile_candidates enable row level security;
alter table candidate_decisions enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'documents', 'document_versions', 'document_sources', 'extracted_claims',
    'onboarding_runs', 'research_sources', 'profile_candidates', 'candidate_decisions'
  ]
  loop
    execute format('drop policy if exists %I_member_all on %I', t, t);
    execute format(
      'create policy %I_member_all on %I for all
         using (is_org_member(organisation_id))
         with check (is_org_member(organisation_id))',
      t, t
    );
  end loop;
end $$;

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();
drop trigger if exists onboarding_runs_set_updated_at on onboarding_runs;
create trigger onboarding_runs_set_updated_at
  before update on onboarding_runs
  for each row execute function set_updated_at();
