-- Pegasus Mission OS: the finance runtime.
--
-- MG-8. Build spec Slice E.
--
-- The governing constraint is what this migration does *not* do. Migration
-- `0018` created `funds`, `financial_transactions`, `financial_allocations`,
-- `budgets` and `budget_lines`, and none of them is altered here. The
-- calculation engine that reads them is untouched. What was missing was
-- everything before those tables: a record of the file the transactions came
-- from, the classification that was suggested, and who approved it.
--
-- The pipeline this completes:
--
--   upload -> statement -> transactions -> normalisation -> classification
--     -> review -> post -> allocate
--
-- Two of those steps are the reason the tables below exist rather than being
-- columns on `financial_transactions`.
--
--   **Classification is a candidate, not a value.** A suggested category that
--   lived on the transaction would be indistinguishable from a confirmed one
--   the moment it was written. `transaction_candidates` keeps them apart until
--   a person decides.
--
--   **An import is a thing that happened.** "Where did this transaction come
--   from?" and "did that statement import cleanly?" are both questions with
--   answers, and neither can be reconstructed from the transactions alone.

-- ---------------------------------------------------------------------------
-- An opening balance is a property of the fund, not a transaction
-- ---------------------------------------------------------------------------
--
-- Added here rather than in `0018` because the need only became visible once
-- the engine had a real ledger to run on. Modelling a balance brought forward
-- as an income transaction puts it inside the flow, and a burn rate computed
-- over a window containing it reports that income covers costs when it does
-- not. That is the most flattering possible error and it only surfaces when
-- somebody trusts the runway figure.

alter table funds
  add column if not exists opening_balance_minor_units bigint;

comment on column funds.opening_balance_minor_units is
  'What the fund held before the recorded ledger begins. Part of the balance '
  'and deliberately not part of the flow: an opening reserve counted as income '
  'makes the burn rate report that the core covers itself.';

create type financial_import_status as enum (
  'parsing', 'awaiting_review', 'posted', 'rejected', 'failed'
);

create type statement_format as enum ('csv', 'ofx', 'xlsx', 'manual');

create table if not exists financial_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  file_name text,
  format statement_format not null default 'csv',
  status financial_import_status not null default 'parsing',

  -- The account the statement covers, where the organisation records accounts.
  account_reference text,
  currency text not null default 'GBP',

  -- What each column was taken to mean. Stored so a mis-detection can be
  -- diagnosed after the fact rather than argued about.
  detected_columns jsonb not null default '[]'::jsonb,

  -- Rows the parser could not read, by number and with the reason. Never
  -- silently dropped: an import that skipped four rows would reconcile to the
  -- wrong total and nobody would know which four.
  problems jsonb not null default '[]'::jsonb,

  row_count integer not null default 0,
  posted_count integer not null default 0,
  duplicate_count integer not null default 0,

  -- `dd/mm` and `mm/dd` are indistinguishable when every day is twelve or
  -- below. The file cannot resolve it; only the person who downloaded it can.
  date_format_ambiguous boolean not null default false,

  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz
);

create index if not exists financial_imports_org_idx
  on financial_imports (organisation_id, uploaded_at desc);

create type classification_confidence as enum ('certain', 'probable', 'possible');

create table if not exists transaction_candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  import_id uuid not null references financial_imports(id) on delete cascade,

  row_number integer not null,

  -- The normalised transaction, before it is posted. Held here rather than in
  -- `financial_transactions` so that an unreviewed import cannot be mistaken
  -- for a ledger.
  transaction_date date not null,
  description text not null,
  amount_minor_units bigint not null,
  currency text not null,
  direction transaction_direction not null,
  counterparty text,
  reference text,

  -- What was suggested, and why. The evidence is not decoration: a reviewer
  -- approving forty transactions needs to see why each was suggested rather
  -- than approving forty assertions.
  suggested_category text,
  suggested_fund_id uuid references funds(id) on delete set null,
  suggested_grant_id uuid references grants(id) on delete set null,
  suggested_restricted boolean,
  confidence classification_confidence not null,
  evidence jsonb not null default '[]'::jsonb,

  -- Forced true above the materiality threshold however confident the match.
  -- A large payment attached to the wrong grant is a figure a funder reads.
  requires_approval boolean not null default true,

  duplicate_of uuid references financial_transactions(id) on delete set null,
  duplicate_reason text,

  posted_transaction_id uuid references financial_transactions(id) on delete set null,
  decided_by uuid references users(id),
  decided_at timestamptz,

  unique (import_id, row_number)
);

create index if not exists transaction_candidates_pending_idx
  on transaction_candidates (organisation_id, import_id)
  where posted_transaction_id is null and decided_at is null;

-- ---------------------------------------------------------------------------
-- Periods and reconciliation
-- ---------------------------------------------------------------------------

create table if not exists financial_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  label text not null,
  starts_on date not null,
  ends_on date not null,

  -- A closed period is one whose figures have been reported. Posting into it
  -- afterwards changes a number somebody has already sent to a funder, which
  -- is why closing is a state rather than a convention.
  closed boolean not null default false,
  closed_by uuid references users(id),
  closed_at timestamptz,

  constraint financial_periods_ordered check (ends_on >= starts_on),
  unique (organisation_id, label)
);

create table if not exists reconciliations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  period_id uuid references financial_periods(id) on delete set null,

  as_at date not null,
  -- What the bank says.
  statement_balance_minor_units bigint not null,
  -- What Pegasus says, from the transactions recorded.
  ledger_balance_minor_units bigint not null,
  currency text not null,

  -- Stored rather than computed on read, so a reconciliation that balanced in
  -- March still shows as balanced after a later correction changes the ledger.
  difference_minor_units bigint not null,
  note text,

  reconciled_by uuid references users(id),
  reconciled_at timestamptz not null default now()
);

create index if not exists reconciliations_org_idx
  on reconciliations (organisation_id, as_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table financial_imports enable row level security;
alter table transaction_candidates enable row level security;
alter table financial_periods enable row level security;
alter table reconciliations enable row level security;

create policy financial_imports_member_all on financial_imports for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy transaction_candidates_member_all on transaction_candidates for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy financial_periods_member_all on financial_periods for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A reconciliation is a statement that the books balanced on a date. One that
-- can be edited afterwards is not evidence of anything.
create policy reconciliations_member_read on reconciliations for select
  using (is_org_member(organisation_id));
create policy reconciliations_member_insert on reconciliations for insert
  with check (is_org_member(organisation_id));

comment on table transaction_candidates is
  'Classification before it is a value. A suggested category living on the '
  'transaction would be indistinguishable from a confirmed one the moment it '
  'was written.';
comment on column financial_imports.problems is
  'Rows the parser could not read, by number and with the reason. An import '
  'that silently skipped rows would reconcile to the wrong total.';
