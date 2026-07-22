-- Pegasus Mission OS: Row Level Security policies.
-- Isolation model: a user can only read or write records belonging to an
-- organisation they are an active member of. The `audit_events` table is
-- append-only (insert and select, never update or delete).

-- Helper: is the current user an active member of the given organisation?
create or replace function is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organisation_members m
    where m.organisation_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Helper: does the current user hold one of the given roles in the org?
create or replace function org_has_role(org uuid, roles member_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organisation_members m
    where m.organisation_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(roles)
  );
$$;

-- Users: a user can read their own row and the rows of people who share an
-- organisation with them.
create policy users_self_select on users
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from organisation_members me
      join organisation_members them
        on them.organisation_id = me.organisation_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = users.id
    )
  );
create policy users_self_update on users
  for update using (id = auth.uid());

-- Organisations: members can read; owners and administrators can update.
create policy orgs_select on organisations
  for select using (is_org_member(id));
create policy orgs_update on organisations
  for update using (org_has_role(id, array['owner','administrator']::member_role[]));

-- Organisation members: members can read the roster; owners/admins manage it.
create policy members_select on organisation_members
  for select using (is_org_member(organisation_id));
create policy members_write on organisation_members
  for all using (org_has_role(organisation_id, array['owner','administrator']::member_role[]))
  with check (org_has_role(organisation_id, array['owner','administrator']::member_role[]));

-- Standard organisation-owned tables: full access for active members.
-- (Column-level and role-level restrictions are enforced in the application
-- permission layer; RLS guarantees organisation isolation.)
do $$
declare
  t text;
  standard_tables text[] := array[
    'organisation_profiles', 'organisation_documents', 'funders',
    'funding_opportunities', 'opportunity_eligibility_criteria',
    'opportunity_questions', 'saved_opportunities', 'fit_assessments',
    'fit_assessment_factors', 'applications', 'application_questions',
    'application_answers', 'application_answer_versions', 'application_reviews',
    'grants', 'grant_payments', 'grant_conditions', 'grant_deliverables',
    'grant_reports', 'programmes', 'programme_grants', 'activities', 'outputs',
    'outcomes', 'indicators', 'indicator_measurements', 'evidence_items',
    'evidence_links', 'impact_reports', 'impact_report_sections', 'tasks',
    'comments', 'notifications', 'ai_generations'
  ];
begin
  foreach t in array standard_tables loop
    execute format(
      'create policy %I_member_all on %I for all using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));',
      t, t
    );
  end loop;
end $$;

-- Audit events: append-only. Members can read and insert, never update/delete.
create policy audit_select on audit_events
  for select using (is_org_member(organisation_id));
create policy audit_insert on audit_events
  for insert with check (is_org_member(organisation_id));
