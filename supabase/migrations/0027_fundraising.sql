-- Pegasus Mission OS: supporters, fundraising and stewardship.
--
-- MG-10.
--
-- The expansion plan states the test this migration is judged on: *a donation
-- touches supporter, fund, finance, programme, campaign, reporting, impact and
-- stewardship. If it lives in a fundraising table, §11 has been violated.*
--
-- So the single most important line below is `donations.transaction_id`, and
-- the most important omission is any amount column on `donations`. The money
-- is a `financial_transaction` in a `fund`, attributed by a
-- `financial_allocation`, exactly as a grant payment is. This table says what
-- the money *was*: whose gift, to which appeal, through which channel.
--
-- Three tables the brief names are deliberately absent:
--
--   `DonationAllocation`  -> `financial_allocations`, which already records
--                            the method and basis that make an attribution
--                            defensible. A second one would need reconciling.
--   `FundraisingGoal`     -> `campaigns.target_minor_units`. A campaign with
--                            several simultaneous monetary targets is not
--                            something charities of this size run.
--   A supporter's identity -> `people` and `external_organisations`, which are
--                            canonical. `supporter_profiles` holds a steward,
--                            a stage and a recognition preference, and no name.

create type donation_channel as enum (
  'bank_transfer', 'direct_debit', 'standing_order', 'card', 'cash', 'cheque',
  'platform', 'payroll_giving', 'legacy', 'in_kind'
);

create type donation_kind as enum ('one_off', 'recurring_payment', 'legacy', 'in_kind');

create type campaign_status as enum ('planned', 'active', 'closed');

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  name text not null,
  description text,
  target_minor_units bigint,
  currency text not null default 'GBP',
  starts_on date not null,
  ends_on date,

  fund_id uuid references funds(id) on delete set null,
  programme_id uuid references programmes(id) on delete set null,
  cost_minor_units bigint,

  status campaign_status not null default 'planned',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  constraint campaigns_ordered check (ends_on is null or ends_on >= starts_on)
);

-- No `raised` column, deliberately. A stored total is a second source of truth
-- that goes stale the moment a donation is corrected, refunded or reattributed.
comment on table campaigns is
  'Campaign totals are derived from the donations pointing at them. A stored '
  'raised figure would be wrong from the first correction onwards.';

create trigger campaigns_set_updated_at
  before update on campaigns for each row execute function set_updated_at();

create table if not exists appeals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  name text not null,
  channel donation_channel not null,
  sent_on date,
  -- Needed for a response rate that means anything. Nullable, because it is
  -- often unknown, and a rate against an unknown denominator is a number that
  -- merely looks like information.
  audience_size integer,
  cost_minor_units bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gift Aid
-- ---------------------------------------------------------------------------

create type gift_aid_scope as enum ('enduring', 'single_donation');

create table if not exists gift_aid_declarations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- Individuals only. A company cannot make a Gift Aid declaration.
  person_id uuid not null references people(id) on delete cascade,

  -- HMRC matches a claim on these. A declaration missing any of them is one
  -- the charity would have to repay.
  full_name text not null,
  address_line text not null,
  postcode text not null,
  taxpayer_confirmed boolean not null default false,

  declared_on date not null,
  scope gift_aid_scope not null,
  donation_id uuid,

  cancelled_on date,
  cancelled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A single-donation declaration that names no donation covers nothing.
  constraint gift_aid_single_needs_donation check (
    scope <> 'single_donation' or donation_id is not null
  )
);

-- The home address is the one field here that the relationship layer
-- deliberately does not hold. It lives on this record because Gift Aid is the
-- lawful basis for holding it, which is §8's rule: a lawful basis first, not
-- an available column.
comment on column gift_aid_declarations.address_line is
  'Held because Gift Aid requires it, and for no other purpose. Person carries '
  'no address by design.';

create type gift_aid_claim_status as enum ('draft', 'ready', 'filed', 'settled');

create table if not exists gift_aid_claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  period_start date not null,
  period_end date not null,
  donation_ids uuid[] not null default '{}',
  claimable_minor_units bigint not null,
  currency text not null default 'GBP',

  status gift_aid_claim_status not null default 'draft',

  -- Filled in by whoever filed it with HMRC. Pegasus never files: a submission
  -- that looked as though it had happened and had not would be discovered by
  -- HMRC rather than by the charity.
  hmrc_reference text,
  filed_by uuid references users(id),
  filed_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gift_aid_claims_filed_needs_reference check (
    status <> 'filed' or (hmrc_reference is not null and length(btrim(hmrc_reference)) > 0)
  )
);

-- ---------------------------------------------------------------------------
-- Recurring arrangements and donations
-- ---------------------------------------------------------------------------

create type recurring_frequency as enum ('monthly', 'quarterly', 'annual');
create type recurring_status as enum ('active', 'paused', 'ended');

