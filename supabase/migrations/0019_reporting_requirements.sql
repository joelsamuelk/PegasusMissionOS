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
