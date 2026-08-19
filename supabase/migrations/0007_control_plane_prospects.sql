create table prospect_organisations (
  id uuid primary key default gen_random_uuid(), name text not null, website text,
  registration_identifier text, country text, organisation_type text,
  focus_areas text[] not null default '{}', size_indicators text[] not null default '{}',
  public_financial_indicators text[] not null default '{}', public_programme_indicators text[] not null default '{}',
  status text not null check (status in ('discovered','researching','researched','archived','converted')),
  owner_id uuid references internal_users(id), source text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table prospect_people (
  id uuid primary key default gen_random_uuid(), prospect_organisation_id uuid not null references prospect_organisations(id) on delete cascade,
  name text not null, role text, email text, phone text, source_url text,
  verification_state text not null check (verification_state in ('provided','needs_review','verified')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table prospect_research_sources (
  id uuid primary key, prospect_organisation_id uuid not null references prospect_organisations(id) on delete cascade,
  type text not null, title text, url text not null, publisher text,
  authority text not null check (authority in ('regulator','organisation','supporting','discovery')),
  retrieved_at timestamptz, extraction_status text not null, failure_reason text
);
create table prospect_facts (
  id uuid primary key, prospect_organisation_id uuid not null references prospect_organisations(id) on delete cascade,
  field text not null, value text not null, source_id uuid not null references prospect_research_sources(id) on delete cascade,
  source_url text not null, locator text not null, authority text not null,
  verification_state text not null, confidence numeric not null check (confidence between 0 and 1),
  extraction_method text not null, injection_suspected boolean not null default false,
  conflict_group text, extracted_at timestamptz not null
);
create index idx_prospects_status on prospect_organisations(status);
create index idx_people_prospect on prospect_people(prospect_organisation_id);
create index idx_sources_prospect on prospect_research_sources(prospect_organisation_id);
create index idx_facts_prospect on prospect_facts(prospect_organisation_id);

alter table prospect_organisations enable row level security;
alter table prospect_people enable row level security;
alter table prospect_research_sources enable row level security;
alter table prospect_facts enable row level security;
grant select, insert, update on prospect_organisations, prospect_people, prospect_research_sources, prospect_facts to authenticated;
create policy prospects_select on prospect_organisations for select using (is_active_internal_user());
create policy prospects_insert on prospect_organisations for insert with check (internal_has_role(array['super_admin','operations','sales']::internal_role[]));
create policy prospects_update on prospect_organisations for update using (internal_has_role(array['super_admin','operations','sales','customer_success']::internal_role[])) with check (internal_has_role(array['super_admin','operations','sales','customer_success']::internal_role[]));
create policy prospect_people_select on prospect_people for select using (is_active_internal_user());
create policy prospect_people_insert on prospect_people for insert with check (internal_has_role(array['super_admin','operations','sales','customer_success']::internal_role[]));
create policy prospect_people_update on prospect_people for update using (internal_has_role(array['super_admin','operations','sales','customer_success']::internal_role[])) with check (internal_has_role(array['super_admin','operations','sales','customer_success']::internal_role[]));
create policy prospect_sources_select on prospect_research_sources for select using (is_active_internal_user());
create policy prospect_facts_select on prospect_facts for select using (is_active_internal_user());

create or replace function replace_prospect_research(target_prospect_id uuid, source_rows jsonb, fact_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not internal_has_role(array['super_admin','operations','sales']::internal_role[]) then raise exception 'prospect:research capability required'; end if;
  if exists (select 1 from jsonb_array_elements(source_rows) row where row->>'prospect_organisation_id' <> target_prospect_id::text)
     or exists (select 1 from jsonb_array_elements(fact_rows) row where row->>'prospect_organisation_id' <> target_prospect_id::text) then
    raise exception 'cross-prospect research payload rejected';
  end if;
  delete from prospect_facts where prospect_organisation_id = target_prospect_id;
  delete from prospect_research_sources where prospect_organisation_id = target_prospect_id;
  insert into prospect_research_sources select * from jsonb_populate_recordset(null::prospect_research_sources, source_rows);
  insert into prospect_facts select * from jsonb_populate_recordset(null::prospect_facts, fact_rows);
  update prospect_organisations set status = 'researched', updated_at = now() where id = target_prospect_id;
end $$;
revoke all on function replace_prospect_research(uuid,jsonb,jsonb) from public;
grant execute on function replace_prospect_research(uuid,jsonb,jsonb) to authenticated;
