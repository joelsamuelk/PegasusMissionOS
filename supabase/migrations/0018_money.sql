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

create type fund_restriction as enum (
  'unrestricted', 'restricted', 'endowment', 'designated'
);

create type transaction_direction as enum ('income', 'expenditure');

create type transaction_source as enum (
  'bank_feed', 'accounting_system', 'manual', 'import'
);

create type allocation_method as enum (
  'direct', 'proportional', 'shared_cost', 'manual', 'suggested', 'unknown'
);

create type allocation_basis as enum (
  'direct', 'headcount', 'programme_expenditure', 'staff_time',
  'participant_volume', 'equal', 'custom_percentage', 'unallocated'
);

create type budget_status as enum ('draft', 'approved', 'superseded');

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
    execute format(
      'create policy %I_member_all on %I for all
         using (is_org_member(organisation_id))
         with check (is_org_member(organisation_id))',
      t, t
    );
  end loop;
end $$;

create trigger funds_set_updated_at
  before update on funds
  for each row execute function set_updated_at();
create trigger financial_transactions_set_updated_at
  before update on financial_transactions
  for each row execute function set_updated_at();
create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();
