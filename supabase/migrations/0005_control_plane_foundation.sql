-- Pegasus Control Plane foundation. This is a separate authorisation surface.
-- Browser roles receive no policies; server-side Control services mediate access.

create type internal_role as enum (
  'super_admin', 'operations', 'sales', 'customer_success',
  'support', 'product', 'finance', 'read_only'
);

create table internal_users (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  name text not null,
  role internal_role not null,
  status text not null check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table internal_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references internal_users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text not null,
  organisation_id uuid references organisations(id) on delete restrict,
  reason text,
  before_metadata jsonb,
  after_metadata jsonb,
  support_session_id uuid,
  request_id text not null,
  occurred_at timestamptz not null default now()
);
create index idx_internal_audit_time on internal_audit_events (occurred_at desc);
create index idx_internal_audit_org on internal_audit_events (organisation_id, occurred_at desc);

alter table internal_users enable row level security;
alter table internal_audit_events enable row level security;

revoke all on internal_users, internal_audit_events from anon, authenticated;
grant select on internal_users to authenticated;
grant select, insert on internal_audit_events to authenticated;

create or replace function is_active_internal_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from internal_users
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function internal_has_role(roles internal_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from internal_users
    where id = auth.uid() and status = 'active' and role = any(roles)
  );
$$;

-- An active internal user can see the team. Only super admins may change it.
-- Tenant membership is deliberately absent from every policy.
create policy internal_users_select on internal_users
  for select using (is_active_internal_user());

-- Audit is append-only. The actor must be the authenticated internal identity.
create policy internal_audit_select on internal_audit_events
  for select using (
    internal_has_role(array['super_admin', 'operations']::internal_role[])
  );
create policy internal_audit_insert on internal_audit_events
  for insert with check (is_active_internal_user() and actor_id = auth.uid());

-- Consequential team mutations and their audit records are one transaction.
create or replace function change_internal_user_role(
  target_user_id uuid,
  new_role internal_role,
  change_reason text,
  correlation_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare previous_role internal_role;
begin
  if not internal_has_role(array['super_admin']::internal_role[]) then
    raise exception 'internal_user:manage capability required';
  end if;
  if nullif(trim(change_reason), '') is null then raise exception 'reason required'; end if;
  select role into strict previous_role from internal_users where id = target_user_id for update;
  if target_user_id = auth.uid() and previous_role = 'super_admin' and new_role <> 'super_admin'
     and (select count(*) from internal_users where role = 'super_admin' and status = 'active') = 1 then
    raise exception 'final active super admin cannot be changed';
  end if;
  update internal_users set role = new_role, updated_at = now() where id = target_user_id;
  insert into internal_audit_events(actor_id, action, target_type, target_id, reason, before_metadata, after_metadata, request_id)
  values (auth.uid(), 'internal_role.change', 'internal_user', target_user_id::text, change_reason,
    jsonb_build_object('role', previous_role), jsonb_build_object('role', new_role), correlation_id);
end;
$$;

create or replace function change_internal_user_status(
  target_user_id uuid,
  new_status text,
  change_reason text,
  correlation_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare previous_status text;
begin
  if not internal_has_role(array['super_admin']::internal_role[]) then
    raise exception 'internal_user:manage capability required';
  end if;
  if new_status not in ('invited', 'active', 'suspended') then raise exception 'invalid status'; end if;
  if nullif(trim(change_reason), '') is null then raise exception 'reason required'; end if;
  if target_user_id = auth.uid() and new_status <> 'active' then raise exception 'cannot suspend own account'; end if;
  select status into strict previous_status from internal_users where id = target_user_id for update;
  update internal_users set status = new_status, updated_at = now() where id = target_user_id;
  insert into internal_audit_events(actor_id, action, target_type, target_id, reason, before_metadata, after_metadata, request_id)
  values (auth.uid(), case when new_status = 'suspended' then 'internal_user.disable' else 'internal_user.status_change' end,
    'internal_user', target_user_id::text, change_reason, jsonb_build_object('status', previous_status),
    jsonb_build_object('status', new_status), correlation_id);
end;
$$;

revoke all on function change_internal_user_role(uuid, internal_role, text, text) from public;
revoke all on function change_internal_user_status(uuid, text, text, text) from public;
grant execute on function change_internal_user_role(uuid, internal_role, text, text) to authenticated;
grant execute on function change_internal_user_status(uuid, text, text, text) to authenticated;

comment on table internal_users is
  'Control Plane identities. Tenant membership never grants a row here.';
comment on table internal_audit_events is
  'Append-only internal administrative audit, written by server-side Control services.';