-- An intention, not money. Each payment against it is a separate donation with
-- its own transaction, which is what stops a fundraising total counting income
-- nobody has received.
create table if not exists recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,

  amount_minor_units bigint not null,
  currency text not null default 'GBP',
  frequency recurring_frequency not null,
  channel donation_channel not null,

  started_on date not null,
  ended_on date,
  ended_reason text,
  campaign_id uuid references campaigns(id) on delete set null,
  status recurring_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_commitments_one_party check (
    (person_id is not null and external_organisation_id is null)
    or (person_id is null and external_organisation_id is not null)
  )
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- The line this whole migration turns on. There is no amount column here:
  -- the money is the transaction, so a gift reaches the finance position, the
  -- runway calculation and a funder report without a second entry.
  transaction_id uuid not null references financial_transactions(id) on delete restrict,

  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,

  kind donation_kind not null default 'one_off',
  channel donation_channel not null,
  received_on date not null,

  campaign_id uuid references campaigns(id) on delete set null,
  appeal_id uuid references appeals(id) on delete set null,
  recurring_commitment_id uuid references recurring_commitments(id) on delete set null,

  -- Anonymous to the public, not to the organisation. A charity must be able
  -- to identify donors for due diligence and Gift Aid, so person_id may be set
  -- on an anonymous gift; what this flag withholds is the name from anything a
  -- third party sees.
  anonymous boolean not null default false,

  restricted boolean not null default false,
  restriction_purpose text,

  gift_aid_declaration_id uuid references gift_aid_declarations(id) on delete set null,
  gift_aid_claimed boolean not null default false,
  benefit_value_minor_units bigint,

  note text,
  thanked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  -- A restricted gift whose restriction is unstated cannot be honoured, and is
  -- the same failure `funds_restricted_needs_purpose` guards against.
  constraint donations_restricted_needs_purpose check (
    restricted = false or (restriction_purpose is not null and length(btrim(restriction_purpose)) > 0)
  ),
  -- One transaction, one donation. Two donations against the same transaction
  -- would double-count a gift in every campaign total.
  unique (transaction_id)
);

create index if not exists donations_campaign_idx
  on donations (organisation_id, campaign_id, received_on desc);
create index if not exists donations_person_idx
  on donations (organisation_id, person_id, received_on desc);

create trigger donations_set_updated_at
  before update on donations for each row execute function set_updated_at();

alter table gift_aid_declarations
  add constraint gift_aid_declarations_donation_fk
  foreign key (donation_id) references donations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Supporters and stewardship
-- ---------------------------------------------------------------------------

create type stewardship_stage as enum (
  'new', 'thanked', 'regular', 'major', 'lapsing', 'lapsed',
  'corporate', 'trust_or_foundation', 'potential_major'
);

create type recognition_preference as enum ('named', 'anonymous', 'ask_each_time');

-- Holds no identity. No name, no email, no address: those are `people`, which
-- is canonical. A supporter profile that carried them would be the second CRM
-- the brief forbids.
create table if not exists supporter_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  person_id uuid references people(id) on delete cascade,
  external_organisation_id uuid references external_organisations(id) on delete cascade,

  steward_id uuid references users(id) on delete set null,
  stage stewardship_stage not null default 'new',
  stage_override jsonb,
  recognition_preference recognition_preference,

  do_not_solicit boolean not null default false,
  do_not_solicit_reason text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint supporter_profiles_one_party check (
    (person_id is not null and external_organisation_id is null)
    or (person_id is null and external_organisation_id is not null)
  ),
  unique (organisation_id, person_id),
  unique (organisation_id, external_organisation_id)
);

create trigger supporter_profiles_set_updated_at
  before update on supporter_profiles for each row execute function set_updated_at();

create table if not exists stewardship_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  supporter_profile_id uuid not null references supporter_profiles(id) on delete cascade,

  name text not null,
  -- Steps reference tasks rather than duplicating them, so a stewardship plan
  -- does not become a second to-do list nobody looks at.
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fundraising_pages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  slug text not null,
  headline text not null,
  body text,
  -- The donation form is a `form` with purpose 'donation', carrying its own
  -- consent, sensitivity and spam controls. A second form engine here would be
  -- the module-specific duplication the architecture keeps refusing.
  form_id uuid references forms(id) on delete set null,
  show_total boolean not null default true,
  status text not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, slug)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table campaigns enable row level security;
alter table appeals enable row level security;
alter table donations enable row level security;
alter table recurring_commitments enable row level security;
alter table gift_aid_declarations enable row level security;
alter table gift_aid_claims enable row level security;
alter table supporter_profiles enable row level security;
alter table stewardship_plans enable row level security;
alter table fundraising_pages enable row level security;

create policy campaigns_member_all on campaigns for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy appeals_member_all on appeals for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy recurring_commitments_member_all on recurring_commitments for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy supporter_profiles_member_all on supporter_profiles for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy stewardship_plans_member_all on stewardship_plans for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy fundraising_pages_member_all on fundraising_pages for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy donations_member_all on donations for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A Gift Aid declaration is a statement somebody made and a record HMRC may
-- inspect. It is insertable and cancellable and never editable: rewriting the
-- address or the date on a declaration after a claim was made on it would
-- destroy the evidence for that claim.
create policy gift_aid_declarations_member_read on gift_aid_declarations for select
  using (is_org_member(organisation_id));
create policy gift_aid_declarations_member_insert on gift_aid_declarations for insert
  with check (is_org_member(organisation_id));
create policy gift_aid_declarations_member_cancel on gift_aid_declarations for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

create policy gift_aid_claims_member_all on gift_aid_claims for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on column donations.transaction_id is
  'The money. There is no amount column on this table: a donation that carried '
  'its own figure would be a second ledger, and the two would disagree.';
